# Verify Point contracts

Run from this repository after installing its locked dependencies with the Node version in `package.json`.

```sh
npm run verify:contracts
```

The runner force-compiles on the simulated `hardhatMainnet` network, compares the existing wrapper ABI exports against fresh compiler artifacts, and runs the full Solidity and Mocha suites with `test --no-compile`. It verifies `PointToken`, `PointTokenFactory` and `UpgradablePointFactory`. It does not run deployment scripts, regenerate ABI exports, invoke the extra Forge command, or inspect the Coupon Marketplace repository.

`docs/contract-acceptance.md` contains the latest result. Each run preserves `report.json`, `report.md`, compilation output and test output in a unique `verification-results/` directory. That directory is ignored by Git and stays outside Hardhat artifact cleanup. Preserve it separately when sharing evidence. The runner refuses concurrent invocations to protect the latest report. If a killed process leaves `verification-results/.lock`, confirm no verification process is active before removing that lock.

## Compare supplied delivery artifacts

```sh
npm run verify:contracts -- --baseline /absolute/path/to/delivery --require-baseline
```

Supply a flat directory containing `PointToken.json`, `PointTokenFactory.json` and `UpgradablePointFactory.json`. Each must be a complete Hardhat artifact with the correct `contractName` and `sourceName`, a nonempty ABI, nonempty creation and deployed bytecode, and object fields `linkReferences`, `deployedLinkReferences` and `immutableReferences`. Empty reference objects are valid. ABI wrapper exports alone are insufficient.

The baseline is read and hashed before compilation. The comparison includes complete ABI entries, exact creation and deployed bytecode with metadata, link references and immutable references. Bytecode is not compared to a live chain. A baseline copied from this checkout establishes reproducibility only. Delivery acceptance still depends on trusted provenance for the supplied artifacts.

Without a baseline, local checks can pass while delivery parity remains `not_provided`. `--require-baseline` returns a nonzero exit code for that absence. A malformed or incomplete supplied baseline, compile error, ABI mismatch, bytecode mismatch, test failure, missing runner summary, input change or infrastructure error also returns a nonzero exit code. A failed compile blocks artifact comparison and tests so stale outputs cannot pass.

## Evidence and scope

The JSON report records Node and Hardhat versions, Git HEAD, dirty paths, compiler versions and settings, artifact hashes, and the raw test process outcome. Test counts come from the separate Solidity and Mocha summary lines. Both runners must show successful tests. Unavailable counts remain `null`; pending cases are never counted as passes. Historical issue totals and hashes are not imposed on the current Point v3 implementation.

The input manifest covers all files under `contracts/`, `test/`, `abi/` and `scripts/`, plus package manifests, package lock, Hardhat configuration, TypeScript configuration, `foundry.toml` and `remappings.txt` when present. Untracked files in these locations are included. Each file is hashed from its raw bytes. The aggregate is SHA256 of UTF-8 records sorted by relative POSIX path, each encoded as `path + NUL + lowercase_file_SHA256 + LF`. The same manifest is checked after execution. This recipe differs from historical issue hashes unless their recipes and input sets match.

The runner does not print environment values or include `.env` files in its manifest. Build-info includes compiler input fingerprints, including dependency source text, while the project-source check compares current `contracts/` bytes. Arbitrary output from the repository's tests remains in logs. This is verification of the current repository and its tests, not a security audit or proof that all business requirements are covered.

Run checker regression cases separately.

```sh
node --test scripts/verify_contracts.test.mjs
```
