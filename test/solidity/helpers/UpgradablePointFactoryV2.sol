// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../../../contracts/UpgradablePointFactory.sol";
// for Forge test with UpgradablePointFactory contract
contract UpgradablePointFactoryV2 is UpgradablePointFactory {
    function version() external pure returns (string memory) {
        return "v2";
    }
}
