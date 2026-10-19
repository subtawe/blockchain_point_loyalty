// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

import {NewPointTokenBase} from "./base/NewPointTokenBase.sol";

contract NewPointToken is NewPointTokenBase {
    constructor(
        string memory name_,
        string memory symbol_,
        address owner_
    ) NewPointTokenBase(name_, symbol_, owner_) {}
}
