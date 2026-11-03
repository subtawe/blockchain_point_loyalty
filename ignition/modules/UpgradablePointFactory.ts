import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const UpgradablePointFactoryModule = buildModule("UpgradablePointFactoryModule", (m) => {
    const implementation = m.contract("UpgradablePointFactory");

    const initializeData = m.encodeFunctionCall(implementation, "initialize", []);

    const proxy = m.contract("AppProxy", [implementation, initializeData]);

    return { proxy };
});

export default UpgradablePointFactoryModule;
