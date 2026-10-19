# D monthly delivery

Business D stores inventory separately from customer points. The Owner configures the business once and grants a Marketer permission to deliver from their own inventory claim. The Owner may deliver from any claim.

Use [NewPointToken.json](../abi/NewPointToken.json), which contains `contractName` and an `abi` array. Connect ethers to that array. Do not use the whole wrapper as an ABI.

## Dates and lot identity

The caller chooses N from 1 to 12 for each delivery. The backend computes:

- `startDate`: 00:00 Thai time on the first day of the execution month.
- `expireDate`: 00:00 Thai time on the first day of the month N+1 months after the execution month.

Both values are Unix seconds, not milliseconds. Thai time is UTC+7 without daylight saving. The contract verifies these boundaries for Owner and Marketer. `maxExpiryMonthsAhead()` returns 13, which counts N+1, not N.

For example, deliveries on 7 and 28 June 2026 with N=12 both use start `1780246800` and expiry `1814374800`, representing 1 June 2026 and 1 July 2027 at 00:00 Thai time. They share one lot even if different callers send them. Changing N or the delivery month creates a different pair of dates. Onward transfers retain those dates.

The expiry timestamp is exclusive. At that exact second the points cannot be spent. `balanceOf` and `totalSupply` keep expired ledger value. Use `availableBalanceOf` for spendable points and do not treat the live index as complete history.

## Owner and Marketer example

The following example is for a fresh Draft D token in a local test. Supply `point` as an ethers Contract connected using the exported ABI, the three signer objects, and a recent chain timestamp in Unix seconds. Use a dedicated customer wallet for the example.

In an integration, deployment, one-time configuration, inventory issuance, and each delivery are separate business operations. Persist each operation ID and its payload before submission. The fixed IDs below belong to one example run, not to a retry loop or a production ID generator. There are no default signing keys or remote network calls.

```js
import { AbiCoder, id } from "ethers";

export async function monthlyDeliveryExample(point, owner, marketer, customer, chainTimestamp) {
    const coder = AbiCoder.defaultAbiCoder();
    const thaiOffsetSeconds = 7 * 60 * 60;
    const millisecondsPerSecond = 1000;
    const selectedMonths = 12;
    const stock = 1000n;
    const marketerAmount = 100n;
    const ownerAmount = 20n;
    const marketerAddress = await marketer.getAddress();
    const customerAddress = await customer.getAddress();
    const local = new Date((chainTimestamp + thaiOffsetSeconds) * millisecondsPerSecond);
    const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) / millisecondsPerSecond - thaiOffsetSeconds;
    const expiry = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + selectedMonths + 1, 1) / millisecondsPerSecond - thaiOffsetSeconds;
    const deliveryConfig = coder.encode(["uint256", "uint256"], [start, expiry]);

    await (await point.connect(owner).configureBusiness(4, coder.encode(["uint8"], [0]))).wait();
    await (await point.connect(owner).setMarketer(marketerAddress, true)).wait();
    await (await point.connect(owner).mintInventory(marketerAddress, stock, id("monthly-example/stock"))).wait();
    await (await point.connect(marketer).sendToCustomer(
        marketerAddress, customerAddress, marketerAmount, deliveryConfig, id("monthly-example/marketer"),
    )).wait();
    await (await point.connect(owner).setMarketer(marketerAddress, false)).wait();
    await (await point.connect(owner).sendToCustomer(
        marketerAddress, customerAddress, ownerAmount, deliveryConfig, id("monthly-example/owner"),
    )).wait();

    const lotId = await point.walletLotIds(customerAddress, 0);
    return { start, expiry, deliveryConfig, lotId };
}
```

Amounts here are raw token units. NewPointToken has 18 decimals. Use `parseUnits` when the input is a displayed token amount. This example uses FEFO_ONLY, policy 0. Policy 1 permits manual lot selection. It does not change the monthly date rules.

After the example, the customer has one lot with 120 units, the inventory claim and escrow each hold 880, and totalSupply remains 1,000. The Marketer is revoked, but the Owner's delivery still succeeds. Delivery from inventory does not require customer opt-in. Customer wallet transfers do require recipient consent through `allowSender`.

## Reverts and retries

| Error | Meaning |
|---|---|
| `InvalidConfiguration` | Delivery config is not exactly 64 bytes. Legacy single-duration input is rejected. |
| `InvalidDateRange` | Start is not before expiry. |
| `PointExpired` | Expiry is not after execution time. This check precedes the monthly checks. |
| `MonthWindowNotCurrent` | Start differs from the current Thai month start. It can mean a stale transaction or a calculation error. |
| `InvalidMonthWindow` | Expiry is not a Thai month start or is outside the 2 to 13 month bound. |
| `OwnableUnauthorizedAccount` | Caller is neither Owner nor an authorized Marketer in D. |
| `InventorySourceNotAllowed` | Non-Owner caller named someone else's inventory. |
| `InsufficientInventory` | The named claim lacks the amount. |
| `AlreadyProcessed` | That caller already completed this ID with the same payload. |
| `OperationConflict` | That caller already completed this ID with another payload. |

After a confirmed revert the operation record and all balances roll back. For a stale month, recompute dates only after confirming the original revert, then sign with the same caller and ID. Do not change payload on an unconfirmed transaction and do not change callers to bypass a conflict. Validate `CustomerDelivered` from the expected token and check the confirmed receipt. Retry handling in the backend is not implemented or verified by this example.

## Limits and deployment status

- D has at most 90 live lots under these date rules. Authorized dust delivery can still increase gas cost. The accepted LOW design limitation is not a target-chain gas guarantee.
- The exported ABI describes the reviewed source, not every previously deployed token. Deploy a new monthly token through the verified Factory build. Merely changing the ABI or upgrading a Factory cannot rewrite an existing token.
- Factory version 3 alone is not a monthly capability check. Verify deployment identity and bytecode before release. Initialize proxies atomically.
- Current verification used Node 25, which Hardhat does not support. Rerun on a supported runtime before release, and verify target-chain execution gas and backend receipt handling.
- This delivery guide does not perform deployment, migration, backend integration, or external transfers.
