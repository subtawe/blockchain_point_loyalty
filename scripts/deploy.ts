import hre from "hardhat";
import { assertPointFactoryReady, waitForPointContractCreation } from "./pointDeployment.js";
import { reportDeploymentError } from "./runPointDeployment.js";

async function main() {
  const connection = await hre.network.connect();
  try {
    const { ethers } = connection;
    const [deployer] = await ethers.getSigners();
    if (!deployer) throw new Error("A deployment signer is required");
    const deployerAddress = await deployer.getAddress();
    console.log(`Using deployer: ${deployerAddress}`);

    const factoryFactory = await ethers.getContractFactory("PointTokenFactory", deployer);
    const factory = await factoryFactory.deploy();

    const deploymentTx = factory.deploymentTransaction();
    await waitForPointContractCreation(factory);
    await assertPointFactoryReady(factory, deployerAddress);

    console.log(`PointTokenFactory (identity ABI v3) deployed at: ${await factory.getAddress()}`);
    if (deploymentTx?.hash) {
      console.log(`Deployment tx hash: ${deploymentTx.hash}`);
    }
  } finally {
    await connection.close();
  }
}

main().catch(reportDeploymentError);
