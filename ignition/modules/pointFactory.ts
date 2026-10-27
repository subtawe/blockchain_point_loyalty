import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const PointFactoryModule = buildModule("PointFactoryModule", (m) => {
    const owner = m.getParameter("owner", m.getAccount(0));

    const pointFactory = m.contract("PointTokenFactory", []);
    m.call(pointFactory, "transferOwnership", [owner]);

    return { pointFactory };
});

export default PointFactoryModule;
