import { reportDeploymentError, runPointDeployment } from "./runPointDeployment.js";

await runPointDeployment({
    factoryContract: "UpgradablePointFactory",
    name: "ui",
    symbol: "UI",
}).catch(reportDeploymentError);
