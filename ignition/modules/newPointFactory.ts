import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const NewPointFactoryModule = buildModule("NewPointFactoryModule", (m) => {
    const owner = m.getParameter("owner", m.getAccount(0));

    const newPointFactory = m.contract("NewPointTokenFactory", []);

    return { newPointFactory };
});

export default NewPointFactoryModule;
