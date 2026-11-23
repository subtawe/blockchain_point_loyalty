import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { compareAbi, compareArtifacts, readBaseline, resultExitCode, testOutcome, validateArtifact } from "./verify_contracts.mjs";

const contract = { name: "Fixture", source: "contracts/Fixture.sol" };
const abi = [{ type: "function", name: "balance", inputs: [{ name: "holder", type: "address" }], outputs: [{ name: "amount", type: "uint256" }], stateMutability: "view" }];
const artifact = { contractName: contract.name, sourceName: contract.source, abi, bytecode: "0x60006000", deployedBytecode: "0x6000", linkReferences: {}, deployedLinkReferences: {}, immutableReferences: {} };

test("ABI comparison catches return, name, mutability and indexed drift while ignoring key and entry order", () => {
  assert.equal(compareAbi(abi, [{ stateMutability: "view", outputs: abi[0].outputs, inputs: abi[0].inputs, name: "balance", type: "function" }]), true);
  for (const changed of [
    { ...abi[0], outputs: [{ name: "amount", type: "uint128" }] },
    { ...abi[0], inputs: [{ name: "account", type: "address" }] },
    { ...abi[0], stateMutability: "nonpayable" },
  ]) assert.equal(compareAbi(abi, [changed]), false);
  const event = { type: "event", name: "Moved", anonymous: false, inputs: [{ name: "who", type: "address", indexed: true }] };
  assert.equal(compareAbi([event], [{ ...event, inputs: [{ ...event.inputs[0], indexed: false }] }]), false);
  const tuple = { ...abi[0], outputs: [{ name: "entry", type: "tuple", components: [{ name: "amount", type: "uint256" }] }] };
  assert.equal(compareAbi([tuple], [{ ...tuple, outputs: [{ ...tuple.outputs[0], components: [{ name: "value", type: "uint256" }] }] }]), false);
});

test("captured baseline survives file changes and rejects missing or malformed artifacts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "point-baseline-test-"));
  try {
    const file = path.join(directory, "Fixture.json");
    await assert.rejects(readBaseline(directory, [contract]), /ENOENT/);
    await writeFile(file, "{");
    await assert.rejects(readBaseline(directory, [contract]), SyntaxError);
    await writeFile(file, JSON.stringify({ ...artifact, bytecode: "0x" }));
    await assert.rejects(readBaseline(directory, [contract]), /nonempty bytecode/);
    await writeFile(file, JSON.stringify(artifact));
    const captured = await readBaseline(directory, [contract]);
    await writeFile(file, JSON.stringify({ ...artifact, deployedBytecode: "0x6001" }));
    assert.deepEqual(compareArtifacts(captured.get("Fixture").artifact, artifact), []);
    assert.deepEqual(compareArtifacts(captured.get("Fixture").artifact, { ...artifact, deployedBytecode: "0x6001" }), ["deployedBytecode"]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("bytecode, link and immutable differences remain visible", () => {
  validateArtifact(artifact, contract);
  for (const key of ["bytecode", "deployedBytecode"]) assert.deepEqual(compareArtifacts(artifact, { ...artifact, [key]: "0x6001" }), [key]);
  for (const key of ["linkReferences", "deployedLinkReferences", "immutableReferences"]) {
    assert.deepEqual(compareArtifacts(artifact, { ...artifact, [key]: { id: [{ start: 1, length: 2 }] } }), [key]);
    assert.throws(() => validateArtifact({ ...artifact, [key]: undefined }, contract), new RegExp(key));
  }
  assert.throws(() => validateArtifact({ ...artifact, contractName: "Other" }, contract), /identity/);
});

test("failure and absent required baseline propagate to nonzero status", () => {
  assert.equal(resultExitCode([{ id: "tests", status: "fail" }]), 1);
  assert.equal(resultExitCode([{ id: "tests", status: "blocked" }]), 1);
  assert.equal(resultExitCode([{ id: "baseline", status: "not_provided" }]), 0);
  assert.equal(resultExitCode([{ id: "baseline", status: "not_provided" }], true), 1);
});

test("both test runners must execute successfully; passing output cannot hide process failure", () => {
  const output = "Running Solidity tests\n  2 passing\nRunning Mocha tests\n  3 passing (1s)\n  1 pending\n";
  const success = testOutcome({ output, exitCode: 0, signal: null });
  assert.equal(success.status, "pass");
  assert.equal(success.summaries[1].pending, 1);
  assert.equal(success.summaries[0].pending, null);
  assert.equal(testOutcome({ output, exitCode: 1, signal: null }).status, "fail");
  assert.equal(testOutcome({ output: "Running Mocha tests\n  3 passing\n", exitCode: 0 }).status, "fail");
  assert.equal(testOutcome({ output: "Running Solidity tests\n  0 passing\nRunning Mocha tests\n  3 passing\n", exitCode: 0 }).status, "fail");
  assert.equal(testOutcome({ output: "", exitCode: 0 }).status, "fail");
});
