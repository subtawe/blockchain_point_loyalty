// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title IPointToken
/// @notice Minimal interface for the PointToken contract
interface IPointToken {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function owner() external view returns (address);
    function mint(address to, uint256 amount) external;
    function burn(uint256 amount) external;
}
