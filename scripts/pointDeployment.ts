import type { BaseContract, ContractTransactionResponse, Interface, Provider, TransactionReceipt } from "ethers";
import { AbiCoder, getAddress, getBytes, hexlify, ZeroAddress } from "ethers";
import type { PointBusinessConfig, PointDates, PointInventory } from "./pointParameters.js";

export interface PointDeploymentParameters { name: string; symbol: string }
export type PointFactory = BaseContract & {
    pointTokenVersion(): Promise<bigint>;
    owner(): Promise<string>;
    deployPointToken(name: string, symbol: string): Promise<ContractTransactionResponse>;
};
type PointToken = BaseContract & {
    owner(): Promise<string>;
    configureBusiness(business: number, config: string): Promise<ContractTransactionResponse>;
    mintInventory(to: string, value: bigint, issueId: string): Promise<ContractTransactionResponse>;
};
const POINT_TOKEN_VERSION = 3n;
const BUSINESS_IDS = { A: 1, B: 2, C: 3, D: 4 };
const TRANSFER_POLICIES = { FEFO_ONLY: 0, USER_SELECT: 1 };
const SUCCESSFUL_RECEIPT = 1;

export async function assertPointDatesCurrent(provider: Pick<Provider, "getBlock">, dates: PointDates): Promise<void> {
    const block = await provider.getBlock("latest");
    if (!block) throw new Error("Cannot read the latest block to validate point dates");
    if (dates.expireDate <= BigInt(block.timestamp)) {
        throw new Error("POINT_EXPIRE_DATE must be after the latest chain timestamp");
    }
}

// Reject unsupported or ownerless factories instead of initializing an untrusted address.
export async function assertPointFactoryReady(
    factory: Pick<PointFactory, "pointTokenVersion" | "owner">,
    signerAddress: string,
): Promise<void> {
    if (await factory.pointTokenVersion() !== POINT_TOKEN_VERSION) {
        throw new Error("Factory does not support the identity-first ABI (version 3 required)");
    }
    const owner = getAddress(await factory.owner());
    if (owner === ZeroAddress) throw new Error("Factory has no owner; deploy an atomically initialized proxy");
    if (owner !== getAddress(signerAddress)) throw new Error("Signer is not the owner of the factory");
}

// Only the expected emitter can provide proof of deployment, configuration or escrow issuance.
export function readPointEvent(
    receipt: Pick<TransactionReceipt, "status" | "logs"> | null,
    contractInterface: Interface,
    contractAddress: string,
    eventName: string,
) {
    if (receipt?.status !== SUCCESSFUL_RECEIPT) throw new Error("Point receipt is missing or unsuccessful");
    const expectedEmitter = getAddress(contractAddress);
    for (const log of receipt.logs) {
        if (getAddress(log.address) !== expectedEmitter) continue;
        const event = contractInterface.parseLog(log);
        if (event?.name === eventName) return event;
    }
    throw new Error(`${eventName} event not found at the expected factory address or token address`);
}

export function readDeployedPointAddress(
    receipt: Pick<TransactionReceipt, "status" | "logs"> | null,
    factoryInterface: Interface,
    factoryAddress: string,
): string {
    const event = readPointEvent(receipt, factoryInterface, factoryAddress, "TokenDeployed");
    const tokenAddress: unknown = event.args.tokenAddress;
    if (typeof tokenAddress !== "string" || getAddress(tokenAddress) === ZeroAddress) {
        throw new Error("TokenDeployed contains an invalid token address");
    }
    return getAddress(tokenAddress);
}

export async function deployPointToken(factory: PointFactory, params: PointDeploymentParameters): Promise<string> {
    const tx = await factory.deployPointToken(params.name, params.symbol);
    return readDeployedPointAddress(await tx.wait(), factory.interface, await factory.getAddress());
}

// Check authority at the script boundary before submitting owner-only operations.
async function assertPointTokenOwner(token: PointToken, signerAddress: string): Promise<void> {
    if (getAddress(await token.owner()) !== getAddress(signerAddress)) {
        throw new Error("Signer is not the owner of the token");
    }
}

export async function configurePointBusiness(
    token: PointToken, config: PointBusinessConfig, signerAddress: string, provider: Pick<Provider, "getBlock">,
): Promise<void> {
    if (config.kind === "Draft") return;
    await assertPointTokenOwner(token, signerAddress);
    if (config.kind === "A") await assertPointDatesCurrent(provider, config);
    const coder = AbiCoder.defaultAbiCoder();
    const encoded = config.kind === "A"
        ? coder.encode(["uint256", "uint256"], [config.startDate, config.expireDate])
        : coder.encode(["uint8"], [TRANSFER_POLICIES[config.policy]]);
    const businessId = BUSINESS_IDS[config.kind];
    const tx = await token.configureBusiness(businessId, encoded);
    const event = readPointEvent(await tx.wait(), token.interface, await token.getAddress(), "BusinessConfigured");
    if (event.args.business !== BigInt(businessId) || event.args.config !== encoded) {
        throw new Error("BusinessConfigured receipt does not match the requested configuration");
    }
}

export async function mintPointInventory(
    token: PointToken, inventory: PointInventory, signerAddress: string,
): Promise<void> {
    if (inventory.kind === "none") return;
    await assertPointTokenOwner(token, signerAddress);
    const recipient = getAddress(inventory.recipient);
    const operationId = hexlify(getBytes(inventory.operationId));
    const tx = await token.mintInventory(recipient, inventory.amount, operationId);
    const event = readPointEvent(await tx.wait(), token.interface, await token.getAddress(), "InventoryMinted");
    if (event.args.account !== recipient || event.args.value !== inventory.amount
        || event.args.issueId !== operationId) {
        throw new Error("InventoryMinted receipt does not match the requested escrow issuance");
    }
}

export async function waitForPointContractCreation(contract: BaseContract): Promise<void> {
    const tx = contract.deploymentTransaction();
    const receipt = tx ? await tx.wait() : null;
    if (receipt?.status !== SUCCESSFUL_RECEIPT || !receipt.contractAddress
        || getAddress(receipt.contractAddress) !== getAddress(await contract.getAddress())) {
        throw new Error("Contract creation receipt is missing or unsuccessful");
    }
    await contract.waitForDeployment();
}
