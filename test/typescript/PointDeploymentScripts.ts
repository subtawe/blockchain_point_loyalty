import { expect } from "chai";
import hre from "hardhat";
import { mock } from "node:test";
import { finishPointSetup } from "../../scripts/runPointDeployment.js";
import { readPointBusiness, readPointDates, readPointFactoryAddress, readPointInventory } from "../../scripts/pointParameters.js";
import {
    assertPointDatesCurrent, assertPointFactoryReady, configurePointBusiness, deployPointToken,
    mintPointInventory, readDeployedPointAddress, readPointEvent,
} from "../../scripts/pointDeployment.js";

const { ethers, networkHelpers } = await hre.network.connect();
const validDates = { POINT_START_DATE: "1700000000", POINT_EXPIRE_DATE: "1800000000" };

describe("Point deployment inputs", function () {
    it("keeps omitted business input in Draft without inventing dates", function () {
        expect(readPointBusiness({})).to.deep.equal({ kind: "Draft" });
        expect(readPointBusiness(validDates)).to.deep.equal({ kind: "Draft" });
    });

    it("reads explicit business configuration and canonical policies", function () {
        expect(readPointBusiness({ ...validDates, POINT_BUSINESS: "A" }))
            .to.deep.equal({ kind: "A", startDate: 1700000000n, expireDate: 1800000000n });
        expect(readPointBusiness({ POINT_BUSINESS: "B" })).to.deep.equal({ kind: "B", policy: "FEFO_ONLY" });
        expect(readPointBusiness({ POINT_BUSINESS: "C" })).to.deep.equal({ kind: "C", policy: "USER_SELECT" });
        for (const policy of ["FEFO_ONLY", "USER_SELECT"]) {
            expect(readPointBusiness({ POINT_BUSINESS: "D", POINT_TRANSFER_POLICY: policy }))
                .to.deep.equal({ kind: "D", policy });
        }
    });

    it("rejects unknown businesses, missing A dates and conflicting policies", function () {
        expect(() => readPointBusiness({ POINT_BUSINESS: "" })).to.throw("POINT_BUSINESS");
        expect(() => readPointBusiness({ POINT_BUSINESS: "E" })).to.throw("POINT_BUSINESS");
        expect(() => readPointBusiness({ POINT_BUSINESS: "A" })).to.throw("POINT_START_DATE");
        expect(() => readPointBusiness({ POINT_BUSINESS: "B", POINT_TRANSFER_POLICY: "USER_SELECT" }))
            .to.throw("FEFO_ONLY");
        expect(() => readPointBusiness({ POINT_BUSINESS: "C", POINT_TRANSFER_POLICY: "FEFO_ONLY" }))
            .to.throw("USER_SELECT");
        expect(() => readPointBusiness({ POINT_BUSINESS: "D" })).to.throw("POINT_TRANSFER_POLICY");
    });

    it("reads explicit seconds without converting or defaulting dates", function () {
        expect(readPointDates(validDates)).to.deep.equal({ startDate: 1700000000n, expireDate: 1800000000n });
        expect(readPointDates({ ...validDates, POINT_START_DATE: "0" }).startDate).to.equal(0n);
    });

    for (const value of [undefined, "", "-1", "1.5", "1e9", " 1700000000", "1700000000000"]) {
        it(`rejects invalid date input ${JSON.stringify(value)} for either date`, function () {
            for (const key of ["POINT_START_DATE", "POINT_EXPIRE_DATE"]) {
                expect(() => readPointDates({ ...validDates, [key]: value })).to.throw(key);
            }
        });
    }

    it("rejects equal or reversed dates", function () {
        for (const end of ["1700000000", "1699999999"]) {
            expect(() => readPointDates({ ...validDates, POINT_EXPIRE_DATE: end })).to.throw("must be before");
        }
    });

    it("requires a nonzero address and validates mixed-case checksums", function () {
        for (const address of [undefined, "", "0x123", ethers.ZeroAddress, "0x52908400098527886e0F7030069857D2E4169EE7"]) {
            expect(() => readPointFactoryAddress({ POINT_FACTORY_ADDRESS: address })).to.throw("valid nonzero address");
        }
        expect(readPointFactoryAddress({ POINT_FACTORY_ADDRESS: "0x52908400098527886e0f7030069857d2e4169ee7" }))
            .to.equal("0x52908400098527886E0F7030069857D2E4169EE7");
    });

    it("requires explicit inventory amount, recipient and stable operation ID together", function () {
        const env = {
            POINT_INVENTORY_AMOUNT: "100",
            POINT_INVENTORY_RECIPIENT: "0x52908400098527886e0f7030069857d2e4169ee7",
            POINT_INVENTORY_OPERATION_ID: ethers.id("stock-request"),
        };
        expect(readPointInventory({})).to.deep.equal({ kind: "none" });
        expect(readPointInventory(env)).to.deep.equal({
            kind: "mint", amount: 100n, recipient: ethers.getAddress(env.POINT_INVENTORY_RECIPIENT),
            operationId: env.POINT_INVENTORY_OPERATION_ID,
        });
        for (const amount of [undefined, "", "0", "-1", "1.5", " 100", (ethers.MaxUint256 + 1n).toString()]) {
            expect(() => readPointInventory({ ...env, POINT_INVENTORY_AMOUNT: amount })).to.throw("AMOUNT");
        }
        for (const operationId of [undefined, "", "0x123", ethers.ZeroHash]) {
            expect(() => readPointInventory({ ...env, POINT_INVENTORY_OPERATION_ID: operationId })).to.throw("OPERATION_ID");
        }
        expect(() => readPointInventory({ ...env, POINT_INVENTORY_RECIPIENT: undefined })).to.throw("RECIPIENT");
        expect(() => readPointInventory({ ...env, POINT_INVENTORY_RECIPIENT: ethers.ZeroAddress })).to.throw("RECIPIENT");
    });
});

async function factoryFixture() {
    const [owner, holder] = await ethers.getSigners();
    const standalone = await ethers.deployContract("PointTokenFactory");
    const implementation = await ethers.deployContract("UpgradablePointFactory");
    const proxy = await ethers.deployContract("AppProxy", [
        await implementation.getAddress(), implementation.interface.encodeFunctionData("initialize"),
    ]);
    const upgradable = await ethers.getContractAt("UpgradablePointFactory", await proxy.getAddress());
    const now = BigInt(await networkHelpers.time.latest());
    return { owner, holder, standalone, implementation, upgradable, startDate: now + 100n, expireDate: now + 1000n };
}

describe("Point deployment preflight and receipts", function () {
    it("checks expiry against chain time, including the exact creation boundary", async function () {
        const now = BigInt(await networkHelpers.time.latest());
        await assertPointDatesCurrent(ethers.provider, { startDate: 0n, expireDate: now + 1n });
        for (const expireDate of [now, now - 1n]) {
            await expect(assertPointDatesCurrent(ethers.provider, { startDate: 0n, expireDate }))
                .to.be.rejectedWith("after the latest chain timestamp");
        }
        await expect(assertPointDatesCurrent({ getBlock: async () => null }, { startDate: 0n, expireDate: now + 1n }))
            .to.be.rejectedWith("Cannot read the latest block");
    });

    it("rejects unsupported versions before attempting ownership checks", async function () {
        await expect(assertPointFactoryReady({
            pointTokenVersion: async () => 1n,
            owner: async () => { throw new Error("should not be called"); },
        }, ethers.ZeroAddress)).to.be.rejectedWith("version 3 required");
    });

    it("fails for the wrong owner and does not try to initialize ownerless contracts", async function () {
        const { standalone, implementation, owner, holder } = await networkHelpers.loadFixture(factoryFixture);
        await expect(assertPointFactoryReady(standalone, holder.address)).to.be.rejectedWith("Signer is not the owner");
        await expect(assertPointFactoryReady(implementation, owner.address)).to.be.rejectedWith("Factory has no owner");
        expect(await implementation.owner()).to.equal(ethers.ZeroAddress);
    });

    const factoryKinds: ("standalone" | "upgradable")[] = ["standalone", "upgradable"];
    for (const kind of factoryKinds) {
        it(`reports the confirmed ${kind} token address when configuration expires after deployment`, async function () {
            const context = await networkHelpers.loadFixture(factoryFixture);
            const { owner, startDate, expireDate } = context;
            const factory = context[kind];
            const address = await deployPointToken(factory, { name: "Recoverable", symbol: "RCV" });
            const token = await ethers.getContractAt("PointToken", address);
            await networkHelpers.time.increaseTo(expireDate);

            const log = mock.method(console, "log", () => {});
            try {
                await expect(finishPointSetup(token, { kind: "A", startDate, expireDate },
                    { kind: "none" }, owner.address, ethers.provider))
                    .to.be.rejectedWith("after the latest chain timestamp");
            } finally {
                log.mock.restore();
            }

            expect(await ethers.provider.getCode(address)).not.to.equal("0x");
            expect(await factory.getDeployedTokensCount()).to.equal(1n);
            expect(await token.state()).to.equal(0n);
            expect(log.mock.calls.map(call => call.arguments)).to.deep.equal([["Token:", address]]);
        });

        it(`extracts an empty Draft from the ${kind} factory receipt`, async function () {
            const context = await networkHelpers.loadFixture(factoryFixture);
            const { owner, holder } = context;
            const factory = context[kind];
            await assertPointFactoryReady(factory, owner.address);
            const tx = await factory.deployPointToken("Points", "PTS");
            const receipt = await tx.wait();
            if (!receipt) throw new Error("Expected a mined deployment receipt");
            const address = await factory.getAddress();
            const deployed = readDeployedPointAddress(receipt, factory.interface, address);
            expect(deployed).to.equal(await factory.deployedTokens(0));
            const token = await ethers.getContractAt("PointToken", deployed);
            expect(await token.balanceOf(holder.address)).to.equal(0);
            expect(await token.totalSupply()).to.equal(0);
            expect(await token.state()).to.equal(0);
            expect(await token.owner()).to.equal(owner.address);

            // Matching event signature at another address is not proof of this factory's deployment.
            expect(() => readDeployedPointAddress(receipt, factory.interface, holder.address))
                .to.throw("expected factory address");
            expect(() => readDeployedPointAddress({ status: 0, logs: receipt.logs }, factory.interface, address))
                .to.throw("unsuccessful");
            expect(() => readDeployedPointAddress(null, factory.interface, address)).to.throw("missing");
            expect(() => readDeployedPointAddress({ status: 1, logs: [] }, factory.interface, address))
                .to.throw("event not found");
        });
    }

    it("reports the token address once before the successful setup summary", async function () {
        const { owner, standalone } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Draft", symbol: "DFT" });
        const token = await ethers.getContractAt("PointToken", address);
        const log = mock.method(console, "log", () => {});
        try {
            await finishPointSetup(token, { kind: "Draft" }, { kind: "none" }, owner.address, ethers.provider);
        } finally {
            log.mock.restore();
        }

        const output = log.mock.calls.map(call => call.arguments);
        expect(output[0]).to.deep.equal(["Token:", address]);
        expect(output.filter(args => args[0] === "Token:")).to.have.length(1);
        expect(output).to.deep.include(["Point state:", "Draft"]);
    });

    it("deploys identity, configures A separately and mints escrow rather than customer balance", async function () {
        const { owner, holder, standalone, startDate, expireDate } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Points", symbol: "PTS" });
        const token = await ethers.getContractAt("PointToken", address);
        await configurePointBusiness(token, { kind: "A", startDate, expireDate }, owner.address, ethers.provider);
        await mintPointInventory(token, { kind: "mint", amount: 100n, recipient: holder.address,
            operationId: ethers.id("script-stock") }, owner.address);
        expect(await token.getPointDates()).to.deep.equal([startDate, expireDate]);
        expect(await token.balanceOf(holder.address)).to.equal(0);
        expect(await token.inventoryBalanceOf(holder.address)).to.equal(100);
        expect(await token.balanceOf(address)).to.equal(100);
        expect(await token.availableBalanceOf(holder.address)).to.equal(0);
        expect(await token.totalSupply()).to.equal(100);
    });

    it("leaves Draft untouched and allows only explicit stock without configuration", async function () {
        const { owner, holder, standalone } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Draft", symbol: "DFT" });
        const token = await ethers.getContractAt("PointToken", address);
        await configurePointBusiness(token, { kind: "Draft" }, owner.address, ethers.provider);
        await mintPointInventory(token, { kind: "none" }, owner.address);
        expect(await token.totalSupply()).to.equal(0);
        await mintPointInventory(token, { kind: "mint", amount: 25n, recipient: holder.address,
            operationId: ethers.id("draft-stock") }, owner.address);
        expect(await token.state()).to.equal(0);
        expect(await token.inventoryBalanceOf(holder.address)).to.equal(25);
        expect(await token.balanceOf(holder.address)).to.equal(0);
    });

    it("accepts equivalent address and operation-ID casing when inventory helper is called directly", async function () {
        const { owner, holder, standalone } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Case Points", symbol: "CASE" });
        const token = await ethers.getContractAt("PointToken", address);
        const operationId = ethers.id("mixed-case-stock");
        const mixedCaseId = `0x${operationId.slice(2).toUpperCase()}`;

        await mintPointInventory(token, {
            kind: "mint", amount: 25n, recipient: holder.address.toLowerCase(), operationId: mixedCaseId,
        }, owner.address);
        expect(await token.inventoryBalanceOf(holder.address)).to.equal(25n);
        expect(await token.balanceOf(address)).to.equal(25n);
        expect(await token.totalSupply()).to.equal(25n);
    });

    const policies = [
        { config: { kind: "B", policy: "FEFO_ONLY" }, business: 2n, policy: 0n },
        { config: { kind: "C", policy: "USER_SELECT" }, business: 3n, policy: 1n },
        { config: { kind: "D", policy: "FEFO_ONLY" }, business: 4n, policy: 0n },
        { config: { kind: "D", policy: "USER_SELECT" }, business: 4n, policy: 1n },
    ] satisfies { config: Parameters<typeof configurePointBusiness>[1]; business: bigint; policy: bigint }[];
    for (const { config, business, policy } of policies) {
        it(`configures business ${config.kind} policy ${policy} without manufacturing dates`, async function () {
            const { owner, standalone } = await networkHelpers.loadFixture(factoryFixture);
            const address = await deployPointToken(standalone, { name: "Lot Points", symbol: "LOT" });
            const token = await ethers.getContractAt("PointToken", address);
            await configurePointBusiness(token, config, owner.address, ethers.provider);
            expect(await token.business()).to.equal(business);
            expect(await token.transferPolicy()).to.equal(policy);
            expect(await token.state()).to.equal(1);
            expect(await token.startDate()).to.equal(0);
            expect(await token.expireDate()).to.equal(0);
            expect(await token.lotCount()).to.equal(0);
            expect(await token.totalSupply()).to.equal(0);
        });
    }

    it("rechecks chain expiry and token owner before configuration or inventory transactions", async function () {
        const { owner, holder, standalone, startDate, expireDate } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Points", symbol: "PTS" });
        const token = await ethers.getContractAt("PointToken", address);
        await expect(configurePointBusiness(token, { kind: "A", startDate, expireDate }, holder.address, ethers.provider))
            .to.be.rejectedWith("owner of the token");
        await networkHelpers.time.increaseTo(expireDate);
        await expect(configurePointBusiness(token, { kind: "A", startDate, expireDate }, owner.address, ethers.provider))
            .to.be.rejectedWith("after the latest chain timestamp");
        await expect(mintPointInventory(token, { kind: "mint", amount: 1n, recipient: holder.address,
            operationId: ethers.id("denied-stock") }, holder.address)).to.be.rejectedWith("owner of the token");
        expect(await token.state()).to.equal(0);
        expect(await token.totalSupply()).to.equal(0);
    });

    it("requires successful configuration and issuance receipts from the expected token", async function () {
        const { owner, holder, standalone, startDate, expireDate } = await networkHelpers.loadFixture(factoryFixture);
        const address = await deployPointToken(standalone, { name: "Points", symbol: "PTS" });
        const token = await ethers.getContractAt("PointToken", address);
        const config = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [startDate, expireDate]);
        const configReceipt = await (await token.configureBusiness(1, config)).wait();
        const issueReceipt = await (await token.mintInventory(holder.address, 1, ethers.id("receipt-stock"))).wait();
        const receipts: [typeof configReceipt, string][] = [
            [configReceipt, "BusinessConfigured"], [issueReceipt, "InventoryMinted"],
        ];
        for (const [receipt, eventName] of receipts) {
            if (!receipt) throw new Error("Expected a mined receipt");
            expect(readPointEvent(receipt, token.interface, address, eventName).name).to.equal(eventName);
            expect(() => readPointEvent(receipt, token.interface, owner.address, eventName)).to.throw("expected");
            expect(() => readPointEvent({ status: 0, logs: receipt.logs }, token.interface, address, eventName))
                .to.throw("unsuccessful");
        }
    });
});
