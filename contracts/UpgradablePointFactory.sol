// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {NewPointToken} from "./newPointToken.sol";

/// @notice Deploys empty Point identities owned by the factory owner.
contract UpgradablePointFactory is
    Initializable,
    OwnableUpgradeable,
    UUPSUpgradeable
{
    uint256 private constant POINT_TOKEN_VERSION = 3;

    address[] public deployedTokens;

    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        address indexed deployer
    );

    /// @notice Identifies the identity-first lifecycle ABI.
    function pointTokenVersion() external pure returns (uint256) {
        return POINT_TOKEN_VERSION;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize() public initializer {
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
    }

    function _authorizeUpgrade(
        address newImplementation
    ) internal override onlyOwner {}

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

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     * See https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps
     */
    uint256[49] private __gap;
}
