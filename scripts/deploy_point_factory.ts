import hre from "hardhat";

async function main() {
    const connection = await hre.network.connect();
    try {
        const factory = await connection.ethers.deployContract("PointTokenFactory");
        await factory.waitForDeployment();
        console.log("PointTokenFactory deployed to:", await factory.getAddress());
    } finally {
        await connection.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
