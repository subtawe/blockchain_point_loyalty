// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

/// @notice Gregorian calendar fields in Thai time (UTC+7, no daylight saving) for timestamps from 1970.
library ThaiCalendar {
    uint256 internal constant UTC_OFFSET = 7 hours;
    uint256 private constant DAYS_FROM_YEAR_ZERO_TO_EPOCH = 719468;
    uint256 private constant DAYS_PER_ERA = 146097;
    uint256 private constant YEARS_PER_ERA = 400;

    function civil(uint256 timestamp)
        internal
        pure
        returns (uint256 year, uint256 month, uint256 day, uint256 secondsOfDay)
    {
        uint256 thaiTimestamp = timestamp + UTC_OFFSET;
        secondsOfDay = thaiTimestamp % 1 days;
        uint256 shiftedDays = thaiTimestamp / 1 days + DAYS_FROM_YEAR_ZERO_TO_EPOCH;
        uint256 era = shiftedDays / DAYS_PER_ERA;
        uint256 dayOfEra = shiftedDays - era * DAYS_PER_ERA;
        uint256 yearOfEra = (dayOfEra - dayOfEra / 1460 + dayOfEra / 36524 - dayOfEra / 146096) / 365;
        uint256 dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100);
        uint256 marchBasedMonth = (5 * dayOfYear + 2) / 153;
        day = dayOfYear - (153 * marchBasedMonth + 2) / 5 + 1;
        month = marchBasedMonth < 10 ? marchBasedMonth + 3 : marchBasedMonth - 9;
        year = yearOfEra + era * YEARS_PER_ERA + (month <= 2 ? 1 : 0);
    }

    /// @dev Returns 00:00 Thai time on the first day of the month. Months before February 1970 revert on underflow.
    function monthStart(uint256 year, uint256 month) internal pure returns (uint256) {
        uint256 marchBasedYear = month <= 2 ? year - 1 : year;
        uint256 era = marchBasedYear / YEARS_PER_ERA;
        uint256 yearOfEra = marchBasedYear - era * YEARS_PER_ERA;
        uint256 dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5;
        uint256 dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
        uint256 daysSinceEpoch = era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_YEAR_ZERO_TO_EPOCH;
        return daysSinceEpoch * 1 days - UTC_OFFSET;
    }
}
