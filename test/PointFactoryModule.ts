import { expect } from "chai";
import hre from "hardhat";
import PointFactoryModule from "../ignition/modules/pointFactory.js";

describe("PointFactoryModule ownership", function () {
    it("assigns the configured owner and lets that owner deploy tokens", async function () {
        const { ethers, ignition } = await hre.network.connect();
        const [deployer, owner] = await ethers.getSigners();
        const { pointFactory } = await ignition.deploy(PointFactoryModule, {
            parameters: { PointFactoryModule: { owner: owner.address } },
        });

        expect(await pointFactory.owner()).to.equal(owner.address);
        await expect(pointFactory.connect(deployer).deployPointToken("Denied", "NO"))
            .to.be.revertedWithCustomError(pointFactory, "OwnableUnauthorizedAccount")
            .withArgs(deployer.address);

        await pointFactory.connect(owner).deployPointToken("Owner Points", "OWN");
        expect(await pointFactory.getDeployedTokensCount()).to.equal(1n);
        const token = await ethers.getContractAt("PointToken", await pointFactory.deployedTokens(0));
        expect(await token.owner()).to.equal(owner.address);
    });

    it("defaults ownership to account zero when owner is omitted", async function () {
        const { ethers, ignition } = await hre.network.connect();
        const [deployer] = await ethers.getSigners();
        const { pointFactory } = await ignition.deploy(PointFactoryModule);

        expect(await pointFactory.owner()).to.equal(deployer.address);
        await pointFactory.deployPointToken("Default Points", "DFT");
        expect(await pointFactory.getDeployedTokensCount()).to.equal(1n);
    });
});
