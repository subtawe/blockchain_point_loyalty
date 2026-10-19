import hre from "hardhat";
import {
    assertPointDatesCurrent, assertPointFactoryReady, deployPointToken, waitForPointContractCreation,
} from "./pointDeployment.js";
import { readPointBusiness, readPointInventory } from "./pointParameters.js";
import { finishPointSetup, reportDeploymentError } from "./runPointDeployment.js";

async function main() {
    const business = readPointBusiness();
    const inventory = readPointInventory();
    const connection = await hre.network.connect();
    try {
        const { ethers } = connection;
        const [signer] = await ethers.getSigners();
        if (!signer) throw new Error("A deployment signer is required");
        if (business.kind === "A") await assertPointDatesCurrent(ethers.provider, business);
        console.log("Signer:", signer.address);

        const implementation = await ethers.deployContract("UpgradablePointFactory", signer);
        await waitForPointContractCreation(implementation);
        console.log("Implementation:", await implementation.getAddress());

        const initializeData = implementation.interface.encodeFunctionData("initialize");
        const proxy = await ethers.deployContract("AppProxy", [await implementation.getAddress(), initializeData], signer);
        await waitForPointContractCreation(proxy);
        console.log("Proxy:", await proxy.getAddress());

        const factory = await ethers.getContractAt("UpgradablePointFactory", await proxy.getAddress(), signer);
        await assertPointFactoryReady(factory, signer.address);
        const tokenAddress = await deployPointToken(factory, { name: "ui", symbol: "UI" });
        const token = await ethers.getContractAt("NewPointToken", tokenAddress, signer);
        await finishPointSetup(token, business, inventory, signer.address, ethers.provider);
    } finally {
        await connection.close();
    }
}

await main().catch(reportDeploymentError);
