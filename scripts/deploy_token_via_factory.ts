import { reportDeploymentError, runPointDeployment } from "./runPointDeployment.js";

await runPointDeployment({
    factoryContract: "PointTokenFactory",
    name: "TestPoint",
    symbol: "TP",
}).catch(reportDeploymentError);
