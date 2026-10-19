import { expect } from "chai";
import hre from "hardhat";



describe("PointTokenFactory and PointToken", function () {
  // Fixture to deploy the factory once for reuse
  async function deployFactoryFixture() {
    const { ethers } = await hre.network.connect();
    const [owner, tokenOwner, user] = await ethers.getSigners();

    const PointFactory = await ethers.getContractFactory("PointTokenFactory");
    // Pass owner address to constructor as required by your contract
    const factory = await PointFactory.deploy();
    await factory.waitForDeployment();

    return { factory, owner, tokenOwner, user };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { networkHelpers } = await hre.network.connect();
      const { factory, owner } = await networkHelpers.loadFixture(deployFactoryFixture);
      expect(await factory.owner()).to.equal(owner.address);
    });

    it("Should start with 0 deployed tokens", async function () {
      const { networkHelpers } = await hre.network.connect();
      const { factory } = await networkHelpers.loadFixture(deployFactoryFixture);
      expect(await factory.getDeployedTokensCount()).to.equal(0);
    });
  });

  describe("Creating PointTokens", function () {
    it("Should deploy a new PointToken and emit event", async function () {
      const { networkHelpers } = await hre.network.connect();
      const { factory, owner, tokenOwner } = await networkHelpers.loadFixture(deployFactoryFixture);

      const name = "Loyalty";
      const symbol = "LYT";
      const { ethers } = await hre.network.connect();
      const initBlock = await ethers.provider.getBlockNumber();
      const duration = 100;
      const size = 5;
      const safe = false;

      // Check for event emission
      await expect(factory.deployPointToken(name, symbol, initBlock, duration, size, safe, tokenOwner.address, 1000))
        .to.emit(factory, "TokenDeployed")
        .withArgs((arg: any) => typeof arg === "string" && arg.length > 0, name, symbol, owner.address); // verify event args

      expect(await factory.getDeployedTokensCount()).to.equal(1);
    });

    it("Should allow interaction with the new PointToken", async function () {
      const { networkHelpers } = await hre.network.connect();
      const { factory, tokenOwner, user } = await networkHelpers.loadFixture(deployFactoryFixture);

      // Deploy token
      const { ethers } = await hre.network.connect();
      const tx = await factory.deployPointToken(
        "Gold",
        "GLD",
        await ethers.provider.getBlockNumber(),
        1000,
        10,
        false,
        tokenOwner.address,
        0
      );

      // Get the address from the event or the deployedTokens array
      const receipt = await tx.wait();
      if (receipt?.status !== 1) {
        throw new Error("Token deployment transaction failed!");
      }
      // @ts-ignore
      const event = receipt?.logs.find(e => e.fragment && e.fragment.name === 'TokenDeployed');
      // @ts-ignore
      const newTokenAddress = event.args[0];

      // Attach the PointToken interface to the new address
      const pointToken = await ethers.getContractAt("PointToken", newTokenAddress, tokenOwner);

      // Verify Token Details
      expect(await pointToken.name()).to.equal("Gold");
      expect(await pointToken.owner()).to.equal(tokenOwner.address);

      // Test Minting (Only Token Owner)
      await pointToken.connect(tokenOwner).mint(user.address, 500);
      console.log("After minting", await pointToken.balanceOf(user.address));
      expect(await pointToken.balanceOf(user.address)).to.equal(500);

      // Test Burning
      await pointToken.connect(user).burn(200);
      console.log("After burning", await pointToken.balanceOf(user.address));
      expect(await pointToken.balanceOf(user.address)).to.equal(300);
    });

    it("Should revert if non-owner tries to deploy from factory", async function () {
      const { networkHelpers } = await hre.network.connect();
      const { factory, user, tokenOwner } = await networkHelpers.loadFixture(deployFactoryFixture);

      await expect(
        factory.connect(user).deployPointToken("Fake", "F", 0, 100, 1, false, tokenOwner.address, 0)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount")
        .withArgs(user.address);
    });
  });
});