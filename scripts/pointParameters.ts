import { getAddress, getBytes, hexlify, isHexString, MaxUint256, ZeroAddress, ZeroHash } from "ethers";

export interface PointDates {
    startDate: bigint;
    expireDate: bigint;
}

type Environment = Readonly<Record<string, string | undefined>>;
export type PointBusinessConfig =
    | { kind: "Draft" }
    | ({ kind: "A" } & PointDates)
    | { kind: "B"; policy: "FEFO_ONLY" }
    | { kind: "C"; policy: "USER_SELECT" }
    | { kind: "D"; policy: "FEFO_ONLY" | "USER_SELECT" };
export type PointInventory =
    | { kind: "none" }
    | { kind: "mint"; amount: bigint; recipient: string; operationId: string };

// Supported script date range through 9999-12-31; catches modern millisecond inputs.
const MAX_UNIX_SECONDS = 253402300799n;

function readUnixSeconds(env: Environment, key: string): bigint {
    const value = env[key];
    if (!value || !/^\d+$/.test(value)) {
        throw new Error(`${key} is required and must be an integer Unix timestamp in seconds`);
    }
    const timestamp = BigInt(value);
    if (timestamp > MAX_UNIX_SECONDS) {
        throw new Error(`${key} is outside the supported Unix-second date range`);
    }
    return timestamp;
}

/** Explicit inputs only: no fallback dates or conversion from legacy epochs. */
export function readPointDates(env: Environment = process.env): PointDates {
    const startDate = readUnixSeconds(env, "POINT_START_DATE");
    const expireDate = readUnixSeconds(env, "POINT_EXPIRE_DATE");
    if (startDate >= expireDate) throw new Error("POINT_START_DATE must be before POINT_EXPIRE_DATE");
    return { startDate, expireDate };
}

export function readPointBusiness(env: Environment = process.env): PointBusinessConfig {
    const policy = env.POINT_TRANSFER_POLICY;
    switch (env.POINT_BUSINESS) {
        case undefined: return { kind: "Draft" };
        case "A": return { kind: "A", ...readPointDates(env) };
        case "B":
            if (policy !== undefined && policy !== "FEFO_ONLY") {
                throw new Error("Business B requires POINT_TRANSFER_POLICY=FEFO_ONLY");
            }
            return { kind: "B", policy: "FEFO_ONLY" };
        case "C":
            if (policy !== undefined && policy !== "USER_SELECT") {
                throw new Error("Business C requires POINT_TRANSFER_POLICY=USER_SELECT");
            }
            return { kind: "C", policy: "USER_SELECT" };
        case "D":
            if (policy !== "FEFO_ONLY" && policy !== "USER_SELECT") {
                throw new Error("Business D requires POINT_TRANSFER_POLICY=FEFO_ONLY or USER_SELECT");
            }
            return { kind: "D", policy };
        default: throw new Error("POINT_BUSINESS must be A, B, C or D when supplied");
    }
}

function readAddress(value: string | undefined, key: string): string {
    try {
        if (value && /^0x[0-9a-fA-F]{40}$/.test(value)) {
            const address = getAddress(value);
            if (address !== ZeroAddress) return address;
        }
    } catch {
        throw new Error(`${key} must be a valid nonzero address`);
    }
    throw new Error(`${key} must be a valid nonzero address`);
}

export function readPointFactoryAddress(env: Environment = process.env): string {
    return readAddress(env.POINT_FACTORY_ADDRESS, "POINT_FACTORY_ADDRESS");
}

export function readPointInventory(env: Environment = process.env): PointInventory {
    const amount = env.POINT_INVENTORY_AMOUNT;
    const recipient = env.POINT_INVENTORY_RECIPIENT;
    const operationId = env.POINT_INVENTORY_OPERATION_ID;
    if (amount === undefined && recipient === undefined && operationId === undefined) return { kind: "none" };
    if (!amount || !/^\d+$/.test(amount) || BigInt(amount) <= 0n || BigInt(amount) > MaxUint256) {
        throw new Error("POINT_INVENTORY_AMOUNT must be an explicit positive integer in base units");
    }
    if (!operationId || !isHexString(operationId, 32) || operationId === ZeroHash) {
        throw new Error("POINT_INVENTORY_OPERATION_ID must be an explicit nonzero bytes32 value");
    }
    return {
        kind: "mint", amount: BigInt(amount), operationId: hexlify(getBytes(operationId)),
        recipient: readAddress(recipient, "POINT_INVENTORY_RECIPIENT"),
    };
}
