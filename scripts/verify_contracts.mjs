import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Interface } from "ethers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACTS = [
  { name: "PointToken", source: "contracts/pointToken.sol" },
  { name: "PointTokenFactory", source: "contracts/pointFactory.sol" },
  { name: "UpgradablePointFactory", source: "contracts/UpgradablePointFactory.sol" },
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, ordered(value[key])]));
  }
  return value;
}

export function canonicalAbi(abi) {
  if (!Array.isArray(abi) || abi.length === 0) throw new Error("ABI must be a nonempty array");
  for (const entry of abi) {
    if (!entry || typeof entry !== "object" || typeof entry.type !== "string") {
      throw new Error("ABI entries must be typed objects");
    }
    // Parse separately because Interface otherwise warns and discards invalid entries.
    const parsed = new Interface([entry]);
    if (parsed.fragments.length !== 1) throw new Error(`Invalid ABI entry ${JSON.stringify(entry)}`);
  }
  return abi.map((entry) => JSON.stringify(ordered(entry))).sort();
}

export function compareAbi(exported, compiled) {
  return JSON.stringify(canonicalAbi(exported)) === JSON.stringify(canonicalAbi(compiled));
}

export function validateArtifact(artifact, contract) {
  if (artifact?.contractName !== contract.name || artifact?.sourceName !== contract.source) {
    throw new Error(`Artifact identity must be ${contract.source}:${contract.name}`);
  }
  canonicalAbi(artifact.abi);
  for (const key of ["bytecode", "deployedBytecode"]) {
    if (typeof artifact[key] !== "string" || !artifact[key].startsWith("0x") || artifact[key].length <= 2) {
      throw new Error(`${contract.name} requires nonempty ${key}`);
    }
    if (!/^(?:[0-9a-fA-F]|_|\$)+$/.test(artifact[key].slice(2))) {
      throw new Error(`${contract.name} has malformed ${key}`);
    }
  }
  for (const key of ["linkReferences", "deployedLinkReferences", "immutableReferences"]) {
    if (!artifact[key] || typeof artifact[key] !== "object" || Array.isArray(artifact[key])) {
      throw new Error(`${contract.name} requires ${key} object`);
    }
  }
  return artifact;
}

export function compareArtifacts(baseline, compiled) {
  const mismatches = [];
  if (!compareAbi(baseline.abi, compiled.abi)) mismatches.push("abi");
  for (const key of ["bytecode", "deployedBytecode", "linkReferences", "deployedLinkReferences", "immutableReferences"]) {
    if (JSON.stringify(ordered(baseline[key])) !== JSON.stringify(ordered(compiled[key]))) mismatches.push(key);
  }
  return mismatches;
}

export async function readBaseline(directory, contracts = CONTRACTS) {
  const captured = new Map();
  for (const contract of contracts) {
    const file = path.join(directory, `${contract.name}.json`);
    const bytes = await readFile(file);
    captured.set(contract.name, { artifact: validateArtifact(JSON.parse(bytes), contract), sha256: sha256(bytes) });
  }
  return captured;
}

export function resultExitCode(stages, requireBaseline = false) {
  return stages.some((stage) => ["fail", "blocked"].includes(stage.status)
    || (requireBaseline && stage.id === "baseline" && stage.status === "not_provided")) ? 1 : 0;
}

export function parseTestSummaries(output) {
  const plain = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  const summaries = [];
  const sections = plain.split(/^Running (Solidity|Mocha) tests\s*$/m);
  for (let i = 1; i < sections.length; i += 2) {
    const lines = sections[i + 1].split("\n").filter((line) => /^\s*\d+ (passing|failing|pending)(?:\s|$)/.test(line));
    const counts = {};
    for (const status of ["passing", "failing", "pending"]) {
      const matches = lines.map((line) => line.match(new RegExp(`^\\s*(\\d+) ${status}(?:\\s|$)`))).filter(Boolean);
      counts[status] = matches.length === 1 ? Number(matches[0][1]) : null;
    }
    summaries.push({ runner: sections[i], ...counts, lines: lines.map((line) => line.trim()) });
  }
  return summaries;
}

export function testOutcome(result) {
  const summaries = parseTestSummaries(result.output);
  const complete = ["Solidity", "Mocha"].every((runner) => summaries.filter((summary) => summary.runner === runner && summary.passing > 0).length === 1);
  const succeeded = result.exitCode === 0 && !result.signal && !result.error && complete
    && !summaries.some((summary) => summary.failing > 0);
  return { status: succeeded ? "pass" : "fail", summaries, findings: [
    complete ? "Full local Solidity and Mocha suites; no historical test-count requirement" : "Missing or empty runner summaries; inspect raw log before accepting results",
    ...summaries.map((summary) => `${summary.runner}: ${summary.lines.join(", ")}`),
  ] };
}

async function manifest() {
  const files = new Set();
  async function walk(relative) {
    for (const entry of await readdir(path.join(ROOT, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.add(name);
      else throw new Error(`Unsupported symlink or special input ${name}`);
    }
  }
  for (const directory of ["contracts", "test", "abi", "scripts"]) await walk(directory);
  for (const entry of await readdir(ROOT)) {
    if (/^(package(?:-lock)?\.json|hardhat\.config\.[cm]?[jt]s|tsconfig.*\.json|foundry\.toml|remappings\.txt)$/.test(entry)) files.add(entry);
  }
  const entries = [];
  for (const name of [...files].sort()) entries.push({ path: name, sha256: sha256(await readFile(path.join(ROOT, name))) });
  return { recipe: "SHA256 of UTF-8 concatenation of sorted path + NUL + lowercase file SHA256 + LF. Files use raw bytes. Paths are relative POSIX paths.", sha256: sha256(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join("")), files: entries };
}

async function runProcess(executable, args, logFile) {
  const chunks = [];
  const log = createWriteStream(logFile, { flags: "wx" });
  return await new Promise((resolve) => {
    const child = spawn(executable, args, { cwd: ROOT, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" }, stdio: ["ignore", "pipe", "pipe"] });
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => { chunks.push(chunk); log.write(chunk); });
    let error;
    child.on("error", (reason) => { error = reason.message; log.write(`${reason.message}\n`); });
    child.on("close", (exitCode, signal) => {
      log.end(() => resolve({ exitCode, signal, ...(error ? { error } : {}), output: Buffer.concat(chunks).toString("utf8") }));
    });
  });
}

async function compilerEvidence(artifacts) {
  const builds = [];
  for (const id of new Set(artifacts.map((artifact) => artifact.buildInfoId))) {
    if (!id || typeof id !== "string" || path.basename(id) !== id) throw new Error("Missing or invalid Hardhat 3 buildInfoId");
    const build = await readJson(path.join(ROOT, "artifacts", "build-info", `${id}.json`));
    const projectSources = Object.entries(build.userSourceNameMap ?? {})
      .filter(([name]) => name.startsWith("contracts/"));
    if (projectSources.length === 0) throw new Error(`Build ${id} has no project sources`);
    for (const [name, inputName] of projectSources) {
      if (path.posix.normalize(name) !== name || name.includes("..")) throw new Error(`Unsafe build source ${name}`);
      if ((await readFile(path.join(ROOT, name), "utf8")) !== build.input.sources[inputName]?.content) throw new Error(`Compiler input differs from current source ${name}`);
    }
    builds.push({ id, solcVersion: build.solcVersion, solcLongVersion: build.solcLongVersion, settings: build.input.settings, verifiedProjectSources: projectSources.map(([name]) => name).sort(), inputSha256: sha256(JSON.stringify(ordered(build.input))) });
  }
  return builds;
}

function markdown(report, evidenceLink, instructionLink) {
  const escape = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
  return `# Point contract verification\n\nGenerated ${report.run.finishedAt}. This checks only this Point repository.\n\nLocal checks ${report.acceptance.localChecks}. Delivery artifact parity ${report.acceptance.deliveryParity}. Exit code ${report.acceptance.exitCode}.\n\n${report.acceptance.limitation}\n\nGit HEAD ${report.repository.head ?? "unknown"}. Input SHA256 \`${report.inputs?.sha256 ?? "unavailable"}\`.\n\n| Stage | Status | Findings |\n| --- | --- | --- |\n${report.stages.map((stage) => `| ${escape(stage.id)} | ${stage.status} | ${escape((stage.findings ?? []).join("; "))}${stage.log ? ` [log](${evidenceLink}/${stage.log})` : ""} |`).join("\n")}\n\nThe full test command is \`hardhat --network hardhatMainnet test --no-compile\`. It runs the repository's Solidity and Mocha suites. Raw logs and process exit codes are authoritative. Missing summary counts remain null; pending cases are not passes.\n\n[Machine-readable report](${evidenceLink}/report.json) includes the input manifest, per-runner summaries, compiler settings, dirty paths and artifact hashes. [Verification instructions](${instructionLink}) describe the baseline format and limits.\n`;
}

export async function main(args = process.argv.slice(2)) {
  let baselineDirectory;
  let requireBaseline = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--help" || args[i] === "-h") {
      console.log("Usage: npm run verify:contracts [-- --baseline DIR --require-baseline]\nRuns fresh local compile, existing ABI parity, optional delivered-artifact parity, and all Point tests.\nDIR contains PointToken.json, PointTokenFactory.json and UpgradablePointFactory.json Hardhat artifacts.\nNo baseline leaves delivery acceptance unverified; --require-baseline makes absence a failure.");
      return 0;
    }
    if (args[i] === "--require-baseline") requireBaseline = true;
    else if (args[i] === "--baseline" && args[i + 1] && !args[i + 1].startsWith("--")) baselineDirectory = path.resolve(args[++i]);
    else throw new Error(`Unknown or incomplete argument ${args[i]}`);
  }
  const evidenceRoot = path.join(ROOT, "verification-results");
  await mkdir(evidenceRoot, { recursive: true });
  const lockFile = path.join(evidenceRoot, ".lock");
  const lock = await open(lockFile, "wx").catch((error) => { throw new Error(`Cannot acquire acceptance lock ${lockFile}. Another run may be active. ${error.message}`); });
  try {
    const runDirectory = await mkdtemp(path.join(evidenceRoot, `${new Date().toISOString().replaceAll(":", "-")}-`));
    const runRelative = path.relative(ROOT, runDirectory).split(path.sep).join("/");
    const report = { schemaVersion: 1, repository: { name: "blockchain_point_loyalty", root: ROOT }, run: { startedAt: new Date().toISOString(), nodeVersion: process.version }, inputs: null, stages: [], contracts: [], acceptance: {} };
    const stage = async (id, work) => {
      try { const result = await work(); report.stages.push({ id, status: "pass", ...result }); return result; }
      catch (error) { report.stages.push({ id, status: "fail", findings: [error.message] }); return null; }
    };
    let baseline;
    let exportedAbis;
    try {
      await stage("snapshot", async () => {
        report.inputs = await manifest();
        const gitHead = await runProcess("git", ["rev-parse", "HEAD"], path.join(runDirectory, "git-head.log"));
        const gitDirty = await runProcess("git", ["status", "--porcelain=v1", "--untracked-files=all"], path.join(runDirectory, "git-status.log"));
        if (gitHead.exitCode !== 0 || gitDirty.exitCode !== 0) throw new Error("Unable to record Git identity");
        report.repository.head = gitHead.output.trim();
        report.repository.dirtyPaths = gitDirty.output.trim().split("\n").filter(Boolean);
        report.run.hardhatVersion = (await readJson(path.join(ROOT, "node_modules/hardhat/package.json"))).version;
        return { findings: [`${report.inputs.files.length} input files fingerprinted`] };
      });
      await stage("export_inputs", async () => {
        exportedAbis = new Map();
        for (const contract of CONTRACTS) {
          const data = await readJson(path.join(ROOT, "abi", `${contract.name}.json`));
          if (data.contractName !== contract.name) throw new Error(`ABI wrapper contractName mismatch for ${contract.name}`);
          canonicalAbi(data.abi);
          exportedAbis.set(contract.name, data.abi);
        }
        return { findings: ["Existing ABI exports captured without rewriting"] };
      });
      if (baselineDirectory) await stage("baseline_input", async () => {
        baseline = await readBaseline(baselineDirectory);
        report.run.baseline = { directory: baselineDirectory, files: [...baseline].map(([name, value]) => ({ name, sha256: value.sha256 })) };
        return { findings: ["Baseline captured before compilation; provenance is supplied by the caller"] };
      });
      const hardhat = path.join(ROOT, "node_modules", ".bin", "hardhat");
      const compile = await stage("compile", async () => {
        const args = ["--network", "hardhatMainnet", "compile", "--force"];
        const result = await runProcess(hardhat, args, path.join(runDirectory, "compile.log"));
        const { output, ...outcome } = result;
        return { status: result.exitCode === 0 && !result.signal && !result.error ? "pass" : "fail", command: [hardhat, ...args], log: "compile.log", ...outcome, findings: ["Fresh compilation on the simulated hardhatMainnet network"] };
      });
      if (compile?.status === "pass") {
        let artifacts;
        await stage("artifacts", async () => {
          artifacts = await Promise.all(CONTRACTS.map(async (contract) => validateArtifact(await readJson(path.join(ROOT, "artifacts", contract.source, `${contract.name}.json`)), contract)));
          report.compiler = await compilerEvidence(artifacts);
          report.contracts = artifacts.map((artifact) => ({ name: artifact.contractName, source: artifact.sourceName, bytecodeSha256: sha256(artifact.bytecode), deployedBytecodeSha256: sha256(artifact.deployedBytecode) }));
          return { findings: ["Registry artifacts and compiler project-source inputs verified"] };
        });
        if (artifacts && report.compiler && exportedAbis?.size === CONTRACTS.length) await stage("abi_parity", async () => {
          const mismatches = artifacts.filter((artifact) => !compareAbi(exportedAbis.get(artifact.contractName), artifact.abi));
          if (mismatches.length) throw new Error(`ABI drift: ${mismatches.map((artifact) => artifact.contractName).join(", ")}`);
          return { findings: ["All three exported ABIs match full compiler ABI entries"] };
        });
        else report.stages.push({ id: "abi_parity", status: "blocked", findings: ["Valid artifacts, compiler inputs and ABI exports required"] });
        if (!baselineDirectory) report.stages.push({ id: "baseline", status: "not_provided", findings: ["No delivered-artifact comparison performed"] });
        else if (baseline && artifacts && report.compiler) await stage("baseline", async () => {
          const mismatches = artifacts.flatMap((artifact) => compareArtifacts(baseline.get(artifact.contractName).artifact, artifact).map((field) => `${artifact.contractName}.${field}`));
          if (mismatches.length) throw new Error(`Delivered-artifact mismatch: ${mismatches.join(", ")}`);
          return { findings: ["ABI, creation/deployed bytecode, link and immutable references match supplied artifacts exactly"] };
        });
        else report.stages.push({ id: "baseline", status: "blocked", findings: ["Valid supplied baseline and fresh artifacts required"] });
        await stage("tests", async () => {
          const args = ["--network", "hardhatMainnet", "test", "--no-compile"];
          const result = await runProcess(hardhat, args, path.join(runDirectory, "tests.log"));
          const { output, ...outcome } = result;
          return { ...testOutcome(result), command: [hardhat, ...args], log: "tests.log", ...outcome };
        });
      } else {
        for (const id of ["artifacts", "abi_parity", "baseline", "tests"]) report.stages.push({ id, status: "blocked", findings: ["Fresh compilation failed; stale artifacts and tests were not used"] });
      }
      await stage("input_stability", async () => {
        report.finalInputs = await manifest();
        if (!report.inputs || report.inputs.sha256 !== report.finalInputs.sha256) throw new Error("Inputs changed during verification or initial snapshot failed");
        return { findings: ["Source, tests, exports, scripts and configuration unchanged during run"] };
      });
    } catch (error) {
      report.stages.push({ id: "infrastructure", status: "fail", findings: [error.message] });
    }
    report.run.finishedAt = new Date().toISOString();
    const exitCode = resultExitCode(report.stages, requireBaseline);
    report.acceptance = { exitCode, requireBaseline, localChecks: report.stages.some((entry) => entry.id !== "baseline" && entry.id !== "baseline_input" && ["fail", "blocked"].includes(entry.status)) ? "failed" : "passed", deliveryParity: report.stages.find((entry) => entry.id === "baseline")?.status ?? "blocked", limitation: "This is repository verification, not a security audit or on-chain deployment comparison. No delivery acceptance is established without a supplied baseline with trusted provenance. A copy of this checkout's artifacts proves only reproducibility. Historical issue hashes and test counts are not applied to Point v3." };
    await writeFile(path.join(runDirectory, "report.json"), json(report));
    await writeFile(path.join(runDirectory, "report.md"), markdown(report, ".", "../../docs/CONTRACT_VERIFICATION.md"));
    await mkdir(path.join(ROOT, "docs"), { recursive: true });
    await writeFile(path.join(ROOT, "docs", "contract-acceptance.md"), markdown(report, `../${runRelative}`, "CONTRACT_VERIFICATION.md"));
    console.log(`Point verification exit ${exitCode}. Report ${path.join(ROOT, "docs", "contract-acceptance.md")}\nEvidence ${runDirectory}`);
    for (const entry of report.stages) console.log(`${entry.id}: ${entry.status}`);
    return exitCode;
  } finally {
    await lock.close();
    await rm(lockFile);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
