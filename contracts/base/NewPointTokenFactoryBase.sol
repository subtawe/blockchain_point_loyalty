// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {NewPointToken} from "../newPointToken.sol";

/// @notice Deploys empty Point identities owned by the factory owner.
abstract contract NewPointTokenFactoryBase is Ownable {
    uint256 private constant POINT_TOKEN_VERSION = 3;

    address[] public deployedTokens;

    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        address indexed deployer
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Identifies the identity-first lifecycle ABI.
    function pointTokenVersion() external pure returns (uint256) {
        return POINT_TOKEN_VERSION;
    }

    /// @dev Owner-only creation prevents unauthorized registry entries.
    function deployPointToken(
        string memory name_,
        string memory symbol_
    ) external onlyOwner returns (address newTokenAddress) {
        newTokenAddress = address(new NewPointToken(name_, symbol_, msg.sender));
        deployedTokens.push(newTokenAddress);
        emit TokenDeployed(newTokenAddress, name_, symbol_, msg.sender);
    }

    /// @notice Returns the total number of deployed tokens.
    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }
}
