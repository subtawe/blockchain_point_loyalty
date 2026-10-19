import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PointFactoryModule = buildModule("PointFactoryModule", (m) => {
    const owner = m.getParameter("owner", m.getAccount(0));

    const pointFactory = m.contract("PointTokenFactory", []);

    return { pointFactory };
});

export default PointFactoryModule;
