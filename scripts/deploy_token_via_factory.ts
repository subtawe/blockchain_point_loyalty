import { reportDeploymentError, runPointDeployment } from "./runPointDeployment.js";

await runPointDeployment({
    factoryContract: "NewPointTokenFactory",
    name: "TestPoint",
    symbol: "TP",
}).catch(reportDeploymentError);
