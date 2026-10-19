import { expect } from "chai";
import hre from "hardhat";

const { ethers, networkHelpers } = await hre.network.connect();

const POINT_NAME = "Point Loyalty";
const POINT_SYMBOL = "PLY";
const FIRST_TOKEN_INDEX = 0n;
const EMPTY_SUPPLY = 0n;
const SINGLE_TOKEN_COUNT = 1n;
const SECOND_TOKEN_INDEX = 1n;
const SECOND_POINT_NAME = "Second Point";
const SECOND_POINT_SYMBOL = "SPT";
const DRAFT_STATE = 0n;
const CONFIGURED_STATE = 1n;
const UNCONFIGURED_BUSINESS = 0n;
const SHARED_DATE_BUSINESS = 1n;
const LOT_FEFO_BUSINESS = 2n;
const LOT_SELECTION_BUSINESS = 3n;
const DELIVERY_AGE_BUSINESS = 4n;
const FEFO_ONLY_POLICY = 0n;
const USER_SELECT_POLICY = 1n;
const UNSUPPORTED_BUSINESS = 255n;
const EMPTY_CONFIG = "0x";
const INVENTORY_AMOUNT = 1000n;
const ADDITIONAL_INVENTORY_AMOUNT = 100n;
const CUSTOMER_AMOUNT = 100n;
const SECOND_LOT_AMOUNT = 50n;
const FOLLOWUP_OWNER_AMOUNT = 20n;
const TRANSFER_AMOUNT = 40n;
const REDEMPTION_AMOUNT = 80n;
const FEFO_REMAINDER = 30n;
const MANUAL_FIRST_LOT_REMAINDER = 20n;
const MANUAL_SECOND_LOT_REMAINDER = 10n;
const FIRST_LOT_TRANSFER_REMAINDER = 60n;
const FIRST_LOT_POSITION = 0n;
const SECOND_LOT_POSITION = 1n;
const ONE_DAY_SECONDS = 86400;
const SHORT_LOT_VALIDITY_SECONDS = 10 * ONE_DAY_SECONDS;
const LONG_LOT_VALIDITY_SECONDS = 90 * ONE_DAY_SECONDS;
const LEGACY_DURATION_SECONDS = 60 * ONE_DAY_SECONDS;
const THAI_UTC_OFFSET_SECONDS = 7 * 3600;
const DELIVERY_MONTHS = 12;
const SHORTER_DELIVERY_MONTHS = 6;
const MIN_EXPIRY_MONTHS_AHEAD = 2;
const MAX_EXPIRY_MONTHS_AHEAD = 13;
const EXPIRY_BOUNDARY_OFFSET = 1;
const ACTIVE_LOT_STATUS = 1n;
const EXPIRED_LOT_STATUS = 2n;
const MALFORMED_CONFIG_SUFFIX = "0x00";
const SET_AUTOMINE_RPC_METHOD = "evm_setAutomine";
const MINE_BLOCK_RPC_METHOD = "evm_mine";
const ONE_POINT = 1n;
const BATCH_GAS_BUDGET = 2_000_000n;
const EXPECTED_WALLET_CAP = 256n;
const PERFORMANCE_LOT_COUNT = 32n;
const INVALID_AMOUNT = 0n;
const START_DELAY_SECONDS = 100;
const VALIDITY_DURATION_SECONDS = 1000;
const CONFIGURATION_DELAY_SECONDS = 86400;
const DATE_CONFIG_TYPES = ["uint256", "uint256"];
const TRANSFER_POLICY_CONFIG_TYPES = ["uint8"];
const DURATION_CONFIG_TYPES = ["uint256"];
const ISSUE_ID = ethers.id("point-loyalty/phase-one/inventory");
const ADDITIONAL_ISSUE_ID = ethers.id("point-loyalty/phase-one/additional-inventory");
const CUSTOMER_ISSUE_ID = ethers.id("point-loyalty/phase-one/customer");
const FIRST_DELIVERY_ID = ethers.id("point-loyalty/phase-one/first-delivery");
const SECOND_DELIVERY_ID = ethers.id("point-loyalty/phase-one/second-delivery");
const SECOND_INVENTORY_ID = ethers.id("point-loyalty/phase-one/second-inventory");
const TRANSFER_ID = ethers.id("point-loyalty/phase-one/transfer");
const REDEMPTION_ID = ethers.id("point-loyalty/phase-one/redemption");
const CONFIRMED_RECEIPT_STATUS = 1;
const abiCoder = ethers.AbiCoder.defaultAbiCoder();

type MonthWindow = { start: number; expiry: number };

// Independent oracle: JavaScript Date arithmetic, not the contract's day-count formulas.
function thaiInstant(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
    return Date.UTC(year, month - 1, day, hour, minute, second) / 1000 - THAI_UTC_OFFSET_SECONDS;
}

function thaiMonthStart(year: number, month: number): number {
    return thaiInstant(year, month, 1);
}

function windowAhead(timestamp: number, monthsAhead: number): MonthWindow {
    const local = new Date((timestamp + THAI_UTC_OFFSET_SECONDS) * 1000);
    const year = local.getUTCFullYear();
    const month = local.getUTCMonth() + 1;
    return { start: thaiMonthStart(year, month), expiry: thaiMonthStart(year, month + monthsAhead) };
}

function monthWindow(timestamp: number, deliveryMonths: number): MonthWindow {
    return windowAhead(timestamp, deliveryMonths + 1);
}

function windowConfig(window: MonthWindow): string {
    return abiCoder.encode(DATE_CONFIG_TYPES, [window.start, window.expiry]);
}

const MONTH_WINDOW_BASE_TIME = thaiInstant(2040, 6, 7, 12);
const FACTORY_ABI = [
    "function deployPointToken(string name_, string symbol_) returns (address)",
    "function deployedTokens(uint256 index) view returns (address)",
    "function getDeployedTokensCount() view returns (uint256)",
    "error OwnableUnauthorizedAccount(address account)",
];
const TOKEN_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function owner() view returns (address)",
    "function state() view returns (uint8)",
    "function business() view returns (uint8)",
    "function configureBusiness(uint8 business_, bytes config)",
    "function inventoryBalanceOf(address account) view returns (uint256)",
    "function isMarketer(address account) view returns (bool)",
    "function setMarketer(address marketer, bool allowed)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function availableBalanceOf(address account) view returns (uint256)",
    "function getPointDates() view returns (uint256 startDate, uint256 expireDate)",
    "function getLotDates(uint256 lotId) view returns (uint256 startDate, uint256 expireDate)",
    "function lotValidityStatus(uint256 lotId) view returns (uint8)",
    "function lotCount() view returns (uint256)",
    "function balanceByLot(address account, uint256 lotId) view returns (uint256)",
    "function walletLotIds(address account, uint256 position) view returns (uint256)",
    "function walletLotCount(address account) view returns (uint256)",
    "function maxWalletLots() view returns (uint256)",
    "function mintInventory(address to, uint256 value, bytes32 issueId)",
    "function mint(address to, uint256 value, bytes32 issueId)",
    "function mintLot(address to, uint256 value, uint256 startDate, uint256 expireDate, bytes32 issueId) returns (uint256)",
    "function sendToCustomer(address inventoryAccount, address to, uint256 value, bytes deliveryConfig, bytes32 deliveryId)",
    "function allowSender(address sender, bool allowed)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)",
    "function transferFEFO(address to, uint256 value, bytes32 transferId)",
    "function transferLots(address to, (uint256 lotId, uint256 value)[] allocations, bytes32 transferId)",
    "function redeemFEFO(address from, uint256 value, bytes32 redemptionId)",
    "function burn(address from, uint256 value, bytes32 redemptionId)",
    "error OwnableUnauthorizedAccount(address account)",
    "error AlreadyProcessed()",
    "error OperationConflict()",
    "error InventorySourceNotAllowed(address caller, address inventoryAccount)",
    "error InvalidAccount()",
    "error InvalidAmount()",
    "error InvalidConfiguration()",
    "error InsufficientInventory()",
    "error UnsupportedBusiness()",
    "error NotConfigured()",
    "error SenderNotAllowed()",
    "error InsufficientAvailableBalance()",
    "error ManualSelectionDisabled()",
    "error InvalidMonthWindow()",
    "error MonthWindowNotCurrent()",
    "error InvalidDateRange()",
    "error PointExpired()",
    "function maxExpiryMonthsAhead() view returns (uint256)",
    "event MarketerPermissionUpdated(address indexed marketer, bool allowed)",
    "error WalletLotLimit()",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
];

async function directFactoryFixture() {
    const [owner, marketer, customer, recipient] = await ethers.getSigners();
    const implementation = await ethers.deployContract("PointTokenFactory");
    const factory = new ethers.Contract(await implementation.getAddress(), FACTORY_ABI, owner);
    return { owner, marketer, customer, recipient, factory };
}

async function proxyFactoryFixture() {
    const [owner, marketer, customer, recipient] = await ethers.getSigners();
    const implementation = await ethers.deployContract("UpgradablePointFactory");
    const proxy = await ethers.deployContract("AppProxy", [
        await implementation.getAddress(), implementation.interface.encodeFunctionData("initialize"),
    ]);
    const factory = new ethers.Contract(await proxy.getAddress(), FACTORY_ABI, owner);
    return { owner, marketer, customer, recipient, factory };
}

async function draftTokenFixture() {
    const context = await directFactoryFixture();
    const deployment = await context.factory.getFunction("deployPointToken")(POINT_NAME, POINT_SYMBOL);
    await deployment.wait();
    const tokenAddress = ethers.getAddress(await context.factory
        .getFunction("deployedTokens").staticCall(FIRST_TOKEN_INDEX));
    const token = new ethers.Contract(tokenAddress, TOKEN_ABI, context.owner);
    return { ...context, token };
}

async function inventoryTokenFixture() {
    const context = await draftTokenFixture();
    const issuance = await context.token.getFunction("mintInventory")(
        context.marketer.address, INVENTORY_AMOUNT, ISSUE_ID,
    );
    await issuance.wait();
    return context;
}

async function sharedDateTokenFixture() {
    const context = await inventoryTokenFixture();
    const startDate = (await networkHelpers.time.latest()) + START_DELAY_SECONDS;
    const expireDate = startDate + VALIDITY_DURATION_SECONDS;
    const config = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, expireDate]);
    const configuration = await context.token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, config);
    await configuration.wait();
    return { ...context, startDate, expireDate };
}

async function lotTokenFixture(business: bigint, transferPolicy: bigint) {
    const context = await inventoryTokenFixture();
    const config = abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [transferPolicy]);
    const configuration = await context.token.getFunction("configureBusiness")(business, config);
    await configuration.wait();
    const startDate = await networkHelpers.time.latest();
    const firstExpireDate = startDate + SHORT_LOT_VALIDITY_SECONDS;
    const secondExpireDate = startDate + LONG_LOT_VALIDITY_SECONDS;
    const firstConfig = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, firstExpireDate]);
    const firstDelivery = await context.token.getFunction("sendToCustomer")(
        context.marketer.address, context.customer.address, CUSTOMER_AMOUNT, firstConfig, FIRST_DELIVERY_ID,
    );
    await firstDelivery.wait();
    const secondConfig = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, secondExpireDate]);
    const secondDelivery = await context.token.getFunction("sendToCustomer")(
        context.marketer.address, context.customer.address, SECOND_LOT_AMOUNT, secondConfig, SECOND_DELIVERY_ID,
    );
    await secondDelivery.wait();
    const lotAt = context.token.getFunction("walletLotIds");
    const firstLotId = ethers.getBigInt(await lotAt.staticCall(context.customer.address, FIRST_LOT_POSITION));
    const secondLotId = ethers.getBigInt(await lotAt.staticCall(context.customer.address, SECOND_LOT_POSITION));
    const permission = await context.token.connect(context.recipient)
        .getFunction("allowSender")(context.customer.address, true);
    await permission.wait();
    return { ...context, firstLotId, secondLotId, startDate, firstExpireDate, secondExpireDate };
}

async function fefoLotTokenFixture() {
    return lotTokenFixture(LOT_FEFO_BUSINESS, FEFO_ONLY_POLICY);
}

async function manualLotTokenFixture() {
    return lotTokenFixture(LOT_SELECTION_BUSINESS, USER_SELECT_POLICY);
}

async function deliveredAgeContext() {
    const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
    const delivery = await context.token.getFunction("sendToCustomer")(
        context.marketer.address, context.customer.address, CUSTOMER_AMOUNT, context.deliveryConfig, FIRST_DELIVERY_ID,
    );
    await delivery.wait();
    const lotId = ethers.getBigInt(await context.token.getFunction("walletLotIds").staticCall(
        context.customer.address, FIRST_LOT_POSITION,
    ));
    const permission = await context.token.connect(context.recipient)
        .getFunction("allowSender")(context.customer.address, true);
    await permission.wait();
    return { ...context, lotId };
}

async function delegatedDeliveryContext(transferPolicy: bigint) {
    const context = await inventoryTokenFixture();
    await (await context.token.getFunction("configureBusiness")(
        DELIVERY_AGE_BUSINESS, abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [transferPolicy]),
    )).wait();
    await (await context.token.getFunction("setMarketer")(context.marketer.address, true)).wait();
    const deliveryWindow = monthWindow(await networkHelpers.time.latest(), DELIVERY_MONTHS);
    return { ...context, deliveryWindow, deliveryConfig: windowConfig(deliveryWindow) };
}

// Exactly one D fixture exists: restoring several fixtures that were first run at different times is unreliable,
// so every other D setup is built on top of this one inside the test.
async function delegatedDeliveryFixture() {
    await networkHelpers.time.increaseTo(MONTH_WINDOW_BASE_TIME);
    return delegatedDeliveryContext(FEFO_ONLY_POLICY);
}

async function deliveryAccounting(context: Awaited<ReturnType<typeof draftTokenFixture>>) {
    const { token, marketer, customer, recipient } = context;
    return {
        inventory: await token.getFunction("inventoryBalanceOf")(marketer.address),
        escrow: await token.getFunction("balanceOf")(await token.getAddress()),
        supply: await token.getFunction("totalSupply")(),
        marketerWallet: await token.getFunction("balanceOf")(marketer.address),
        customerWallet: await token.getFunction("balanceOf")(customer.address),
        recipientWallet: await token.getFunction("balanceOf")(recipient.address),
        lotCount: await token.getFunction("lotCount")(),
        customerLotCount: await token.getFunction("walletLotCount")(customer.address),
    };
}

async function outOfOrderExpiryFixture() {
    const context = await inventoryTokenFixture();
    const configuration = await context.token.getFunction("configureBusiness")(
        LOT_SELECTION_BUSINESS, abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [USER_SELECT_POLICY]),
    );
    await configuration.wait();
    const startDate = await networkHelpers.time.latest();
    for (const delivery of [
        { value: CUSTOMER_AMOUNT, expiry: startDate + LONG_LOT_VALIDITY_SECONDS, id: FIRST_DELIVERY_ID },
        { value: SECOND_LOT_AMOUNT, expiry: startDate + SHORT_LOT_VALIDITY_SECONDS, id: SECOND_DELIVERY_ID },
    ]) {
        const transaction = await context.token.getFunction("sendToCustomer")(
            context.marketer.address, context.customer.address, delivery.value,
            abiCoder.encode(DATE_CONFIG_TYPES, [startDate, delivery.expiry]), delivery.id,
        );
        await transaction.wait();
    }
    const lotAt = context.token.getFunction("walletLotIds");
    const earlierCreatedLot = ethers.getBigInt(await lotAt.staticCall(context.customer.address, SECOND_LOT_POSITION));
    const laterCreatedLot = ethers.getBigInt(await lotAt.staticCall(context.customer.address, FIRST_LOT_POSITION));
    const permission = await context.token.connect(context.recipient)
        .getFunction("allowSender")(context.customer.address, true);
    await permission.wait();
    return { ...context, earlierCreatedLot, laterCreatedLot };
}

async function performanceOverlapWalletFixture() {
    const context = await inventoryTokenFixture();
    await (await context.token.getFunction("configureBusiness")(
        LOT_SELECTION_BUSINESS, abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [USER_SELECT_POLICY]),
    )).wait();
    const start = await networkHelpers.time.latest();
    const count = PERFORMANCE_LOT_COUNT;
    expect(await context.token.getFunction("maxWalletLots")()).to.equal(EXPECTED_WALLET_CAP);
    for (let position = 0n; position < count; position += ONE_POINT) {
        const expiry = BigInt(start + LONG_LOT_VALIDITY_SECONDS) + position * BigInt(ONE_DAY_SECONDS);
        await (await context.token.getFunction("mintLot")(
            context.customer.address, ONE_POINT, start, expiry, ethers.id(`batch/sender/${position}`),
        )).wait();
        await (await context.token.getFunction("mintLot")(
            context.recipient.address, ONE_POINT, start, expiry, ethers.id(`batch/recipient/${position}`),
        )).wait();
    }
    await (await context.token.connect(context.recipient)
        .getFunction("allowSender")(context.customer.address, true)).wait();
    return { ...context, count };
}

async function cleanupReceiverBatchFixture() {
    const context = await manualLotTokenFixture();
    const now = await networkHelpers.time.latest();
    const limit = ethers.getBigInt(await context.token.getFunction("maxWalletLots")());
    const expiredCount = 2n;
    for (let position = 0n; position < limit; position += ONE_POINT) {
        const start = position < expiredCount ? now : now + SHORT_LOT_VALIDITY_SECONDS;
        const expiry = position < expiredCount ? BigInt(now) + (position + ONE_POINT) * BigInt(ONE_DAY_SECONDS)
            : BigInt(now + LONG_LOT_VALIDITY_SECONDS) + position * BigInt(ONE_DAY_SECONDS);
        await (await context.token.getFunction("mintLot")(
            context.recipient.address, ONE_POINT, start, expiry, ethers.id(`batch/cleanup/${position}`),
        )).wait();
    }
    const firstExpiredLot = ethers.getBigInt(await context.token.getFunction("walletLotIds")(
        context.recipient.address, FIRST_LOT_POSITION,
    ));
    const secondExpiredLot = ethers.getBigInt(await context.token.getFunction("walletLotIds")(
        context.recipient.address, SECOND_LOT_POSITION,
    ));
    await networkHelpers.time.increaseTo(now + Number(expiredCount) * ONE_DAY_SECONDS + EXPIRY_BOUNDARY_OFFSET);
    return { ...context, limit, firstExpiredLot, secondExpiredLot };
}

const FACTORY_SCENARIOS = [
    { label: "direct factory", fixture: directFactoryFixture },
    { label: "proxy factory", fixture: proxyFactoryFixture },
];

describe("Point Loyalty: 256-lot capacity", function () {
    it("advertises the requested 256 live lots per wallet", async function () {
        const { token } = await networkHelpers.loadFixture(draftTokenFixture);

        expect(await token.getFunction("maxWalletLots")()).to.equal(EXPECTED_WALLET_CAP);
    });

    it("accepts lot 256, rejects a new lot 257 atomically, and still permits merging an existing lot", async function () {
        const { token, customer } = await networkHelpers.loadFixture(fefoLotTokenFixture);
        const now = await networkHelpers.time.latest();
        const firstNewExpiry = BigInt(now + LONG_LOT_VALIDITY_SECONDS + ONE_DAY_SECONDS);
        for (let position = 2n; position < EXPECTED_WALLET_CAP; position += ONE_POINT) {
            await (await token.getFunction("mintLot")(
                customer.address, ONE_POINT, now, firstNewExpiry + position * BigInt(ONE_DAY_SECONDS),
                ethers.id(`capacity256/${position}`),
            )).wait();
        }
        const balance = CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT + EXPECTED_WALLET_CAP - 2n;
        const supply = INVENTORY_AMOUNT + EXPECTED_WALLET_CAP - 2n;
        expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(EXPECTED_WALLET_CAP);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(balance);
        await expect(token.getFunction("mintLot")(
            customer.address, ONE_POINT, now, firstNewExpiry + EXPECTED_WALLET_CAP * BigInt(ONE_DAY_SECONDS),
            ethers.id("capacity256/retry"),
        )).to.be.revertedWithCustomError(token, "WalletLotLimit");
        expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(EXPECTED_WALLET_CAP);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(balance);
        expect(await token.getFunction("totalSupply")()).to.equal(supply);
        await (await token.getFunction("mintLot")(
            customer.address, ONE_POINT, now, firstNewExpiry + 2n * BigInt(ONE_DAY_SECONDS),
            ethers.id("capacity256/retry"),
        )).wait();
        expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(EXPECTED_WALLET_CAP);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(balance + ONE_POINT);
        expect(await token.getFunction("totalSupply")()).to.equal(supply + ONE_POINT);
    });
});

for (const scenario of FACTORY_SCENARIOS) {
    describe(`Point Loyalty: ${scenario.label}`, function () {
        it("deploys an empty Point identity with only name and symbol, before choosing a business", async function () {
            const { owner, customer, factory } = await networkHelpers.loadFixture(scenario.fixture);
            const deployPointToken = factory.getFunction("deployPointToken");
            const predictedAddress = ethers.getAddress(await deployPointToken.staticCall(POINT_NAME, POINT_SYMBOL));
            const transaction = await deployPointToken.send(POINT_NAME, POINT_SYMBOL);
            const receipt = await transaction.wait();
            const tokenAddress = await factory.getFunction("deployedTokens")(FIRST_TOKEN_INDEX);
            const token = new ethers.Contract(tokenAddress, TOKEN_ABI, owner);

            expect(receipt?.status).to.equal(CONFIRMED_RECEIPT_STATUS);
            expect(tokenAddress).to.equal(predictedAddress);
            expect(await ethers.provider.getCode(tokenAddress)).not.to.equal("0x");
            expect(await factory.getFunction("getDeployedTokensCount")()).to.equal(SINGLE_TOKEN_COUNT);
            expect(await token.getFunction("name")()).to.equal(POINT_NAME);
            expect(await token.getFunction("symbol")()).to.equal(POINT_SYMBOL);
            expect(await token.getFunction("owner")()).to.equal(owner.address);
            expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        });

        it("registers distinct empty Point identities without requiring dates or initial recipients", async function () {
            const { owner, factory } = await networkHelpers.loadFixture(scenario.fixture);
            const firstDeployment = await factory.getFunction("deployPointToken")(POINT_NAME, POINT_SYMBOL);
            await firstDeployment.wait();
            const secondDeployment = await factory.getFunction("deployPointToken")(SECOND_POINT_NAME, SECOND_POINT_SYMBOL);
            await secondDeployment.wait();
            const firstAddress = await factory.getFunction("deployedTokens")(FIRST_TOKEN_INDEX);
            const secondAddress = await factory.getFunction("deployedTokens")(SECOND_TOKEN_INDEX);
            const secondToken = new ethers.Contract(secondAddress, TOKEN_ABI, owner);

            expect(firstAddress).not.to.equal(secondAddress);
            expect(await factory.getFunction("getDeployedTokensCount")()).to.equal(SINGLE_TOKEN_COUNT + SINGLE_TOKEN_COUNT);
            expect(await secondToken.getFunction("name")()).to.equal(SECOND_POINT_NAME);
            expect(await secondToken.getFunction("symbol")()).to.equal(SECOND_POINT_SYMBOL);
            expect(await secondToken.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
        });

        it("denies identity-only deployment by a non-owner without modifying the registry", async function () {
            const { customer, factory } = await networkHelpers.loadFixture(scenario.fixture);

            await expect(factory.connect(customer).getFunction("deployPointToken")(POINT_NAME, POINT_SYMBOL))
                .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount").withArgs(customer.address);
            expect(await factory.getFunction("getDeployedTokensCount")()).to.equal(EMPTY_SUPPLY);
        });
    });
}

describe("Point Loyalty: Draft, configuration and inventory", function () {
    it("starts in Draft with no business, supply or spendable Customer balance", async function () {
        const { token, customer } = await networkHelpers.loadFixture(draftTokenFixture);

        expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
        expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
        expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
    });

    it("allows inventory before choosing a business without making it spendable", async function () {
        const { token, marketer, customer } = await networkHelpers.loadFixture(inventoryTokenFixture);

        expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
        expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(marketer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
    });

    it("does not treat the Marketer inventory recipient as an authorized issuer", async function () {
        const { token, marketer, customer } = await networkHelpers.loadFixture(inventoryTokenFixture);

        await expect(token.connect(marketer).getFunction("mintInventory")(
            customer.address, CUSTOMER_AMOUNT, CUSTOMER_ISSUE_ID,
        )).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    for (const invalidIssuance of ["zero recipient", "zero amount"]) {
        it(`rejects inventory issuance with ${invalidIssuance} without creating supply`, async function () {
            const { token, marketer } = await networkHelpers.loadFixture(draftTokenFixture);
            const recipient = invalidIssuance === "zero recipient" ? ethers.ZeroAddress : marketer.address;
            const amount = invalidIssuance === "zero amount" ? INVALID_AMOUNT : INVENTORY_AMOUNT;

            await expect(token.getFunction("mintInventory")(recipient, amount, ISSUE_ID)).to.be.revert(ethers);
            expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
        });
    }

    it("rejects an identical inventory retry without crediting or minting twice", async function () {
        const { token, marketer } = await networkHelpers.loadFixture(inventoryTokenFixture);

        await expect(token.getFunction("mintInventory")(marketer.address, INVENTORY_AMOUNT, ISSUE_ID))
            .to.be.revertedWithCustomError(token, "AlreadyProcessed");
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("rejects changing a processed issue payload instead of minting extra inventory", async function () {
        const { token, marketer } = await networkHelpers.loadFixture(inventoryTokenFixture);

        await expect(token.getFunction("mintInventory")(marketer.address, ADDITIONAL_INVENTORY_AMOUNT, ISSUE_ID))
            .to.be.revertedWithCustomError(token, "OperationConflict");
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("keeps Draft inventory out of ordinary transfers", async function () {
        const { token, marketer, customer } = await networkHelpers.loadFixture(inventoryTokenFixture);

        await expect(token.connect(marketer).getFunction("transfer")(customer.address, CUSTOMER_AMOUNT))
            .to.be.revert(ethers);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("prevents direct Customer issuance before a business is configured", async function () {
        const { token, customer } = await networkHelpers.loadFixture(draftTokenFixture);

        await expect(token.getFunction("mint")(customer.address, CUSTOMER_AMOUNT, CUSTOMER_ISSUE_ID))
            .to.be.revert(ethers);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
    });

    it("configures A later while preserving pre-existing inventory and supply", async function () {
        const { token, marketer, startDate, expireDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);

        expect(await token.getFunction("state")()).to.equal(CONFIGURED_STATE);
        expect(await token.getFunction("business")()).to.equal(SHARED_DATE_BUSINESS);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(marketer.address)).to.equal(EMPTY_SUPPLY);
    });

    it("allows a delay between creating the Point identity and choosing its validity dates", async function () {
        const { token } = await networkHelpers.loadFixture(draftTokenFixture);
        await networkHelpers.time.increase(CONFIGURATION_DELAY_SECONDS);
        const startDate = (await networkHelpers.time.latest()) + START_DELAY_SECONDS;
        const expireDate = startDate + VALIDITY_DURATION_SECONDS;
        const config = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, expireDate]);

        const transaction = await token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, config);
        await transaction.wait();
        expect(await token.getFunction("state")()).to.equal(CONFIGURED_STATE);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
    });

    it("allows only Token owner to choose the business, not the Marketer recipient", async function () {
        const { token, marketer } = await networkHelpers.loadFixture(inventoryTokenFixture);
        const startDate = (await networkHelpers.time.latest()) + START_DELAY_SECONDS;
        const expireDate = startDate + VALIDITY_DURATION_SECONDS;
        const config = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, expireDate]);

        await expect(token.connect(marketer).getFunction("configureBusiness")(SHARED_DATE_BUSINESS, config))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
        expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    for (const invalidBusiness of [UNCONFIGURED_BUSINESS, UNSUPPORTED_BUSINESS]) {
        it(`rejects business ${invalidBusiness} without leaving Draft`, async function () {
            const { token } = await networkHelpers.loadFixture(draftTokenFixture);

            await expect(token.getFunction("configureBusiness")(invalidBusiness, EMPTY_CONFIG)).to.be.revert(ethers);
            expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
            expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
            expect(await token.getFunction("totalSupply")()).to.equal(EMPTY_SUPPLY);
        });
    }

    for (const invalidPeriod of ["equal dates", "reversed dates", "expired dates"]) {
        it(`rejects A with ${invalidPeriod} while preserving inventory and allowing a corrected configuration`, async function () {
            const { token, marketer } = await networkHelpers.loadFixture(inventoryTokenFixture);
            const now = await networkHelpers.time.latest();
            const startDate = now + START_DELAY_SECONDS;
            const expireDate = startDate + VALIDITY_DURATION_SECONDS;
            const invalidStart = invalidPeriod === "expired dates" ? now - VALIDITY_DURATION_SECONDS : startDate;
            const invalidEnd = invalidPeriod === "equal dates" ? startDate
                : invalidPeriod === "reversed dates" ? now : now - START_DELAY_SECONDS;
            const invalidConfig = abiCoder.encode(DATE_CONFIG_TYPES, [invalidStart, invalidEnd]);

            await expect(token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, invalidConfig)).to.be.revert(ethers);
            expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
            expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
            expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
            expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
            const validConfig = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, expireDate]);
            const transaction = await token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, validConfig);
            await transaction.wait();
            expect(await token.getFunction("state")()).to.equal(CONFIGURED_STATE);
        });
    }

    it("rejects an empty A config rather than setting a partially configured business", async function () {
        const { token } = await networkHelpers.loadFixture(draftTokenFixture);

        await expect(token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, EMPTY_CONFIG)).to.be.revert(ethers);
        expect(await token.getFunction("state")()).to.equal(DRAFT_STATE);
        expect(await token.getFunction("business")()).to.equal(UNCONFIGURED_BUSINESS);
    });

    it("locks the first business and dates even when there are no Customer points yet", async function () {
        const { token, startDate, expireDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        const replacementConfig = abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [FEFO_ONLY_POLICY]);

        await expect(token.getFunction("configureBusiness")(LOT_FEFO_BUSINESS, replacementConfig)).to.be.revert(ethers);
        expect(await token.getFunction("state")()).to.equal(CONFIGURED_STATE);
        expect(await token.getFunction("business")()).to.equal(SHARED_DATE_BUSINESS);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("does not permit changing dates by configuring A for a second time", async function () {
        const { token, startDate, expireDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        const replacementConfig = abiCoder.encode(DATE_CONFIG_TYPES, [
            startDate + START_DELAY_SECONDS, expireDate + VALIDITY_DURATION_SECONDS,
        ]);

        await expect(token.getFunction("configureBusiness")(SHARED_DATE_BUSINESS, replacementConfig)).to.be.revert(ethers);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
    });

    it("allows additional inventory after configuration without starting its spending validity", async function () {
        const { token, marketer, startDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        await networkHelpers.time.increaseTo(startDate);
        const transaction = await token.getFunction("mintInventory")(
            marketer.address, ADDITIONAL_INVENTORY_AMOUNT, ADDITIONAL_ISSUE_ID,
        );
        await transaction.wait();

        expect(await token.getFunction("inventoryBalanceOf")(marketer.address))
            .to.equal(INVENTORY_AMOUNT + ADDITIONAL_INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + ADDITIONAL_INVENTORY_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(marketer.address)).to.equal(EMPTY_SUPPLY);
    });

    it("allows A issuance after configuration and distinguishes Configured from Active", async function () {
        const { token, customer, startDate, expireDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        const transaction = await token.getFunction("mint")(customer.address, CUSTOMER_AMOUNT, CUSTOMER_ISSUE_ID);
        await transaction.wait();

        expect(await token.getFunction("state")()).to.equal(CONFIGURED_STATE);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + CUSTOMER_AMOUNT);
        await networkHelpers.time.increaseTo(startDate);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
    });
});

describe("Point Loyalty: business A/B/C/D journeys", function () {
    it("distributes only the explicitly named inventory account when multiple Marketers hold stock", async function () {
        const { token, marketer, customer, recipient } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        const secondIssuance = await token.getFunction("mintInventory")(
            recipient.address, ADDITIONAL_INVENTORY_AMOUNT, SECOND_INVENTORY_ID,
        );
        await secondIssuance.wait();
        const delivery = await token.getFunction("sendToCustomer")(
            recipient.address, customer.address, TRANSFER_AMOUNT, EMPTY_CONFIG, FIRST_DELIVERY_ID,
        );
        await delivery.wait();

        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(recipient.address))
            .to.equal(ADDITIONAL_INVENTORY_AMOUNT - TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + ADDITIONAL_INVENTORY_AMOUNT);
    });

    it("does not borrow another Marketer's inventory when the named account has no stock", async function () {
        const { token, marketer, customer, recipient } = await networkHelpers.loadFixture(sharedDateTokenFixture);

        await expect(token.getFunction("sendToCustomer")(
            recipient.address, customer.address, CUSTOMER_AMOUNT, EMPTY_CONFIG, FIRST_DELIVERY_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("A distributes existing inventory using the shared dates without minting supply again", async function () {
        const { token, marketer, customer, recipient, startDate, expireDate } =
            await networkHelpers.loadFixture(sharedDateTokenFixture);
        const delivery = await token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, EMPTY_CONFIG, FIRST_DELIVERY_ID,
        );
        await delivery.wait();

        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        await networkHelpers.time.increaseTo(startDate);
        const transfer = await token.connect(customer).getFunction("transfer")(recipient.address, TRANSFER_AMOUNT);
        await transfer.wait();
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("getPointDates")()).to.deep.equal([BigInt(startDate), BigInt(expireDate)]);
        await networkHelpers.time.increaseTo(expireDate + EXPIRY_BOUNDARY_OFFSET);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("B transfers the earliest-expiring Active lot and redeems FEFO across lots", async function () {
        const { token, customer, recipient, firstLotId, secondLotId, firstExpireDate } =
            await networkHelpers.loadFixture(fefoLotTokenFixture);
        const transfer = await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        );
        await transfer.wait();
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, secondLotId)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(FIRST_LOT_TRANSFER_REMAINDER);
        const redemption = await token.getFunction("redeemFEFO")(customer.address, REDEMPTION_AMOUNT, REDEMPTION_ID);
        await redemption.wait();

        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(FEFO_REMAINDER);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT - REDEMPTION_AMOUNT);
        await networkHelpers.time.increaseTo(firstExpireDate + EXPIRY_BOUNDARY_OFFSET);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(FEFO_REMAINDER);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
    });

    it("B denies manual lot selection on chain without changing any allocation", async function () {
        const { token, customer, recipient, firstLotId, secondLotId } =
            await networkHelpers.loadFixture(fefoLotTokenFixture);

        await expect(token.connect(customer).getFunction("transferLots")(
            recipient.address, [{ lotId: secondLotId, value: TRANSFER_AMOUNT }], TRANSFER_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("C transfers the chosen longer-lived lot but still redeems the earliest-expiring lot", async function () {
        const { token, customer, recipient, firstLotId, secondLotId, firstExpireDate } =
            await networkHelpers.loadFixture(manualLotTokenFixture);
        const transfer = await token.connect(customer).getFunction("transferLots")(
            recipient.address, [{ lotId: secondLotId, value: TRANSFER_AMOUNT }], TRANSFER_ID,
        );
        await transfer.wait();
        expect(await token.getFunction("balanceByLot")(recipient.address, secondLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(EMPTY_SUPPLY);
        const redemption = await token.getFunction("redeemFEFO")(customer.address, REDEMPTION_AMOUNT, REDEMPTION_ID);
        await redemption.wait();

        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(MANUAL_FIRST_LOT_REMAINDER);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(MANUAL_SECOND_LOT_REMAINDER);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT - REDEMPTION_AMOUNT);
        await networkHelpers.time.increaseTo(firstExpireDate + EXPIRY_BOUNDARY_OFFSET);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(MANUAL_SECOND_LOT_REMAINDER);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(TRANSFER_AMOUNT);
    });

    it("C also permits automatic FEFO transfers instead of requiring manual selection", async function () {
        const { token, customer, recipient, firstLotId, secondLotId } =
            await networkHelpers.loadFixture(manualLotTokenFixture);
        const transaction = await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        );
        await transaction.wait();

        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, secondLotId)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(FIRST_LOT_TRANSFER_REMAINDER);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("D starts its age in the delivery month, not at inventory mint or configuration", async function () {
        const { token, marketer, customer, lotId, deliveryWindow } = await deliveredAgeContext();

        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        await networkHelpers.time.increaseTo(deliveryWindow.expiry - EXPIRY_BOUNDARY_OFFSET);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        await networkHelpers.time.increaseTo(deliveryWindow.expiry);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(customer.address, lotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("D keeps the original delivery expiry when a Customer transfers points onward", async function () {
        const { token, customer, recipient, lotId, deliveryWindow } = await deliveredAgeContext();
        await networkHelpers.time.increase(ONE_DAY_SECONDS);
        const transfer = await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        );
        await transfer.wait();

        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
        expect(await token.getFunction("balanceByLot")(recipient.address, lotId)).to.equal(TRANSFER_AMOUNT);
        await networkHelpers.time.increaseTo(deliveryWindow.expiry);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(recipient.address, lotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("D rejects an identical delivery retry without consuming inventory twice or restarting expiry", async function () {
        const { token, marketer, customer, lotId, deliveryConfig, deliveryWindow } = await deliveredAgeContext();

        await expect(token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "AlreadyProcessed");
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, lotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("does not count undistributed inventory toward a Customer redemption or partially debit lots", async function () {
        const { token, marketer, customer, firstLotId, secondLotId } =
            await networkHelpers.loadFixture(fefoLotTokenFixture);
        const unavailableAmount = CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT + ONE_POINT;

        await expect(token.getFunction("redeemFEFO")(customer.address, unavailableAmount, REDEMPTION_ID))
            .to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address))
            .to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT - SECOND_LOT_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });
});

describe("Point Loyalty: D Marketer delivery authority", function () {
    it("permits direct delivery from the Marketer's claim with a month window and exclusive expiry", async function () {
        const { token, marketer, customer, deliveryConfig, deliveryWindow } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const transaction = await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        );
        await transaction.wait();
        const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);

        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, lotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(await token.getAddress())).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        await networkHelpers.time.increaseTo(deliveryWindow.expiry);
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
    });

    it("restricts permission management to the owner and emits only on actual changes", async function () {
        const { token, marketer, customer } = await networkHelpers.loadFixture(draftTokenFixture);
        await expect(token.connect(marketer).getFunction("setMarketer")(customer.address, true))
            .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        for (const invalid of [ethers.ZeroAddress, await token.getAddress()]) {
            await expect(token.getFunction("setMarketer")(invalid, true))
                .to.be.revertedWithCustomError(token, "InvalidAccount");
        }
        expect(await token.getFunction("isMarketer")(marketer.address)).to.equal(false);
        await expect(token.getFunction("setMarketer")(marketer.address, true))
            .to.emit(token, "MarketerPermissionUpdated").withArgs(marketer.address, true);
        await expect(token.getFunction("setMarketer")(marketer.address, true))
            .not.to.emit(token, "MarketerPermissionUpdated");
        await expect(token.getFunction("setMarketer")(marketer.address, false))
            .to.emit(token, "MarketerPermissionUpdated").withArgs(marketer.address, false);
        await expect(token.getFunction("setMarketer")(marketer.address, false))
            .not.to.emit(token, "MarketerPermissionUpdated");
        expect(await token.getFunction("isMarketer")(marketer.address)).to.equal(false);
    });

    it("blocks unregistered and non-D callers before recording a delivery ID", async function () {
        const { token, marketer, customer, recipient, deliveryConfig } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await expect(token.connect(recipient).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(recipient.address);
        const shared = await networkHelpers.loadFixture(sharedDateTokenFixture);
        await (await shared.token.getFunction("setMarketer")(shared.marketer.address, true)).wait();
        await expect(shared.token.connect(shared.marketer).getFunction("sendToCustomer")(
            shared.marketer.address, shared.customer.address, CUSTOMER_AMOUNT, EMPTY_CONFIG, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(shared.token, "OwnableUnauthorizedAccount").withArgs(shared.marketer.address);
        expect(await shared.token.getFunction("inventoryBalanceOf")(shared.marketer.address)).to.equal(INVENTORY_AMOUNT);
    });

    it("rejects cross-source delivery and permits the same ID from the authorized source", async function () {
        const { token, marketer, customer, recipient, deliveryConfig } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await (await token.getFunction("mintInventory")(recipient.address, ADDITIONAL_INVENTORY_AMOUNT, ADDITIONAL_ISSUE_ID)).wait();
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            recipient.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "InventorySourceNotAllowed")
            .withArgs(marketer.address, recipient.address);
        expect(await token.getFunction("inventoryBalanceOf")(recipient.address)).to.equal(ADDITIONAL_INVENTORY_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + ADDITIONAL_INVENTORY_AMOUNT);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(recipient.address)).to.equal(ADDITIONAL_INVENTORY_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
    });

    it("checks revocation before processed IDs and preserves history after a new grant", async function () {
        const { token, marketer, customer, deliveryConfig } = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
        const dates = await token.getFunction("getLotDates")(lotId);
        await (await token.getFunction("setMarketer")(marketer.address, false)).wait();
        for (const id of [FIRST_DELIVERY_ID, SECOND_DELIVERY_ID]) {
            await expect(token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, id,
            )).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        }
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        await (await token.getFunction("setMarketer")(marketer.address, true)).wait();
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "AlreadyProcessed");
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, SECOND_LOT_AMOUNT, deliveryConfig, SECOND_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal(dates);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address))
            .to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT - SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("keeps delivery IDs caller-scoped and preserves balances on duplicate or conflict", async function () {
        const { token, marketer, customer, deliveryConfig } = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        await (await token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "AlreadyProcessed");
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, SECOND_LOT_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "OperationConflict");
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - 2n * CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(2n * CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("does not grant mint, configuration, or redemption authority", async function () {
        const { token, marketer, customer } = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const calls = [
            () => token.connect(marketer).getFunction("mintInventory")(marketer.address, ONE_POINT, ADDITIONAL_ISSUE_ID),
            () => token.connect(marketer).getFunction("mint")(customer.address, ONE_POINT, CUSTOMER_ISSUE_ID),
            () => token.connect(marketer).getFunction("mintLot")(customer.address, ONE_POINT, 1n, 2n, CUSTOMER_ISSUE_ID),
            () => token.connect(marketer).getFunction("configureBusiness")(
                DELIVERY_AGE_BUSINESS, abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [FEFO_ONLY_POLICY]),
            ),
            () => token.connect(marketer).getFunction("redeemFEFO")(customer.address, ONE_POINT, REDEMPTION_ID),
            () => token.connect(marketer).getFunction("burn")(customer.address, ONE_POINT, REDEMPTION_ID),
        ];
        for (const call of calls) {
            await expect(call()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        }
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("rolls back invalid direct deliveries and lets a corrected request reuse the ID", async function () {
        const cases = [
            { label: "amount", customer: "valid", value: 0n, config: "valid", error: "InvalidAmount" },
            { label: "customer", customer: "zero", value: CUSTOMER_AMOUNT, config: "valid", error: "InvalidAccount" },
            { label: "token", customer: "token", value: CUSTOMER_AMOUNT, config: "valid", error: "InvalidAccount" },
            { label: "config", customer: "valid", value: CUSTOMER_AMOUNT, config: "empty", error: "InvalidConfiguration" },
            { label: "trailing", customer: "valid", value: CUSTOMER_AMOUNT, config: "trailing", error: "InvalidConfiguration" },
            { label: "legacy duration", customer: "valid", value: CUSTOMER_AMOUNT, config: "legacy", error: "InvalidConfiguration" },
            { label: "inventory", customer: "valid", value: INVENTORY_AMOUNT + ONE_POINT, config: "valid", error: "InsufficientInventory" },
        ];
        for (const failure of cases) {
            const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
            const { token, marketer, customer, deliveryConfig } = context;
            const before = await deliveryAccounting(context);
            const id = ethers.id(`marketer/rollback/${failure.label}`);
            const recipient = failure.customer === "zero" ? ethers.ZeroAddress
                : failure.customer === "token" ? await token.getAddress() : customer.address;
            const config = failure.config === "empty" ? EMPTY_CONFIG
                : failure.config === "legacy" ? abiCoder.encode(DURATION_CONFIG_TYPES, [BigInt(LEGACY_DURATION_SECONDS)])
                : failure.config === "trailing" ? ethers.concat([deliveryConfig, MALFORMED_CONFIG_SUFFIX]) : deliveryConfig;
            await expect(token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, recipient, failure.value, config, id,
            )).to.be.revertedWithCustomError(token, failure.error);
            expect(await deliveryAccounting(context)).to.deep.equal(before);
            expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
            expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
            await (await token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, id,
            )).wait();
            expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
            expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        }
    });

    it("rolls back an unbounded expiry without consuming inventory or the delivery ID", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, deliveryConfig, deliveryWindow } = context;
        const before = await deliveryAccounting(context);
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT,
            abiCoder.encode(DATE_CONFIG_TYPES, [deliveryWindow.start, ethers.MaxUint256]), FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "InvalidMonthWindow");
        expect(await deliveryAccounting(context)).to.deep.equal(before);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
    });

    it("keeps original dates when delivered points travel onward or return to the Marketer", async function () {
        const { token, marketer, customer, recipient, deliveryConfig } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
        const dates = await token.getFunction("getLotDates")(lotId);
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, true)).wait();
        await (await token.connect(marketer).getFunction("allowSender")(recipient.address, true)).wait();
        await (await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        )).wait();
        await (await token.connect(recipient).getFunction("transferFEFO")(
            marketer.address, TRANSFER_AMOUNT, SECOND_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal(dates);
        expect(await token.getFunction("balanceByLot")(marketer.address, lotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        await networkHelpers.time.increaseTo(Number(dates[1]));
        expect(await token.getFunction("availableBalanceOf")(marketer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(marketer.address, lotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });
});

describe("Point Loyalty: D monthly windows", function () {
    it("allows the owner to deliver revoked stock without changing the permission", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, deliveryConfig } = context;
        const before = await deliveryAccounting(context);
        await (await token.getFunction("setMarketer")(marketer.address, false)).wait();
        expect(await deliveryAccounting(context)).to.deep.equal(before);
        await (await token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("isMarketer")(marketer.address)).to.equal(false);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(await token.getAddress())).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("requires configuration even when permission and inventory exist in Draft", async function () {
        const context = await networkHelpers.loadFixture(inventoryTokenFixture);
        const { token, marketer, customer } = context;
        const config = windowConfig(monthWindow(await networkHelpers.time.latest(), DELIVERY_MONTHS));
        await (await token.getFunction("setMarketer")(marketer.address, true)).wait();
        const before = await deliveryAccounting(context);
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, config, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
        await expect(token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, config, FIRST_DELIVERY_ID,
        )).to.be.revertedWithCustomError(token, "NotConfigured");
        expect(await deliveryAccounting(context)).to.deep.equal(before);
        await (await token.getFunction("configureBusiness")(
            DELIVERY_AGE_BUSINESS, abiCoder.encode(TRANSFER_POLICY_CONFIG_TYPES, [FEFO_ONLY_POLICY]),
        )).wait();
        await (await token.getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, config, FIRST_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
    });

    it("accepts a zero delivery ID and detects changed recipients and windows", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, recipient, deliveryConfig } = context;
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, ethers.ZeroHash,
        )).wait();
        const before = await deliveryAccounting(context);
        await expect(token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, ethers.ZeroHash,
        )).to.be.revertedWithCustomError(token, "AlreadyProcessed");
        for (const changed of [
            { recipient: recipient.address, config: deliveryConfig },
            { recipient: customer.address, config: windowConfig(monthWindow(await networkHelpers.time.latest(), SHORTER_DELIVERY_MONTHS)) },
        ]) {
            await expect(token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, changed.recipient, CUSTOMER_AMOUNT, changed.config, ethers.ZeroHash,
            )).to.be.revertedWithCustomError(token, "OperationConflict");
        }
        expect(await deliveryAccounting(context)).to.deep.equal(before);
    });

    it("keeps different N and different months in separate lots ordered by expiry", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, recipient, deliveryWindow } = context;
        const halfYearWindow = monthWindow(await networkHelpers.time.latest(), SHORTER_DELIVERY_MONTHS);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(deliveryWindow), FIRST_DELIVERY_ID,
        )).wait();
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, SECOND_LOT_AMOUNT, windowConfig(halfYearWindow), SECOND_DELIVERY_ID,
        )).wait();
        await networkHelpers.time.increaseTo(thaiInstant(2040, 7, 2, 12));
        const julyWindow = monthWindow(await networkHelpers.time.latest(), DELIVERY_MONTHS);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, TRANSFER_AMOUNT, windowConfig(julyWindow), ethers.id("july/delivery"),
        )).wait();

        const yearLotId = 1n;
        const halfYearLotId = 2n;
        const julyLotId = 3n;
        expect(await token.getFunction("lotCount")()).to.equal(julyLotId);
        const indexedLotIds = [];
        for (const position of [FIRST_LOT_POSITION, SECOND_LOT_POSITION, 2n]) {
            indexedLotIds.push(await token.getFunction("walletLotIds")(customer.address, position));
        }
        expect(indexedLotIds).to.deep.equal([halfYearLotId, yearLotId, julyLotId]);
        expect(await token.getFunction("getLotDates")(yearLotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
        expect(await token.getFunction("getLotDates")(halfYearLotId)).to.deep.equal([
            BigInt(halfYearWindow.start), BigInt(halfYearWindow.expiry),
        ]);
        expect(await token.getFunction("getLotDates")(julyLotId)).to.deep.equal([
            BigInt(julyWindow.start), BigInt(julyWindow.expiry),
        ]);

        const spillover = 10n;
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, true)).wait();
        await (await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, SECOND_LOT_AMOUNT + spillover, TRANSFER_ID,
        )).wait();
        expect(await token.getFunction("balanceByLot")(recipient.address, halfYearLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, yearLotId)).to.equal(spillover);
        expect(await token.getFunction("balanceByLot")(customer.address, yearLotId)).to.equal(CUSTOMER_AMOUNT - spillover);
        expect(await token.getFunction("balanceByLot")(customer.address, julyLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address))
            .to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT - SECOND_LOT_AMOUNT - TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("merges same-window deliveries from different callers into one lot", async function () {
        const { token, marketer, customer, deliveryConfig, deliveryWindow } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await ethers.provider.send(SET_AUTOMINE_RPC_METHOD, [false]);
        try {
            const first = await token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
            );
            const second = await token.getFunction("sendToCustomer")(
                marketer.address, customer.address, SECOND_LOT_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
            );
            await ethers.provider.send(MINE_BLOCK_RPC_METHOD, []);
            const firstReceipt = await first.wait();
            const secondReceipt = await second.wait();
            if (!firstReceipt || !secondReceipt) throw new Error("Missing same-block delivery receipts");
            expect(secondReceipt.blockNumber).to.equal(firstReceipt.blockNumber);
            const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
            expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
                BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
            ]);
            expect(await token.getFunction("lotCount")()).to.equal(SINGLE_TOKEN_COUNT);
            expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(SINGLE_TOKEN_COUNT);
            expect(await token.getFunction("balanceByLot")(customer.address, lotId)).to.equal(CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT);
            expect(await token.getFunction("inventoryBalanceOf")(marketer.address))
                .to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT - SECOND_LOT_AMOUNT);
            expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        } finally {
            await ethers.provider.send(SET_AUTOMINE_RPC_METHOD, [true]);
        }
    });

    it("merges noon, afternoon and late-month deliveries without changing supply or dates", async function () {
        const { token, marketer, customer, deliveryConfig, deliveryWindow } =
            await networkHelpers.loadFixture(delegatedDeliveryFixture);
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        const firstBlock = await ethers.provider.getBlockNumber();
        const deliveries = [
            { at: thaiInstant(2040, 6, 7, 15), caller: token.connect(marketer), amount: SECOND_LOT_AMOUNT, id: SECOND_DELIVERY_ID },
            { at: thaiInstant(2040, 6, 28, 9), caller: token, amount: FOLLOWUP_OWNER_AMOUNT, id: ethers.id("monthly/owner-followup") },
        ];
        for (const delivery of deliveries) {
            await networkHelpers.time.setNextBlockTimestamp(delivery.at);
            await (await delivery.caller.getFunction("sendToCustomer")(
                marketer.address, customer.address, delivery.amount, deliveryConfig, delivery.id,
            )).wait();
            expect(await networkHelpers.time.latest()).to.equal(delivery.at);
            expect(await ethers.provider.getBlockNumber()).to.be.greaterThan(firstBlock);
        }
        const totalDelivered = CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT + FOLLOWUP_OWNER_AMOUNT;
        const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
        expect(await token.getFunction("lotCount")()).to.equal(SINGLE_TOKEN_COUNT);
        expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(SINGLE_TOKEN_COUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(totalDelivered);
        expect(await token.getFunction("balanceByLot")(customer.address, lotId)).to.equal(totalDelivered);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - totalDelivered);
        expect(await token.getFunction("balanceOf")(await token.getAddress())).to.equal(INVENTORY_AMOUNT - totalDelivered);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(deliveryWindow.start), BigInt(deliveryWindow.expiry),
        ]);
    });

    it("requires wallet opt-in and rejects both transfer and redeem at D expiry", async function () {
        const context = await deliveredAgeContext();
        const { token, customer, recipient, lotId, deliveryWindow } = context;
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, false)).wait();
        const before = await deliveryAccounting(context);
        await expect(token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        )).to.be.revertedWithCustomError(token, "SenderNotAllowed");
        expect(await deliveryAccounting(context)).to.deep.equal(before);
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, true)).wait();
        await networkHelpers.time.increaseTo(deliveryWindow.expiry);
        expect(await token.getFunction("lotValidityStatus")(lotId)).to.equal(EXPIRED_LOT_STATUS);
        await expect(token.connect(customer).getFunction("transferFEFO").staticCall(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        )).to.be.revertedWithCustomError(token, "InsufficientAvailableBalance");
        await expect(token.getFunction("redeemFEFO").staticCall(customer.address, REDEMPTION_AMOUNT, REDEMPTION_ID))
            .to.be.revertedWithCustomError(token, "InsufficientAvailableBalance");
        expect(await deliveryAccounting(context)).to.deep.equal(before);
    });

    it("uses D manual selection without changing dates and rejects it under FEFO_ONLY", async function () {
        await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const context = await delegatedDeliveryContext(USER_SELECT_POLICY);
        const { token, marketer, customer, recipient, deliveryConfig } = context;
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, deliveryConfig, FIRST_DELIVERY_ID,
        )).wait();
        const firstLotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
        const shortConfig = windowConfig(monthWindow(await networkHelpers.time.latest(), SHORTER_DELIVERY_MONTHS));
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, SECOND_LOT_AMOUNT, shortConfig, SECOND_DELIVERY_ID,
        )).wait();
        const firstDates = await token.getFunction("getLotDates")(firstLotId);
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, true)).wait();
        await (await token.connect(customer).getFunction("transferLots")(
            recipient.address, [{ lotId: firstLotId, value: TRANSFER_AMOUNT }], TRANSFER_ID,
        )).wait();
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(FIRST_LOT_TRANSFER_REMAINDER);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("getLotDates")(firstLotId)).to.deep.equal(firstDates);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
        const fefo = await deliveredAgeContext();
        await expect(fefo.token.connect(fefo.customer).getFunction("transferLots")(
            fefo.recipient.address, [{ lotId: fefo.lotId, value: TRANSFER_AMOUNT }], TRANSFER_ID,
        )).to.be.revertedWithCustomError(fefo.token, "ManualSelectionDisabled");
    });

    it("bounds a wallet to the worst-case lot count when every allowed window is used every month", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer } = context;
        const monthsToSimulate = MAX_EXPIRY_MONTHS_AHEAD;
        let deliveryIndex = 0;
        for (let monthOffset = 0; monthOffset < monthsToSimulate; monthOffset += 1) {
            if (monthOffset > 0) await networkHelpers.time.increaseTo(thaiInstant(2040, 6 + monthOffset, 7, 12));
            const now = await networkHelpers.time.latest();
            for (let monthsAhead = MIN_EXPIRY_MONTHS_AHEAD; monthsAhead <= MAX_EXPIRY_MONTHS_AHEAD; monthsAhead += 1) {
                await (await token.connect(marketer).getFunction("sendToCustomer")(
                    marketer.address, customer.address, ONE_POINT, windowConfig(windowAhead(now, monthsAhead)),
                    ethers.id(`bound/${deliveryIndex}`),
                )).wait();
                deliveryIndex += 1;
            }
        }

        let expectedLiveLots = 0;
        for (let monthsSinceCreation = 0; monthsSinceCreation < monthsToSimulate; monthsSinceCreation += 1) {
            for (let monthsAhead = MIN_EXPIRY_MONTHS_AHEAD; monthsAhead <= MAX_EXPIRY_MONTHS_AHEAD; monthsAhead += 1) {
                if (monthsAhead > monthsSinceCreation) expectedLiveLots += 1;
            }
        }
        expect(expectedLiveLots).to.equal(90);
        expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(BigInt(expectedLiveLots));
        expect(await token.getFunction("availableBalanceOf")(customer.address)).to.equal(BigInt(expectedLiveLots));
        expect(BigInt(expectedLiveLots) < await token.getFunction("maxWalletLots")()).to.equal(true);
    });

    it("accepts windows from 2 to 13 months ahead and rejects the neighbours", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer } = context;
        const now = await networkHelpers.time.latest();
        expect(await token.getFunction("maxExpiryMonthsAhead")()).to.equal(BigInt(MAX_EXPIRY_MONTHS_AHEAD));
        const cases = [
            { monthsAhead: MIN_EXPIRY_MONTHS_AHEAD - 1, accepted: false },
            { monthsAhead: MIN_EXPIRY_MONTHS_AHEAD, accepted: true },
            { monthsAhead: MAX_EXPIRY_MONTHS_AHEAD, accepted: true },
            { monthsAhead: MAX_EXPIRY_MONTHS_AHEAD + 1, accepted: false },
        ];
        for (const { monthsAhead, accepted } of cases) {
            const send = () => token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, ONE_POINT, windowConfig(windowAhead(now, monthsAhead)),
                ethers.id(`months-ahead/${monthsAhead}`),
            );
            if (accepted) await (await send()).wait();
            else await expect(send()).to.be.revertedWithCustomError(token, "InvalidMonthWindow");
        }
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(2n * ONE_POINT);
    });

    it("rejects every malformed or stale window for both callers and leaves no trace", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, deliveryWindow } = context;
        const now = await networkHelpers.time.latest();
        const previousMonthStart = windowAhead(deliveryWindow.start - 1, 0).start;
        const nextMonthStart = windowAhead(now, 1).expiry;
        const cases: { label: string; window: MonthWindow; error: string }[] = [
            { label: "stale month", window: windowAhead(deliveryWindow.start - 1, MAX_EXPIRY_MONTHS_AHEAD), error: "MonthWindowNotCurrent" },
            { label: "future month", window: { start: nextMonthStart, expiry: windowAhead(now, MAX_EXPIRY_MONTHS_AHEAD).expiry }, error: "MonthWindowNotCurrent" },
            { label: "start inside the month", window: { start: deliveryWindow.start + 1, expiry: deliveryWindow.expiry }, error: "MonthWindowNotCurrent" },
            { label: "expiry one second late", window: { start: deliveryWindow.start, expiry: deliveryWindow.expiry + 1 }, error: "InvalidMonthWindow" },
            { label: "expiry one second early", window: { start: deliveryWindow.start, expiry: deliveryWindow.expiry - 1 }, error: "InvalidMonthWindow" },
            { label: "one month ahead", window: windowAhead(now, MIN_EXPIRY_MONTHS_AHEAD - 1), error: "InvalidMonthWindow" },
            { label: "fourteen months ahead", window: windowAhead(now, MAX_EXPIRY_MONTHS_AHEAD + 1), error: "InvalidMonthWindow" },
            { label: "empty range", window: { start: deliveryWindow.start, expiry: deliveryWindow.start }, error: "InvalidDateRange" },
            { label: "expiry already passed", window: { start: previousMonthStart, expiry: deliveryWindow.start }, error: "PointExpired" },
        ];
        const callers = [
            { label: "Marketer", contract: token.connect(marketer) },
            { label: "Owner", contract: token },
        ];
        const before = await deliveryAccounting(context);

        for (const failure of cases) {
            for (const caller of callers) {
                await expect(caller.contract.getFunction("sendToCustomer")(
                    marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(failure.window), FIRST_DELIVERY_ID,
                ), `${caller.label}: ${failure.label}`).to.be.revertedWithCustomError(token, failure.error);
            }
            expect(await deliveryAccounting(context)).to.deep.equal(before);
        }
        await (await token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(deliveryWindow), FIRST_DELIVERY_ID,
        )).wait();
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
    });

    it("rejects a June window mined in July and accepts the July window with the same ID", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, deliveryWindow } = context;
        const justAfterMidnight = thaiInstant(2040, 7, 1, 0, 0, 5);
        const send = (window: MonthWindow) => token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(window), FIRST_DELIVERY_ID,
        );
        await networkHelpers.time.setNextBlockTimestamp(justAfterMidnight);
        await expect(send(deliveryWindow)).to.be.revertedWithCustomError(token, "MonthWindowNotCurrent");

        const julyWindow = monthWindow(justAfterMidnight, DELIVERY_MONTHS);
        await (await send(julyWindow)).wait();
        const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
        expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
            BigInt(julyWindow.start), BigInt(julyWindow.expiry),
        ]);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(INVENTORY_AMOUNT - CUSTOMER_AMOUNT);
    });

    it("counts 17:00 UTC on the last day of June as July in Thai time", async function () {
        const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
        const { token, marketer, customer, deliveryWindow } = context;
        const utcEdge = Date.UTC(2040, 5, 30, 17, 30) / 1000;
        const send = (window: MonthWindow) => token.connect(marketer).getFunction("sendToCustomer")(
            marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(window), FIRST_DELIVERY_ID,
        );
        await networkHelpers.time.setNextBlockTimestamp(utcEdge);
        await expect(send(deliveryWindow)).to.be.revertedWithCustomError(token, "MonthWindowNotCurrent");

        const julyWindow = monthWindow(utcEdge, DELIVERY_MONTHS);
        expect(julyWindow.start).to.equal(thaiInstant(2040, 7, 1));
        await (await send(julyWindow)).wait();
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT);
    });

    for (const vector of [
        { label: "31 January with N=1", at: thaiInstant(2041, 1, 31, 9), months: 1, start: thaiInstant(2041, 1, 1), expiry: thaiInstant(2041, 3, 1) },
        { label: "29 February 2044 with N=12", at: thaiInstant(2044, 2, 29, 9), months: 12, start: thaiInstant(2044, 2, 1), expiry: thaiInstant(2045, 3, 1) },
        { label: "15 December with N=2", at: thaiInstant(2041, 12, 15, 9), months: 2, start: thaiInstant(2041, 12, 1), expiry: thaiInstant(2042, 3, 1) },
    ]) {
        it(`accepts the hand-checked window for ${vector.label} and rejects a window one day later`, async function () {
            const context = await networkHelpers.loadFixture(delegatedDeliveryFixture);
            const { token, marketer, customer } = context;
            const handChecked: MonthWindow = { start: vector.start, expiry: vector.expiry };
            expect(monthWindow(vector.at, vector.months)).to.deep.equal(handChecked);
            const send = (window: MonthWindow) => token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, CUSTOMER_AMOUNT, windowConfig(window), FIRST_DELIVERY_ID,
            );
            await networkHelpers.time.setNextBlockTimestamp(vector.at);
            await expect(send({ start: vector.start, expiry: vector.expiry + ONE_DAY_SECONDS }))
                .to.be.revertedWithCustomError(token, "InvalidMonthWindow");
            await (await send(handChecked)).wait();
            const lotId = await token.getFunction("walletLotIds")(customer.address, FIRST_LOT_POSITION);
            expect(await token.getFunction("getLotDates")(lotId)).to.deep.equal([
                BigInt(vector.start), BigInt(vector.expiry),
            ]);
        });
    }

    for (const business of [LOT_FEFO_BUSINESS, LOT_SELECTION_BUSINESS]) {
        it(`keeps business ${business} owner-only and inclusive at the lot expiry boundary`, async function () {
            const fixture = business === LOT_FEFO_BUSINESS ? fefoLotTokenFixture : manualLotTokenFixture;
            const context = await networkHelpers.loadFixture(fixture);
            const { token, marketer, customer, recipient, startDate, firstExpireDate, firstLotId } = context;
            await (await token.getFunction("setMarketer")(marketer.address, true)).wait();
            const before = await deliveryAccounting(context);
            const config = abiCoder.encode(DATE_CONFIG_TYPES, [startDate, firstExpireDate]);
            await expect(token.connect(marketer).getFunction("sendToCustomer")(
                marketer.address, customer.address, ONE_POINT, config, FIRST_DELIVERY_ID,
            )).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount").withArgs(marketer.address);
            expect(await deliveryAccounting(context)).to.deep.equal(before);
            await (await token.getFunction("sendToCustomer")(
                marketer.address, customer.address, ONE_POINT, config, TRANSFER_ID,
            )).wait();
            await networkHelpers.time.setNextBlockTimestamp(firstExpireDate);
            await (await token.connect(customer).getFunction("transferFEFO")(recipient.address, TRANSFER_AMOUNT, TRANSFER_ID)).wait();
            expect(await token.getFunction("lotValidityStatus")(firstLotId)).to.equal(ACTIVE_LOT_STATUS);
            expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
            await networkHelpers.time.increaseTo(firstExpireDate + EXPIRY_BOUNDARY_OFFSET);
            expect(await token.getFunction("lotValidityStatus")(firstLotId)).to.equal(EXPIRED_LOT_STATUS);
            expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        });
    }
});

describe("Point Loyalty: security regressions", function () {
    it("preserves standard ERC20 zero-value transfers without spending escrow or creating Customer balances", async function () {
        const { token, customer, recipient, startDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        await networkHelpers.time.increaseTo(startDate);

        await expect(token.connect(customer).getFunction("transfer")(recipient.address, EMPTY_SUPPLY))
            .to.emit(token, "Transfer").withArgs(customer.address, recipient.address, EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceOf")(await token.getAddress())).to.equal(INVENTORY_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("still rejects an explicit zero-value FEFO transfer", async function () {
        const { token, customer, recipient, startDate } = await networkHelpers.loadFixture(sharedDateTokenFixture);
        await networkHelpers.time.increaseTo(startDate);

        await expect(token.connect(customer).getFunction("transferFEFO")(recipient.address, EMPTY_SUPPLY, TRANSFER_ID))
            .to.be.revert(ethers);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("accepts manual allocations ordered by lotId even when expiry order is reversed", async function () {
        const { token, customer, recipient, earlierCreatedLot, laterCreatedLot } =
            await networkHelpers.loadFixture(outOfOrderExpiryFixture);
        expect(earlierCreatedLot).to.be.lessThan(laterCreatedLot);
        const transaction = await token.connect(customer).getFunction("transferLots")(
            recipient.address, [
                { lotId: earlierCreatedLot, value: MANUAL_FIRST_LOT_REMAINDER },
                { lotId: laterCreatedLot, value: MANUAL_SECOND_LOT_REMAINDER },
            ], TRANSFER_ID,
        );
        await transaction.wait();

        expect(await token.getFunction("balanceByLot")(recipient.address, earlierCreatedLot))
            .to.equal(MANUAL_FIRST_LOT_REMAINDER);
        expect(await token.getFunction("balanceByLot")(recipient.address, laterCreatedLot))
            .to.equal(MANUAL_SECOND_LOT_REMAINDER);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("rejects noncanonical manual lotId order without changing any balances", async function () {
        const { token, customer, recipient, earlierCreatedLot, laterCreatedLot } =
            await networkHelpers.loadFixture(outOfOrderExpiryFixture);

        await expect(token.connect(customer).getFunction("transferLots")(
            recipient.address, [
                { lotId: laterCreatedLot, value: MANUAL_SECOND_LOT_REMAINDER },
                { lotId: earlierCreatedLot, value: MANUAL_FIRST_LOT_REMAINDER },
            ], TRANSFER_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, earlierCreatedLot)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, laterCreatedLot)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
    });

    it("rejects an explicit FEFO self-transfer even when the sender grants self permission", async function () {
        const { token, customer, firstLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);
        const permission = await token.connect(customer).getFunction("allowSender")(customer.address, true);
        await permission.wait();

        await expect(token.connect(customer).getFunction("transferFEFO")(customer.address, TRANSFER_AMOUNT, TRANSFER_ID))
            .to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("rejects a manual self-transfer even when the sender grants self permission", async function () {
        const { token, customer, secondLotId } = await networkHelpers.loadFixture(manualLotTokenFixture);
        const permission = await token.connect(customer).getFunction("allowSender")(customer.address, true);
        await permission.wait();

        await expect(token.connect(customer).getFunction("transferLots")(
            customer.address, [{ lotId: secondLotId, value: TRANSFER_AMOUNT }], TRANSFER_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("routes standard transferFrom through FEFO and restores allowance when recipient permission is denied", async function () {
        const { token, marketer, customer, recipient, firstLotId, secondLotId } =
            await networkHelpers.loadFixture(fefoLotTokenFixture);
        await (await token.connect(customer).getFunction("approve")(marketer.address, TRANSFER_AMOUNT)).wait();
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, false)).wait();
        await expect(token.connect(marketer).getFunction("transferFrom")(
            customer.address, recipient.address, TRANSFER_AMOUNT,
        )).to.be.revert(ethers);
        expect(await token.getFunction("allowance")(customer.address, marketer.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        await (await token.connect(recipient).getFunction("allowSender")(customer.address, true)).wait();
        await (await token.connect(marketer).getFunction("transferFrom")(
            customer.address, recipient.address, TRANSFER_AMOUNT,
        )).wait();
        expect(await token.getFunction("allowance")(customer.address, marketer.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, secondLotId)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("denies ordinary deposits into escrow without consuming allowance or altering inventory backing", async function () {
        const { token, marketer, customer, firstLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);
        const escrow = await token.getAddress();
        const backing = await token.getFunction("balanceOf")(escrow);
        await (await token.connect(customer).getFunction("approve")(marketer.address, TRANSFER_AMOUNT)).wait();

        await expect(token.connect(marketer).getFunction("transferFrom")(
            customer.address, escrow, TRANSFER_AMOUNT,
        )).to.be.revert(ethers);
        expect(await token.getFunction("allowance")(customer.address, marketer.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("balanceOf")(escrow)).to.equal(backing);
        expect(await token.getFunction("inventoryBalanceOf")(marketer.address)).to.equal(backing);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
    });

    it("rejects reusing an inventory issue ID for redemption even when the caller owns both operations", async function () {
        const { token, customer, firstLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);

        await expect(token.getFunction("redeemFEFO")(customer.address, REDEMPTION_AMOUNT, ISSUE_ID))
            .to.be.revertedWithCustomError(token, "OperationConflict");
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT);
    });

    it("does not consume a redemption ID when an insufficient-balance request reverts", async function () {
        const { token, customer, secondLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);

        await expect(token.getFunction("redeemFEFO")(customer.address, INVENTORY_AMOUNT, REDEMPTION_ID))
            .to.be.revert(ethers);
        const transaction = await token.getFunction("redeemFEFO")(customer.address, REDEMPTION_AMOUNT, REDEMPTION_ID);
        await transaction.wait();
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceOf")(customer.address)).to.equal(CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT - REDEMPTION_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT - REDEMPTION_AMOUNT);
    });

    it("rolls back a full recipient index and retains Pending lots while pruning expired history", async function () {
        const { token, customer, recipient, firstLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);
        const now = await networkHelpers.time.latest();
        const limit = ethers.getBigInt(await token.getFunction("maxWalletLots")());
        for (let position = 0n; position < limit; position += ONE_POINT) {
            const start = position === FIRST_LOT_POSITION ? now : now + ONE_DAY_SECONDS + START_DELAY_SECONDS;
            const expiry = position === FIRST_LOT_POSITION ? now + ONE_DAY_SECONDS
                : now + LONG_LOT_VALIDITY_SECONDS + Number(position) * ONE_DAY_SECONDS;
            await (await token.getFunction("mintLot")(
                recipient.address, ONE_POINT, start, expiry, ethers.id(`capacity/${position}`),
            )).wait();
        }
        const expiringLot = ethers.getBigInt(await token.getFunction("walletLotIds")(recipient.address, FIRST_LOT_POSITION));
        expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit);
        await expect(token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        await networkHelpers.time.increaseTo(now + ONE_DAY_SECONDS + EXPIRY_BOUNDARY_OFFSET);
        await (await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, TRANSFER_AMOUNT, TRANSFER_ID,
        )).wait();
        expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit);
        expect(await token.getFunction("balanceByLot")(recipient.address, expiringLot)).to.equal(ONE_POINT);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(TRANSFER_AMOUNT);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + limit);
    });
});

describe("Point Loyalty: batch credit gas and rollback", function () {
    it("does not prune a recipient with expired entries during a standard zero-value lot transfer", async function () {
        const { token, customer, recipient, limit, firstExpiredLot, secondExpiredLot } =
            await networkHelpers.loadFixture(cleanupReceiverBatchFixture);

        await expect(token.connect(customer).getFunction("transfer")(recipient.address, EMPTY_SUPPLY))
            .to.emit(token, "Transfer").withArgs(customer.address, recipient.address, EMPTY_SUPPLY);
        expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstExpiredLot)).to.equal(ONE_POINT);
        expect(await token.getFunction("balanceByLot")(recipient.address, secondExpiredLot)).to.equal(ONE_POINT);
        expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + limit);
    });

    for (const mode of ["FEFO", "manual"]) {
        it(`credits 32 overlapping lots through ${mode} within the execution gas budget`, async function () {
            const { token, customer, recipient, count } = await networkHelpers.loadFixture(performanceOverlapWalletFixture);
            const allocations = Array.from({ length: Number(count) }, (_, position) => ({
                lotId: BigInt(position) + ONE_POINT, value: ONE_POINT,
            }));
            const method = mode === "FEFO" ? token.connect(customer).getFunction("transferFEFO")
                : token.connect(customer).getFunction("transferLots");
            const request = mode === "FEFO" ? count : allocations;
            const estimate = await method.estimateGas(recipient.address, request, TRANSFER_ID);
            expect(estimate).to.be.at.most(BATCH_GAS_BUDGET);
            const transaction = await method(recipient.address, request, TRANSFER_ID, { gasLimit: BATCH_GAS_BUDGET });
            const receipt = await transaction.wait();

            expect(receipt?.status).to.equal(CONFIRMED_RECEIPT_STATUS);
            expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(count);
            expect(await token.getFunction("balanceOf")(customer.address)).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(count + count);
            expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + count + count);
            for (const allocation of allocations) {
                expect(await token.getFunction("balanceByLot")(recipient.address, allocation.lotId)).to.equal(ONE_POINT + ONE_POINT);
            }
        });
    }

    it("rolls back all batch allocations and its operation ID if a later new lot exceeds recipient capacity", async function () {
        const { token, customer, recipient, firstLotId, secondLotId } = await networkHelpers.loadFixture(fefoLotTokenFixture);
        const start = await networkHelpers.time.latest();
        const limit = ethers.getBigInt(await token.getFunction("maxWalletLots")());
        for (let position = 0n; position < limit - ONE_POINT; position += ONE_POINT) {
            await (await token.getFunction("mintLot")(
                recipient.address, ONE_POINT, start,
                BigInt(start + LONG_LOT_VALIDITY_SECONDS) + position * BigInt(ONE_DAY_SECONDS),
                ethers.id(`batch/capacity/${position}`),
            )).wait();
        }
        const supply = INVENTORY_AMOUNT + limit - ONE_POINT;
        await expect(token.connect(customer).getFunction("transferFEFO")(
            recipient.address, CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT, TRANSFER_ID,
        )).to.be.revert(ethers);
        expect(await token.getFunction("balanceByLot")(customer.address, firstLotId)).to.equal(CUSTOMER_AMOUNT);
        expect(await token.getFunction("balanceByLot")(customer.address, secondLotId)).to.equal(SECOND_LOT_AMOUNT);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(EMPTY_SUPPLY);
        expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit - ONE_POINT);
        expect(await token.getFunction("totalSupply")()).to.equal(supply);
        await (await token.connect(customer).getFunction("transferFEFO")(
            recipient.address, ONE_POINT, TRANSFER_ID,
        )).wait();
        expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit);
        expect(await token.getFunction("balanceByLot")(recipient.address, firstLotId)).to.equal(ONE_POINT);
        expect(await token.getFunction("totalSupply")()).to.equal(supply);
    });

    for (const mode of ["FEFO", "manual"]) {
        it(`retains Pending and expired history while ${mode} credits a multi-lot batch into freed slots`, async function () {
            const { token, customer, recipient, firstLotId, secondLotId, limit, firstExpiredLot, secondExpiredLot } =
                await networkHelpers.loadFixture(cleanupReceiverBatchFixture);
            const allocations = [
                { lotId: firstLotId, value: CUSTOMER_AMOUNT },
                { lotId: secondLotId, value: SECOND_LOT_AMOUNT },
            ];
            const method = mode === "FEFO" ? token.connect(customer).getFunction("transferFEFO")
                : token.connect(customer).getFunction("transferLots");
            const request = mode === "FEFO" ? CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT : allocations;
            await (await method(recipient.address, request, TRANSFER_ID)).wait();

            expect(await token.getFunction("walletLotCount")(recipient.address)).to.equal(limit);
            expect(await token.getFunction("walletLotCount")(customer.address)).to.equal(EMPTY_SUPPLY);
            expect(await token.getFunction("balanceByLot")(recipient.address, firstExpiredLot)).to.equal(ONE_POINT);
            expect(await token.getFunction("balanceByLot")(recipient.address, secondExpiredLot)).to.equal(ONE_POINT);
            expect(await token.getFunction("availableBalanceOf")(recipient.address)).to.equal(CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT);
            expect(await token.getFunction("balanceOf")(recipient.address)).to.equal(limit + CUSTOMER_AMOUNT + SECOND_LOT_AMOUNT);
            expect(await token.getFunction("totalSupply")()).to.equal(INVENTORY_AMOUNT + limit);
            for (const allocation of allocations) {
                expect(await token.getFunction("balanceByLot")(recipient.address, allocation.lotId)).to.equal(allocation.value);
            }
        });
    }
});
