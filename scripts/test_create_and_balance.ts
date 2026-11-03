import { reportDeploymentError, runPointDeployment } from "./runPointDeployment.js";

await runPointDeployment({
    factoryContract: "UpgradablePointFactory",
    name: "TestPoint",
    symbol: "TP",
}).catch(reportDeploymentError);
