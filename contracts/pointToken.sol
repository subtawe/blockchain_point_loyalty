// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

import {PointTokenBase} from "./base/PointTokenBase.sol";

contract PointToken is PointTokenBase {
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_
    ) PointTokenBase(name_, symbol_, owner_) {}
}
