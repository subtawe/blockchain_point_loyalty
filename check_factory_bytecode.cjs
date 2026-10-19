const fs = require('fs');
const artifact = require('./artifacts/contracts/PointFactory.sol/PointTokenFactoryV2.json');
const pointTokenArtifact = require('./artifacts/contracts/PointToken.sol/PointToken.json');

console.log("Factory Bytecode length:", artifact.bytecode.length);
console.log("PointToken Bytecode length:", pointTokenArtifact.bytecode.length);

// Check if PointToken bytecode is contained in Factory bytecode
// Note: The factory bytecode contains the PointToken creation code, which matches PointToken.bytecode (mostly)
// But it might be slightly different due to immutables or linking?
// PointToken has no libraries to link (all internal).

if (artifact.bytecode.includes(pointTokenArtifact.bytecode.substring(2))) {
    console.log("PointToken bytecode FOUND in Factory bytecode");
} else {
    console.log("PointToken bytecode NOT FOUND in Factory bytecode");
    // Try to find a large chunk
    const chunk = pointTokenArtifact.bytecode.substring(2, 1000);
    if (artifact.bytecode.includes(chunk)) {
        console.log("Large chunk of PointToken bytecode FOUND");
    } else {
        console.log("Large chunk of PointToken bytecode NOT FOUND");
    }
}
