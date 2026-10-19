// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

import {ThaiCalendar} from "../utils/ThaiCalendar.sol";

/// @dev Test-only wrapper that exposes the internal calendar functions.
contract ThaiCalendarHarness {
    function civil(uint256 timestamp)
        external
        pure
        returns (uint256 year, uint256 month, uint256 day, uint256 secondsOfDay)
    {
        return ThaiCalendar.civil(timestamp);
    }

    function monthStart(uint256 year, uint256 month) external pure returns (uint256) {
        return ThaiCalendar.monthStart(year, month);
    }
}
