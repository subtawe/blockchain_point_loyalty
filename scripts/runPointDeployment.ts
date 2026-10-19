import hre from "hardhat";
import { formatUnits } from "ethers";
import type { Provider } from "ethers";
import {
    assertPointDatesCurrent, assertPointFactoryReady, configurePointBusiness, deployPointToken, mintPointInventory,
} from "./pointDeployment.js";
import { readPointBusiness, readPointFactoryAddress, readPointInventory } from "./pointParameters.js";
import type { PointBusinessConfig, PointInventory } from "./pointParameters.js";
import type { NewPointToken } from "../types/ethers-contracts/index.js";

interface DeploymentOptions {
    factoryContract: "NewPointTokenFactory" | "UpgradablePointFactory";
    name: string;
    symbol: string;
}

export async function finishPointSetup(
    token: NewPointToken, business: PointBusinessConfig, inventory: PointInventory, signerAddress: string,
    provider: Pick<Provider, "getBlock">,
): Promise<void> {
    await configurePointBusiness(token, business, signerAddress, provider);
    await mintPointInventory(token, inventory, signerAddress);
    const account = inventory.kind === "mint" ? inventory.recipient : signerAddress;
    const address = await token.getAddress();
    const [ledger, stock, available, escrow, supply, decimals, state] = await Promise.all([
        token.balanceOf(account), token.inventoryBalanceOf(account), token.availableBalanceOf(account),
        token.balanceOf(address), token.totalSupply(), token.decimals(), token.state(),
    ]);
    console.log("Token:", address);
    console.log("Point state:", state === 0n ? "Draft" : "Configured");
    console.log("Business selection:", business.kind);
    console.log("Account:", account);
    console.log("Customer ledger balance:", formatUnits(ledger, decimals));
    console.log("Inventory claim:", formatUnits(stock, decimals));
    console.log("Available customer balance:", formatUnits(available, decimals));
    console.log("Token escrow balance:", formatUnits(escrow, decimals));
    console.log("Ledger total supply including escrow:", formatUnits(supply, decimals));
}

export async function runPointDeployment(options: DeploymentOptions): Promise<void> {
    const business = readPointBusiness();
    const inventory = readPointInventory();
    const factoryAddress = readPointFactoryAddress();
    const connection = await hre.network.connect();
    try {
        const { ethers } = connection;
        const [signer] = await ethers.getSigners();
        if (!signer) throw new Error("A deployment signer is required");
        const factory = options.factoryContract === "NewPointTokenFactory"
            ? await ethers.getContractAt("NewPointTokenFactory", factoryAddress, signer)
            : await ethers.getContractAt("UpgradablePointFactory", factoryAddress, signer);
        await assertPointFactoryReady(factory, signer.address);
        if (business.kind === "A") await assertPointDatesCurrent(ethers.provider, business);
        console.log("Signer:", signer.address);
        console.log("Factory:", factoryAddress);

        const tokenAddress = await deployPointToken(factory, { name: options.name, symbol: options.symbol });
        const token = await ethers.getContractAt("NewPointToken", tokenAddress, signer);
        await finishPointSetup(token, business, inventory, signer.address, ethers.provider);
    } finally {
        await connection.close();
    }
}

export function reportDeploymentError(error: unknown): void {
    console.error(error instanceof Error ? error.message : "Point deployment failed");
    process.exitCode = 1;
}
