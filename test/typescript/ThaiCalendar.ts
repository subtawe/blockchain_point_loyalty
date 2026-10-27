import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.connect();

const THAI_UTC_OFFSET_SECONDS = 7 * 3600;
const SECONDS_PER_DAY = 86400;
const FIRST_YEAR = 2000;
const LAST_YEAR = 2100;
const MONTHS_PER_YEAR = 12;
const CALL_BATCH_SIZE = 150;
const MID_MONTH_DAY_OFFSET = 14;
const MIDDAY_SECONDS = 12 * 3600;
const ARITHMETIC_PANIC_CODE = 0x11;
const HAND_CHECKED_JUNE_2026_START = 1780246800;
const HAND_CHECKED_JUNE_2026_NOON = HAND_CHECKED_JUNE_2026_START + 6 * SECONDS_PER_DAY + 12 * 3600;

type CivilFields = [bigint, bigint, bigint, bigint];

// Independent oracle: JavaScript Date arithmetic, not the contract's day-count formulas.
function thaiMonthStart(year: number, month: number): number {
    return Date.UTC(year, month - 1, 1) / 1000 - THAI_UTC_OFFSET_SECONDS;
}

function thaiFields(timestamp: number): CivilFields {
    const shifted = timestamp + THAI_UTC_OFFSET_SECONDS;
    const local = new Date(shifted * 1000);
    return [
        BigInt(local.getUTCFullYear()),
        BigInt(local.getUTCMonth() + 1),
        BigInt(local.getUTCDate()),
        BigInt(shifted % SECONDS_PER_DAY),
    ];
}

async function deployHarness() {
    return ethers.deployContract("ThaiCalendarHarness");
}

async function readCivil(harness: Awaited<ReturnType<typeof deployHarness>>, timestamp: number): Promise<CivilFields> {
    const result = await harness.getFunction("civil")(timestamp);
    return [result[0], result[1], result[2], result[3]];
}

describe("ThaiCalendar", function () {
    it("matches a hand-checked anchor for 1 June 2026 in Thai time", async function () {
        const harness = await deployHarness();

        expect(await harness.getFunction("monthStart")(2026, 6)).to.equal(BigInt(HAND_CHECKED_JUNE_2026_START));
        expect(await readCivil(harness, HAND_CHECKED_JUNE_2026_START)).to.deep.equal([2026n, 6n, 1n, 0n]);
        expect(await readCivil(harness, HAND_CHECKED_JUNE_2026_NOON)).to.deep.equal([2026n, 6n, 7n, 43200n]);
    });

    it("reads 17:00 UTC as the start of the next Thai day", async function () {
        const harness = await deployHarness();
        const lastUtcSecondOfJune = Date.UTC(2026, 5, 30, 16, 59, 59) / 1000;

        expect(await readCivil(harness, lastUtcSecondOfJune)).to.deep.equal([2026n, 6n, 30n, 86399n]);
        expect(await readCivil(harness, lastUtcSecondOfJune + 1)).to.deep.equal([2026n, 7n, 1n, 0n]);
    });

    it("agrees with the oracle at month boundaries, mid-month and month end from 2000 to 2100", async function () {
        const harness = await deployHarness();
        const monthStarts: { year: number; month: number; start: number }[] = [];
        for (let year = FIRST_YEAR; year <= LAST_YEAR; year += 1) {
            for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
                monthStarts.push({ year, month, start: thaiMonthStart(year, month) });
            }
        }

        for (let offset = 0; offset < monthStarts.length; offset += CALL_BATCH_SIZE) {
            const batch = monthStarts.slice(offset, offset + CALL_BATCH_SIZE);
            await Promise.all(batch.map(async ({ year, month, start }) => {
                expect(await harness.getFunction("monthStart")(year, month), `monthStart ${year}-${month}`)
                    .to.equal(BigInt(start));
                const instants = [
                    start - 1, start, start + 1,
                    start + MID_MONTH_DAY_OFFSET * SECONDS_PER_DAY + MIDDAY_SECONDS,
                    thaiMonthStart(year, month + 1) - 1,
                ];
                for (const instant of instants) {
                    expect(await readCivil(harness, instant), `civil ${instant}`).to.deep.equal(thaiFields(instant));
                }
            }));
        }
    });

    it("keeps leap-day rules for 2000 (leap), 2024 (leap) and 2100 (not leap)", async function () {
        const harness = await deployHarness();
        const lastSecondOfFebruary = (year: number) => thaiMonthStart(year, 3) - 1;

        expect(await readCivil(harness, lastSecondOfFebruary(2000))).to.deep.equal([2000n, 2n, 29n, 86399n]);
        expect(await readCivil(harness, lastSecondOfFebruary(2024))).to.deep.equal([2024n, 2n, 29n, 86399n]);
        expect(await readCivil(harness, lastSecondOfFebruary(2100))).to.deep.equal([2100n, 2n, 28n, 86399n]);
    });

    it("converts Unix epoch to Thai time without inventing a representable January 1970 month start", async function () {
        const harness = await deployHarness();
        expect(await readCivil(harness, 0)).to.deep.equal([1970n, 1n, 1n, BigInt(THAI_UTC_OFFSET_SECONDS)]);
        await expect(harness.getFunction("monthStart")(1970, 1)).to.be.revertedWithPanic(ARITHMETIC_PANIC_CODE);
    });

    it("rejects timestamps whose Thai offset would overflow", async function () {
        const harness = await deployHarness();
        await expect(harness.getFunction("civil")(ethers.MaxUint256)).to.be.revertedWithPanic(ARITHMETIC_PANIC_CODE);
    });
});
