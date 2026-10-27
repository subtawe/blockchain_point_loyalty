import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();

async function deployFixture() {
    const [owner, holder, recipient, spender] = await ethers.getSigners();
    const factory = await ethers.deployContract("PointTokenFactory");
    const startDate = (await networkHelpers.time.latest()) + 100;
    const expireDate = startDate + 1000;
    await factory.deployPointToken("Loyalty Points", "LYT");
    const address = await factory.deployedTokens(0);
    const token = await ethers.getContractAt("PointToken", address);
    await token.configureBusiness(1, ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256"], [startDate, expireDate],
    ));
    await token.mint(holder.address, 1000, ethers.id("fixture-issue"));
    return { owner, holder, recipient, spender, factory, token, startDate, expireDate };
}

async function activeFixture() {
    const context = await deployFixture();
    await networkHelpers.time.increaseTo(context.startDate);
    return context;
}

async function expiredFixture() {
    const context = await deployFixture();
    await context.token.connect(context.holder).approve(context.spender.address, 400);
    await networkHelpers.time.increaseTo(context.expireDate + 1);
    return context;
}

describe("PointToken: v3 identity and business A validity", function () {
    it("configures one immutable period after identity creation with the existing ownership model", async function () {
        const { factory, token, owner, holder, startDate, expireDate } = await networkHelpers.loadFixture(deployFixture);
        expect(await factory.pointTokenVersion()).to.equal(3);
        expect(await factory.owner()).to.equal(owner.address);
        expect(await factory.getDeployedTokensCount()).to.equal(1);
        expect(await token.owner()).to.equal(owner.address);
        expect(await token.name()).to.equal("Loyalty Points");
        expect(await token.symbol()).to.equal("LYT");
        expect(await token.decimals()).to.equal(18);
        expect(await token.getPointDates()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        expect(await token.startDate()).to.equal(startDate);
        expect(await token.expireDate()).to.equal(expireDate);
        expect(await token.balanceOf(holder.address)).to.equal(1000);
        expect(await token.totalSupply()).to.equal(1000);
    });

    it("emits identity only and creates an empty Draft owned by the caller", async function () {
        const { factory, owner, holder } = await networkHelpers.loadFixture(deployFixture);
        const tx = await factory.deployPointToken("Second", "SEC");
        const address = await factory.deployedTokens(1);
        await expect(tx).to.emit(factory, "TokenDeployed").withArgs(address, "Second", "SEC", owner.address);
        const draft = await ethers.getContractAt("PointToken", address);
        expect(await draft.owner()).to.equal(owner.address);
        expect(await draft.state()).to.equal(0);
        expect(await draft.business()).to.equal(0);
        expect(await draft.totalSupply()).to.equal(0);
        expect(await draft.balanceOf(holder.address)).to.equal(0);
        await expect(draft.mint(holder.address, 1, ethers.id("draft-issue")))
            .to.be.revertedWithCustomError(draft, "NotConfigured");
        expect(address).not.to.equal(await factory.deployedTokens(0));
    });

    const invalidDates: [string, (now: number) => [number, number]][] = [
        ["equal dates", (now: number) => [now + 100, now + 100]],
        ["reversed dates", (now: number) => [now + 200, now + 100]],
    ];
    for (const [label, dates] of invalidDates) {
        it(`rejects ${label} atomically while retaining the registered Draft`, async function () {
            const { factory } = await networkHelpers.loadFixture(deployFixture);
            await factory.deployPointToken("Draft", "DFT");
            const token = await ethers.getContractAt("PointToken", await factory.deployedTokens(1));
            const [start, end] = dates(await networkHelpers.time.latest());
            const config = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [start, end]);
            await expect(token.configureBusiness(1, config)).to.be.revertedWithCustomError(token, "InvalidDateRange");
            expect(await factory.getDeployedTokensCount()).to.equal(2);
            expect(await token.state()).to.equal(0);
            expect(await token.startDate()).to.equal(0);
            expect(await token.expireDate()).to.equal(0);
            expect(await token.totalSupply()).to.equal(0);
        });
    }

    it("rejects configuration at or after expiry while direct identity construction stays Draft", async function () {
        const { owner } = await networkHelpers.loadFixture(deployFixture);
        const token = await ethers.deployContract("PointToken", ["Draft", "DFT", owner.address]);
        const now = await networkHelpers.time.latest();
        for (const expiry of [now, now - 1]) {
            const config = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [now - 10, expiry]);
            await expect(token.configureBusiness.staticCall(1, config)).to.be.revertedWithCustomError(token, "PointExpired");
        }
        expect(await token.state()).to.equal(0);
        expect(await token.totalSupply()).to.equal(0);
    });

    it("allows a past startDate and rolls back invalid separate issuance without consuming its ID", async function () {
        const { factory, holder } = await networkHelpers.loadFixture(deployFixture);
        await factory.deployPointToken("Active", "ACT");
        const token = await ethers.getContractAt("PointToken", await factory.deployedTokens(1));
        const now = await networkHelpers.time.latest();
        await token.configureBusiness(1, ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256", "uint256"], [now - 10, now + 100],
        ));
        const issueId = ethers.id("retry-issue");
        await expect(token.mint(ethers.ZeroAddress, 25, issueId)).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        expect(await factory.getDeployedTokensCount()).to.equal(2);
        expect(await token.totalSupply()).to.equal(0);
        await token.mint(holder.address, 25, issueId);
        expect(await token.balanceOf(holder.address)).to.equal(25);
        expect(await token.availableBalanceOf(holder.address)).to.equal(25);
    });

    it("permits pre-minting while distinguishing Pending from Expired", async function () {
        const { token, holder, startDate } = await networkHelpers.loadFixture(deployFixture);
        await token.mint(holder.address, 100, ethers.id("pending-issue"));
        await networkHelpers.time.increaseTo(startDate - 1);
        expect(await token.validityStatus()).to.equal(0);
        expect(await token.isActive()).to.equal(false);
        expect(await token.isExpired()).to.equal(false);
        expect(await token.balanceOf(holder.address)).to.equal(1100);
        expect(await token.availableBalanceOf(holder.address)).to.equal(0);
        expect(await token.availableSupply()).to.equal(0);
        await expect(token.connect(holder).transfer.staticCall(holder.address, 1))
            .to.be.revertedWithCustomError(token, "PointNotStarted");
        await expect(token.burn.staticCall(holder.address, 1, ethers.id("pending-redeem")))
            .to.be.revertedWithCustomError(token, "PointNotStarted");
    });

    it("starts availability and permits a transfer at exactly startDate", async function () {
        const { token, holder, recipient, startDate } = await networkHelpers.loadFixture(deployFixture);
        await networkHelpers.time.setNextBlockTimestamp(startDate);
        await expect(token.connect(holder).transfer(recipient.address, 100))
            .to.emit(token, "Transfer").withArgs(holder.address, recipient.address, 100);
        expect(await token.validityStatus()).to.equal(1);
        expect(await token.availableBalanceOf(holder.address)).to.equal(900);
        expect(await token.availableSupply()).to.equal(1000);
    });

    const actions: ("transfer" | "transferFrom" | "mint" | "burn")[] = ["transfer", "transferFrom", "mint", "burn"];
    for (const action of actions) {
        it(`allows ${action} at exactly expireDate`, async function () {
            const { token, holder, recipient, spender, expireDate } = await networkHelpers.loadFixture(activeFixture);
            await token.connect(holder).approve(spender.address, 200);
            await networkHelpers.time.setNextBlockTimestamp(expireDate);
            const tx = action === "transfer" ? token.connect(holder).transfer(recipient.address, 100)
                : action === "transferFrom" ? token.connect(spender).transferFrom(holder.address, recipient.address, 100)
                : action === "mint" ? token.mint(holder.address, 100, ethers.id("boundary-issue"))
                : token.burn(holder.address, 100, ethers.id("boundary-redeem"));
            await expect(tx).to.emit(token, "Transfer");
            expect(await token.isActive()).to.equal(true);
            expect(await token.isExpired()).to.equal(false);
            expect(await token.expireDate()).to.equal(expireDate);
        });
    }

    for (const action of actions) {
        it(`rejects ${action} at expireDate + 1 with balances and allowance intact`, async function () {
            const { token, holder, recipient, spender, expireDate } = await networkHelpers.loadFixture(activeFixture);
            await token.connect(holder).approve(spender.address, 400);
            await networkHelpers.time.setNextBlockTimestamp(expireDate + 1);
            const tx = action === "transfer" ? token.connect(holder).transfer(recipient.address, 100)
                : action === "transferFrom" ? token.connect(spender).transferFrom(holder.address, recipient.address, 100)
                : action === "mint" ? token.mint(holder.address, 100, ethers.id("expired-issue"))
                : token.burn(holder.address, 100, ethers.id("expired-redeem"));
            await expect(tx).to.be.revertedWithCustomError(token, "PointExpired");
            expect(await token.balanceOf(holder.address)).to.equal(1000);
            expect(await token.balanceOf(recipient.address)).to.equal(0);
            expect(await token.totalSupply()).to.equal(1000);
            expect(await token.allowance(holder.address, spender.address)).to.equal(400);
        });
    }

    it("expires without a transaction while retaining the ledger and supply", async function () {
        const { token, holder, expireDate } = await networkHelpers.loadFixture(activeFixture);
        await networkHelpers.time.increaseTo(expireDate - 1);
        expect(await token.availableBalanceOf(holder.address)).to.equal(1000);
        await networkHelpers.time.increaseTo(expireDate + 1);
        expect(await token.validityStatus()).to.equal(2);
        expect(await token.isExpired()).to.equal(true);
        expect(await token.isActive()).to.equal(false);
        expect(await token.availableBalanceOf(holder.address)).to.equal(0);
        expect(await token.availableSupply()).to.equal(0);
        expect(await token.balanceOf(holder.address)).to.equal(1000);
        expect(await token.totalSupply()).to.equal(1000);
    });

    it("gives late mints and transfers the same expiry without extending it", async function () {
        const { token, holder, recipient, expireDate } = await networkHelpers.loadFixture(activeFixture);
        await networkHelpers.time.increaseTo(expireDate - 10);
        await token.mint(holder.address, 250, ethers.id("late-issue"));
        await token.connect(holder).transfer(recipient.address, 200);
        expect(await token.totalSupply()).to.equal(1250);
        expect(await token.expireDate()).to.equal(expireDate);
        await networkHelpers.time.increaseTo(expireDate + 1);
        expect(await token.availableBalanceOf(holder.address)).to.equal(0);
        expect(await token.availableBalanceOf(recipient.address)).to.equal(0);
        expect(await token.balanceOf(recipient.address)).to.equal(200);
    });

    it("conserves balances/supply on transfer, reduces supply on burn, and respects allowances", async function () {
        const { token, holder, recipient, spender } = await networkHelpers.loadFixture(activeFixture);
        await token.connect(holder).approve(spender.address, 400);
        await token.connect(spender).transferFrom(holder.address, recipient.address, 300);
        expect(await token.allowance(holder.address, spender.address)).to.equal(100);
        await token.burn(recipient.address, 50, ethers.id("conservation-redeem"));
        expect(await token.totalSupply()).to.equal(950);
        expect((await token.balanceOf(holder.address)) + (await token.balanceOf(recipient.address))).to.equal(950);
        await token.connect(holder).approve(spender.address, ethers.MaxUint256);
        await token.connect(spender).transferFrom(holder.address, recipient.address, 10);
        expect(await token.allowance(holder.address, spender.address)).to.equal(ethers.MaxUint256);
    });

    it("rolls back allowance when a transfer exceeds the holder's balance", async function () {
        const { token, holder, recipient, spender } = await networkHelpers.loadFixture(activeFixture);
        await token.connect(holder).approve(spender.address, 2000);
        await expect(token.connect(spender).transferFrom(holder.address, recipient.address, 1500))
            .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        expect(await token.allowance(holder.address, spender.address)).to.equal(2000);
        await expect(token.connect(spender).transferFrom(holder.address, recipient.address, 2001))
            .to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("allows zero/self transfers only during Active and preserves supply", async function () {
        const { token, holder, recipient } = await networkHelpers.loadFixture(activeFixture);
        await token.connect(holder).transfer(holder.address, 200);
        await token.connect(holder).transfer(recipient.address, 0);
        expect(await token.balanceOf(holder.address)).to.equal(1000);
        expect(await token.totalSupply()).to.equal(1000);
    });

    it("rejects expired zero/self transfers but still permits allowance revocation", async function () {
        const { token, holder, spender } = await networkHelpers.loadFixture(expiredFixture);
        await expect(token.connect(holder).transfer(holder.address, 0))
            .to.be.revertedWithCustomError(token, "PointExpired");
        await expect(token.connect(holder).transfer(holder.address, 1))
            .to.be.revertedWithCustomError(token, "PointExpired");
        await token.connect(holder).approve(spender.address, 0);
        expect(await token.allowance(holder.address, spender.address)).to.equal(0);
        expect(await token.isExpired()).to.equal(true);
    });

    it("rejects all pending spending paths, including zero/self transfers and transferFrom", async function () {
        const { token, holder, recipient, spender } = await networkHelpers.loadFixture(deployFixture);
        await token.connect(holder).approve(spender.address, 400);
        await expect(token.connect(holder).transfer(holder.address, 0)).to.be.revertedWithCustomError(token, "PointNotStarted");
        await expect(token.connect(spender).transferFrom(holder.address, recipient.address, 100))
            .to.be.revertedWithCustomError(token, "PointNotStarted");
        expect(await token.allowance(holder.address, spender.address)).to.equal(400);
        await expect(token.burn(holder.address, 1, ethers.id("pending-burn"))).to.be.revertedWithCustomError(token, "PointNotStarted");
    });

    it("enforces owner permissions for deploy/mint/burn", async function () {
        const { factory, token, holder, recipient } = await networkHelpers.loadFixture(activeFixture);
        await expect(factory.connect(holder).deployPointToken("Bad", "BAD"))
            .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount").withArgs(holder.address);
        await expect(token.connect(holder).mint(recipient.address, 1, ethers.id("denied-issue")))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        await expect(token.connect(holder).burn(holder.address, 1, ethers.id("denied-burn")))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("retains ERC20 address and balance validations", async function () {
        const { token, holder } = await networkHelpers.loadFixture(activeFixture);
        await expect(token.mint(ethers.ZeroAddress, 1, ethers.id("zero-issue"))).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        await expect(token.connect(holder).transfer(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        await expect(token.burn(ethers.ZeroAddress, 1, ethers.id("zero-burn"))).to.be.revertedWithCustomError(token, "ERC20InvalidSender");
        await expect(token.burn(holder.address, 1001, ethers.id("excess-burn"))).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("has no epoch methods or date setters in the new ABI", async function () {
        const { token, factory } = await networkHelpers.loadFixture(deployFixture);
        const tokenAbi = new ethers.Interface(token.interface.fragments);
        const factoryAbi = new ethers.Interface(factory.interface.fragments);
        for (const method of ["epochLength", "currentEpoch", "balanceOfAtEpoch", "transferAtEpoch", "setStartDate", "setExpireDate"]) {
            expect(tokenAbi.getFunction(method)).to.equal(null);
        }
        const deploy = factory.interface.getFunction("deployPointToken");
        if (!deploy) throw new Error("Expected identity deployment ABI");
        expect(deploy.inputs.map(input => [input.name, input.type])).to.deep.equal([
            ["name_", "string"], ["symbol_", "string"],
        ]);
        expect(factoryAbi.getFunction("deployPointToken(string,string,uint256,uint256,uint256,address)")).to.equal(null);
        expect(factoryAbi.getEvent("DatedTokenDeployed")).to.equal(null);
        expect(factoryAbi.getFunction("deployPointToken(string,string,uint40,uint8,uint256,address)")).to.equal(null);
    });
});
