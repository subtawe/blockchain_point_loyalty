import { expect } from "chai";
import hre from "hardhat";
import { readDeployedPointAddress } from "../scripts/pointDeployment.js";

const { ethers, networkHelpers } = await hre.network.connect();

async function deployProxyFixture() {
    const [owner, holder] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("UpgradablePointFactory");
    const implementation = await Factory.deploy();
    const proxy = await ethers.deployContract("AppProxy", [
        await implementation.getAddress(), Factory.interface.encodeFunctionData("initialize"),
    ]);
    const factory = await ethers.getContractAt("UpgradablePointFactory", await proxy.getAddress());
    const startDate = (await networkHelpers.time.latest()) + 100;
    const expireDate = startDate + 1000;
    return { owner, holder, implementation, factory, startDate, expireDate };
}

describe("UpgradablePointFactory: v3 identity deployment", function () {
    it("initializes only the proxy and advertises the new ABI version", async function () {
        const { factory, implementation, owner } = await networkHelpers.loadFixture(deployProxyFixture);
        expect(await factory.owner()).to.equal(owner.address);
        expect(await factory.pointTokenVersion()).to.equal(3);
        expect(await factory.getDeployedTokensCount()).to.equal(0);
        await expect(factory.initialize()).to.be.revertedWithCustomError(factory, "InvalidInitialization");
        await expect(implementation.initialize()).to.be.revertedWithCustomError(implementation, "InvalidInitialization");
    });

    it("deploys an empty identity and emits TokenDeployed at the proxy address", async function () {
        const { factory, owner, holder } = await networkHelpers.loadFixture(deployProxyFixture);
        const tx = await factory.deployPointToken("Points", "PTS");
        const address = await factory.deployedTokens(0);
        await expect(tx).to.emit(factory, "TokenDeployed").withArgs(address, "Points", "PTS", owner.address);
        const receipt = await tx.wait();
        if (!receipt) throw new Error("Expected a deployment receipt");
        expect(receipt.status).to.equal(1);
        expect(readDeployedPointAddress(receipt, factory.interface, await factory.getAddress())).to.equal(address);
        const token = await ethers.getContractAt("NewPointToken", address);
        expect(await token.owner()).to.equal(owner.address);
        expect(await token.state()).to.equal(0);
        expect(await token.business()).to.equal(0);
        expect(await token.totalSupply()).to.equal(0);
        expect(await token.balanceOf(holder.address)).to.equal(0);
        expect(await token.availableBalanceOf(holder.address)).to.equal(0);
    });

    it("rolls back invalid configuration and issuance without mutating the registry", async function () {
        const { factory, owner, holder, startDate, expireDate } = await networkHelpers.loadFixture(deployProxyFixture);
        await factory.deployPointToken("Draft", "DFT");
        const address = await factory.deployedTokens(0);
        const token = await ethers.getContractAt("NewPointToken", address);
        const coder = ethers.AbiCoder.defaultAbiCoder();
        await expect(token.configureBusiness(1, coder.encode(["uint256", "uint256"], [expireDate, startDate])))
            .to.be.revertedWithCustomError(token, "InvalidDateRange");
        await expect(token.configureBusiness(1, coder.encode(["uint256", "uint256"], [0, 1])))
            .to.be.revertedWithCustomError(token, "PointExpired");
        expect(await token.state()).to.equal(0);
        expect(await token.startDate()).to.equal(0);
        expect(await token.expireDate()).to.equal(0);
        await token.configureBusiness(1, coder.encode(["uint256", "uint256"], [startDate, expireDate]));
        await expect(token.mint(ethers.ZeroAddress, 1, ethers.id("bad-recipient")))
            .to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        expect(await token.totalSupply()).to.equal(0);
        expect(await factory.getDeployedTokensCount()).to.equal(1);
        expect(await factory.deployedTokens(0)).to.equal(address);
        await expect(factory.connect(holder).deployPointToken("Bad", "BAD"))
            .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
        await expect(token.connect(holder).mintInventory(owner.address, 1, ethers.id("denied-stock")))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("preserves owner, registered token code, configuration and balances across a UUPS upgrade", async function () {
        const { factory, owner, holder, startDate, expireDate } = await networkHelpers.loadFixture(deployProxyFixture);
        await factory.deployPointToken("First", "ONE");
        const first = await factory.deployedTokens(0);
        const token = await ethers.getContractAt("NewPointToken", first);
        await token.configureBusiness(1, ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "uint256"], [startDate, expireDate],
        ));
        await token.mint(holder.address, 1000, ethers.id("upgrade-issue"));
        const tokenCode = await ethers.provider.getCode(first);
        const v2 = await ethers.deployContract("UpgradablePointFactoryV2");
        await factory.upgradeToAndCall(await v2.getAddress(), "0x");
        const upgraded = await ethers.getContractAt("UpgradablePointFactoryV2", await factory.getAddress());
        expect(await upgraded.version()).to.equal("v2");
        expect(await upgraded.owner()).to.equal(owner.address);
        expect(await upgraded.getDeployedTokensCount()).to.equal(1);
        expect(await upgraded.deployedTokens(0)).to.equal(first);
        expect(await ethers.provider.getCode(first)).to.equal(tokenCode);
        expect(await token.owner()).to.equal(owner.address);
        expect(await token.business()).to.equal(1);
        expect(await token.getPointDates()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        expect(await token.balanceOf(holder.address)).to.equal(1000);
        await upgraded.deployPointToken("Second", "TWO");
        expect(await upgraded.getDeployedTokensCount()).to.equal(2);
        expect(await upgraded.deployedTokens(0)).to.equal(first);
        const second = await ethers.getContractAt("NewPointToken", await upgraded.deployedTokens(1));
        expect(await second.state()).to.equal(0);
        expect(await second.totalSupply()).to.equal(0);
    });

    it("prevents non-owner upgrades", async function () {
        const { factory, holder } = await networkHelpers.loadFixture(deployProxyFixture);
        const v2 = await ethers.deployContract("UpgradablePointFactoryV2");
        await expect(factory.connect(holder).upgradeToAndCall(await v2.getAddress(), "0x"))
            .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("rejects removed dated deployment selectors without registry changes", async function () {
        const { factory, owner, holder, startDate, expireDate } = await networkHelpers.loadFixture(deployProxyFixture);
        const legacy = new ethers.Interface([
            "function deployPointToken(string,string,uint256,uint256,uint256,address)",
        ]);
        await expect(owner.sendTransaction({ to: await factory.getAddress(),
            data: legacy.encodeFunctionData("deployPointToken", ["Old", "OLD", startDate, expireDate, 1, holder.address]),
        })).to.revert(ethers);
        expect(await factory.getDeployedTokensCount()).to.equal(0);
    });
});
