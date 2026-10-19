const fs = require('fs');
const artifact = require('./artifacts/contracts/PointToken.sol/PointToken.json');
console.log("Bytecode length:", artifact.bytecode.length);
console.log("Deployed Bytecode length:", artifact.deployedBytecode.length);
