// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPointToken.sol";
import "./PointToken.sol"; // Import the contract to be deployed

/// @title PointTokenFactory
/// @notice Deploys new instances of the PointToken (ERC7818) contract.
contract PointTokenFactory is Ownable {
    // Stores the addresses of all PointToken contracts deployed by this factory
    address[] public deployedTokens;

    /// @notice Emitted when a new PointToken contract is deployed.
    event TokenDeployed(
        address indexed tokenAddress,
        string name,
        string symbol,
        address deployer
    );

    constructor() Ownable(msg.sender) {}

    /// @notice Deploys a new PointToken contract.
    /// @dev Only callable by the owner of the factory.
    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param initBlockNumber_ Start block number for the first epoch
    /// @param duration_ Duration of each epoch in blocks
    /// @param size_ Number of epochs in the sliding window
    /// @param safe_ Enable safe mode (extra validations)
    /// @param tokenOwner_ The address that will own the newly deployed PointToken.
    /// @return newTokenAddress The address of the newly deployed PointToken contract.
    function deployPointToken(
        string memory name_,
        string memory symbol_,
        uint256 initBlockNumber_,
        uint40 duration_,
        uint8 size_,
        bool safe_,
        address tokenOwner_,
        uint256 amountInit_
    ) external onlyOwner returns (address newTokenAddress) {
        // Use 'new' keyword for simplicity and safety, which handles arguments
        PointToken newToken = new PointToken(
            name_,
            symbol_,
            initBlockNumber_,
            duration_,
            size_,
            safe_,
            tokenOwner_,
            amountInit_
        );

        newTokenAddress = address(newToken);

        deployedTokens.push(newTokenAddress);

        emit TokenDeployed(newTokenAddress, name_, symbol_, msg.sender);
    }

    /// @notice Returns the total number of deployed tokens.
    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }
}
