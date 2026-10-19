import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import hre from "hardhat";

const outputDirectory = resolve("abi");
await mkdir(outputDirectory, { recursive: true });
for (const name of ["NewPointToken", "NewPointTokenFactory", "UpgradablePointFactory"]) {
    const { abi } = await hre.artifacts.readArtifact(name);
    await writeFile(resolve(outputDirectory, `${name}.json`), JSON.stringify({ contractName: name, abi }, null, 2) + "\n");
    console.log(`Exported abi/${name}.json`);
}
