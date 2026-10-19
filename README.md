# blockchain_point_loyalty

This repository imports the latest application snapshot with a fresh history. Earlier source commits and local audit/editor files are not included. Deployment signing keys are not included. The DLT network resolves `PRIV_KEY` through Hardhat configuration, as the other signing networks do. Do not commit private keys or environment files.

An upgradeable loyalty-point system built on Solidity 0.8.28. The repository contains:

-   **UpgradablePointFactory** deploys empty `PointToken` identities through an atomically initialized UUPS proxy.
-   **PointToken** implements Point Loyalty v3 with one-time business configuration, escrow-backed inventory, and separate customer ledger and available balances.
-   **PointTokenFactory** deploys the same identities without a proxy. Both concrete contracts inherit their implementations from abstract base contracts.
-   Solidity and TypeScript tests run through **Hardhat**, plus **Ignition** deployment scripts.
-   Example upgrade path to a `V2` implementation (`UpgradablePointFactoryV2`).

## Table of Contents

-   [Prerequisites](#prerequisites)
-   [Setup](#setup)
-   [Configuration](#configuration)
-   [Build & Compile](#build--compile)
-   [Testing](#testing)
-   [Deployment](#deployment)
-   [Upgrade Flow](#upgrade-flow)
-   [Project Structure](#project-structure)
-   [License](#license)

## Prerequisites

-   **Node.js 26.12.0**. `.nvmrc` pins this version and `package.json` requires `>=26.12.0 <27`. Hardhat does not support odd-numbered major versions such as Node 25.
-   **npm** (or **yarn**).
-   **Foundry** (optional – for Forge tests).
-   **Git**.

## Setup

```bash
# Clone the repository
git clone https://github.com/subtawe/blockchain_point_loyalty.git
cd blockchain_point_loyalty

# Select the pinned runtime if you use nvm
nvm install
nvm use

# Install dependencies
npm install
```

If you do not use nvm, install Node.js 26.12.0 directly and run `node --version` to confirm it prints `v26.12.0` before you install dependencies.

## Configuration

Compiling and testing on the default `hardhatMainnet` network need no configuration. Deploying to a real network needs these variables:

| Variable | Used by | Value |
| --- | --- | --- |
| `PRIV_KEY` | `dlt`, `amoy`, `sepolia`, `loaffinity` | Deployer private key |
| `SEPOLIA_RPC_URL` | `sepolia` | RPC endpoint URL |
| `SCAN_API_KEY` | `npx hardhat verify` | Etherscan API key |

Hardhat reads a variable only when the command you run uses it. If a variable is missing, Hardhat stops with error `HHE7` and names the variable.

Set the variables with either of these methods.

**Encrypted keystore (recommended).** Hardhat prompts for each value and stores it encrypted outside the repository. Run `npx hardhat keystore path` to see where.

```bash
npx hardhat keystore set PRIV_KEY
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SCAN_API_KEY
```

**`.env` file.** Create `.env` in the repository root. `hardhat.config.ts` loads it, and Git ignores it. Use a dedicated deployer wallet, never a personal one.

```dotenv
PRIV_KEY=0xYOUR_PRIVATE_KEY
SEPOLIA_RPC_URL=https://YOUR_RPC_ENDPOINT
SCAN_API_KEY=YOUR_API_KEY
```

You can also export the variables in your shell for a single run, for example `PRIV_KEY=0x... npx hardhat run scripts/deploy.ts --network dlt`.

## Build & Compile

```bash
# Compile Solidity contracts with Hardhat
npx hardhat compile
```

The compilation uses the optimizer with 200 runs (see `hardhat.config.ts`).

## Testing

### Hardhat (TypeScript) tests
```bash
npx hardhat test
```
This runs both the Solidity tests (including fuzz tests) and the Mocha/Chai tests.

### Foundry (Forge) tests
```bash
forge test --match-contract PointFactoryTest
```
> **Note:** Ensure `forge` is installed and available in your `$PATH`.

## Deployment

### Hardhat Ignition (upgradeable deployment)
```bash
npx hardhat ignition deploy ignition/modules/UpgradablePointFactory.ts
```
The script deploys:
1.  `UpgradablePointFactory` implementation.
2.  Encodes `initialize()` for the proxy constructor (the implementation cannot be initialized).
3.  Deploys an `AppProxy` pointing to the implementation and initializes the proxy atomically.

The deployed addresses are printed at the end of the run.

### Point Loyalty v3 lifecycle and ABI

Both factories expose `pointTokenVersion() == 3` and accept identity only:

```solidity
deployPointToken(string name, string symbol)
```

`TokenDeployed(tokenAddress, name, symbol, deployer)` comes from the actual factory or proxy address. The caller owns the new token. Its constructor is `PointToken(name, symbol, owner)`, with no dates, recipient, or initial mint. It starts in `Draft` with zero supply.

The token owner chooses a business once through a separate `configureBusiness(business, config)` transaction:

| Business | ID | Configuration | Customer validity and transfer policy |
|---|---|---|---|
| A | 1 | `abi.encode(uint256 startDate, uint256 expireDate)` | One shared period, inclusive at both boundaries |
| B | 2 | `abi.encode(uint8(0))` | Dated lots, inclusive expiry, FEFO_ONLY |
| C | 3 | `abi.encode(uint8(1))` | Dated lots, inclusive expiry, USER_SELECT |
| D | 4 | `abi.encode(uint8(policy))` | Each delivery creates or reuses a lot that starts at the current Thai month start and expires at a later Thai month start, 2 to 13 months ahead; policy is 0 or 1 |

A requires explicit Unix seconds, `startDate < expireDate`, and expiry after execution time. Owner minting may prepare Pending customer points. Transfers and redemption require Active points. B and C direct issuance uses `mintLot(to, value, startDate, expireDate, issueId)`. D has no runtime dates at configuration and requires inventory delivery.

Inventory belongs to a named Marketer claim, backed by ERC20 units at the token's own address. It is not spendable customer balance. `mintInventory(account, value, issueId)` works in Draft or Configured state. `sendToCustomer(inventoryAccount, customer, value, deliveryConfig, deliveryId)` debits only the named claim without increasing supply. Delivery config is empty for A, and `abi.encode(uint256 start, uint256 expiry)` for B, C and D.

For D, the Owner grants direct delivery with `setMarketer(marketer, true)`, configures D once, and mints the Marketer's inventory. The Marketer calls `sendToCustomer` with their own address as `inventoryAccount` and `abi.encode(start, expiry)` as `deliveryConfig`. The backend computes both Unix-second timestamps in Thai time, UTC+7. `start` is 00:00 on the first day of the current Thai month. `expiry` is 00:00 on the first day of a month 2 to 13 months ahead, as bounded by `maxExpiryMonthsAhead()`. This implements N months after delivery rounded up to the end of that month, with N from 1 to 12. Expiry is exclusive.

The same date checks apply to the Owner, who can still deliver from any named inventory claim. Revoking `setMarketer(marketer, false)` stops new Marketer deliveries without changing stock or existing lots. Deliveries with the same two dates share one lot. D permits at most 90 live lots, but this is not a gas-budget guarantee. A Marketer cannot mint, configure, redeem, or deliver another account's inventory.

If execution crosses a month boundary, `MonthWindowNotCurrent` may reject the old start. Confirm that the original transaction reverted before recomputing the window and signing again with the same caller and delivery ID. A pending receipt or RPC timeout does not prove a revert. `PointExpired` can occur first if the old expiry has already passed. IDs are caller-scoped, not global business deduplication.

See [D monthly delivery examples](docs/POINT_D_MONTHLY_DELIVERY.md) for configuration, grant/revoke, Owner and Marketer calls, boundary handling, errors, and release limitations.

`mint(to, value, issueId)` issues A customer points. `burn(from, value, redemptionId)` and `redeemFEFO` redeem only Active customer points. Custom issuance and spending reject zero values. Ordinary zero transfers remain subject to the applicable validity and consent rules. Custom self-transfers reject.

Operation IDs are caller-scoped and bind the complete selector and payload. An identical retry reverts `AlreadyProcessed`; changed payload under the same ID reverts `OperationConflict`. Preserve the original ID and inspect the recorded receipt rather than generating a fresh ID for a retry.

`balanceOf` and `totalSupply` retain the ledger after expiry. Read `availableBalanceOf` for spendable customer points. A's `availableSupply` excludes escrow; B/C/D reject that global query. Lot transfers, including ERC20 `transfer` and `transferFrom`, use FEFO and recipient sender-consent. USER_SELECT allocations are strictly ascending by lot ID, not expiry. The live-wallet index limit is 256 lots. A new distinct lot beyond that limit rejects; crediting an existing live lot remains allowed. Pruning retains Pending lots and expired ledger balances.

The 256-lot limit is storage capacity, not an execution-gas guarantee. The optimized local benchmark completed some full 256-lot overlap transfers, but transfers to an empty wallet and a 128-existing plus 128-new-lot case exhausted a 30-million-gas budget. Preview gas on the target network and use smaller transfers when necessary. Ordinary transfers still scan the sender's live index, so smaller amounts can remain expensive in a full wallet. The existing 32-lot performance tests retain their original 2-million-gas budget; raising capacity does not relax that regression target.

The v2 dated deployment selector and `DatedTokenDeployed` event are absent from v3. The epoch selector is also absent. Existing token addresses retain their original code and semantics after a factory upgrade. Coordinate caller and indexer changes before upgrading an existing factory. Historical v2 decisions and sequences are labeled in the [validity design](docs/POINT_DATE_VALIDITY_DESIGN.md) and [sequence record](docs/POINT_DATE_VALIDITY_SEQUENCES.md). Old Ignition deployment records are not rewritten.

### Deployment script inputs

Scripts attaching to an existing factory require `POINT_FACTORY_ADDRESS` for a version-3 factory or initialized proxy. With no `POINT_BUSINESS`, they create and report an empty Draft. No script supplies default business, validity, or issuance.

```sh
export POINT_FACTORY_ADDRESS="<version-3-factory-or-proxy-address>"
npx hardhat run scripts/deploy_new_token.ts --network YOUR_NETWORK
```

Replace the address and network placeholders with real values. For optional later configuration, use these inputs:

| Input | Requirement |
|---|---|
| `POINT_BUSINESS` | Optional, exactly A, B, C, or D |
| `POINT_START_DATE`, `POINT_EXPIRE_DATE` | Both required for A, integer Unix seconds without conversion or fallback |
| `POINT_TRANSFER_POLICY` | B uses FEFO_ONLY, C uses USER_SELECT; conflicting values reject. D requires FEFO_ONLY or USER_SELECT |
| `POINT_INVENTORY_AMOUNT` | Optional positive uint256 integer in base units, no hardcoded amount |
| `POINT_INVENTORY_RECIPIENT` | Required nonzero checksummed address when inventory is requested |
| `POINT_INVENTORY_OPERATION_ID` | Required explicit nonzero bytes32 when inventory is requested; retain it with the request |

The three inventory inputs must be supplied together. Inventory can be issued without configuring the Draft, but no automatic customer issuance occurs.

To create a proxy and empty Draft locally without a factory address:

```sh
npx hardhat run scripts/deploy_proxy_and_token.ts --network hardhatMainnet
```

For A, scripts check expiry against chain time before any transaction and again before configuration. The contract checks execution time. Existing-factory scripts reject unsupported versions, ownerless factories, and wrong signers. They never initialize an attached address. Proxy creation still initializes atomically in its constructor.

`pointTokenVersion() == 3` alone does not distinguish an older duration-based Factory from the monthly D implementation. Verify the Factory deployment and bytecode against the reviewed build before creating monthly tokens. Existing tokens are direct deployments and retain their old behavior even if a Factory proxy is upgraded. Deployment and balance migration are separate operations, not performed by changing the ABI.

Deployment, configuration, and stock issuance are separate transactions. Every stage awaits a successful mined receipt from the expected emitter. Configuration and inventory receipts also validate the requested payload. Failure of a later transaction does not roll back an earlier identity deployment. Scripts report the customer ledger, inventory claim, available customer balance, token escrow, and ledger supply separately. Errors set a nonzero exit code and close the connection.

Export the updated consumer ABIs with:

```sh
npx hardhat run scripts/export_point_abis.ts
```

The export writes only `abi/PointToken.json`, `abi/PointTokenFactory.json`, and `abi/UpgradablePointFactory.json`. Backend integration must separate identity, business configuration, inventory, delivery, and redemption. Validate end-user authorization before selecting the privileged signer. The scripts validate signer ownership but do not implement backend user authentication. Backend integration and external rollout remain separate work.

### Direct Hardhat deployment (script example)
```bash
npx hardhat run scripts/deploy.ts --network dlt
```
> Replace `dlt` with your target network name defined in `hardhat.config.ts`.

## Upgrade Flow

1.  Deploy a new implementation, e.g., `UpgradablePointFactoryV2.sol`.
2.  Call `upgradeToAndCall(address(newImpl), "0x")` on the proxy via the factory instance.
3.  Verify the new functionality (e.g., `version()` returns `"v2"`).

The TypeScript test `test/UpgradablePointFactory.ts` demonstrates this flow and checks owner, registry, token code, dates, and balances. The test implementation's `version() == "v2"` is an upgrade marker, not the Point deployment API version; `pointTokenVersion()` remains 3.

## Project Structure

```
blockchain_point-loyalty/
├─ contracts/
│   ├─ UpgradablePointFactory.sol      # UUPS factory
│   ├─ pointToken.sol               # Concrete V3 token
│   ├─ pointFactory.sol             # Concrete standalone factory
│   ├─ base/
│   │   ├─ PointTokenBase.sol       # V3 business and ERC20 implementation
│   │   └─ PointTokenFactoryBase.sol # Standalone factory implementation
│   ├─ AppProxy.sol                    # ERC1967Proxy wrapper for Ignition
│   └─ test/                          # Solidity test contracts (Forge)
├─ test/                              # TypeScript test suites (Hardhat)
├─ ignition/                          # Ignition deployment modules
│   └─ modules/UpgradablePointFactory.ts
├─ hardhat.config.ts                  # Hardhat configuration
├─ package.json
├─ .gitignore                         # Updated with Hardhat & Foundry ignores
└─ README.md                          # This file
```

`PointToken` and `PointTokenFactory` keep their existing constructor arguments and ABI. Their abstract bases cannot be deployed directly. `IPointToken` declares the shared enums, structs, events, and errors. `UpgradablePointFactory` keeps its own initializer, ownership, registry storage, and upgrade authorization.

This branch removes the earlier block-based token and factory contracts, their deployment scripts and tests, and the unused ERC7818 epoch implementation. The earlier contracts shared the names `PointToken` and `PointTokenFactory`, which the current contracts now use. Existing on-chain deployments are unaffected. The design documents describe epoch behavior from earlier source versions.
