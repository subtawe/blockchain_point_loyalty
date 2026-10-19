// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Lifecycle and Customer accounting for owner-issued Point identities.
interface INewPointToken is IERC20Metadata {
    error NotConfigured();
    error AlreadyConfigured();
    error InvalidBusiness();
    error InvalidConfiguration();
    error InvalidDateRange();
    error PointNotStarted();
    error PointExpired();
    error InvalidAccount();
    error InvalidAmount();
    error InsufficientInventory();
    error InventorySourceNotAllowed(address caller, address inventoryAccount);
    error AlreadyProcessed();
    error OperationConflict();
    error UnsupportedBusiness();
    error InvalidLot();
    error InvalidAllocations();
    error ManualSelectionDisabled();
    error SenderNotAllowed();
    error WalletLotLimit();
    error InsufficientAvailableBalance();
    error InvalidMonthWindow();
    error MonthWindowNotCurrent();

    enum State {
        Draft,
        Configured
    }

    enum Business {
        None,
        A,
        B,
        C,
        D
    }

    enum TransferPolicy {
        FEFO_ONLY,
        USER_SELECT
    }

    enum ValidityStatus {
        Pending,
        Active,
        Expired
    }

    struct Lot {
        uint256 startDate;
        uint256 expireDate;
    }

    struct Allocation {
        uint256 lotId;
        uint256 value;
    }

    event BusinessConfigured(Business indexed business, bytes config);
    event InventoryMinted(address indexed account, uint256 value, bytes32 indexed issueId);
    event CustomerMinted(address indexed account, uint256 value, bytes32 indexed issueId);
    event CustomerDelivered(
        address indexed inventoryAccount,
        address indexed customer,
        uint256 value,
        uint256 lotId,
        bytes32 indexed deliveryId
    );
    event CustomerRedeemed(address indexed account, uint256 value, bytes32 indexed redemptionId);
    event LotCreated(uint256 indexed lotId, uint256 startDate, uint256 expireDate);
    event LotMinted(address indexed account, uint256 indexed lotId, uint256 value, bytes32 indexed issueId);
    event LotTransferred(address indexed from, address indexed to, uint256 indexed lotId, uint256 value);
    event LotRedeemed(address indexed account, uint256 indexed lotId, uint256 value);
    event SenderPermission(address indexed recipient, address indexed sender, bool allowed);
    event MarketerPermissionUpdated(address indexed marketer, bool allowed);

    function state() external view returns (State);
    function business() external view returns (Business);
    function transferPolicy() external view returns (TransferPolicy);
    function startDate() external view returns (uint256);
    function expireDate() external view returns (uint256);
    function inventoryBalanceOf(address account) external view returns (uint256);
    function isMarketer(address account) external view returns (bool);
    function setMarketer(address marketer, bool allowed) external;
    function getPointDates() external view returns (uint256, uint256);
    function isActive() external view returns (bool);
    function isExpired() external view returns (bool);
    function validityStatus() external view returns (ValidityStatus);
    function availableBalanceOf(address account) external view returns (uint256);
    /// @notice Active Customer supply for A only; lot businesses reject this global query.
    function availableSupply() external view returns (uint256);
    /// @notice A uses two uint256 dates; B/C/D use one TransferPolicy ABI word.
    function configureBusiness(Business business_, bytes calldata config) external;
    function mintInventory(address to, uint256 value, bytes32 issueId) external;
    function mint(address to, uint256 value, bytes32 issueId) external;
    /// @notice A has empty delivery config. B, C and D have two dates. D needs the current Thai month start and a later Thai month start.
    function sendToCustomer(
        address inventoryAccount,
        address customer,
        uint256 value,
        bytes calldata deliveryConfig,
        bytes32 deliveryId
    ) external;
    function burn(address from, uint256 value, bytes32 redemptionId) external;
    function redeemFEFO(address from, uint256 value, bytes32 redemptionId) external;
    function lotCount() external view returns (uint256);
    function maxWalletLots() external pure returns (uint256);
    /// @notice D only. Furthest Thai month start, counted from the current Thai month, that a delivery may expire at.
    function maxExpiryMonthsAhead() external pure returns (uint256);
    function getLotDates(uint256 lotId) external view returns (uint256, uint256);
    function lotValidityStatus(uint256 lotId) external view returns (ValidityStatus);
    function balanceByLot(address account, uint256 lotId) external view returns (uint256);
    /// @notice Sorted live index, not history. Zero and Expired entries may be pruned; Pending entries remain.
    function walletLotIds(address account, uint256 position) external view returns (uint256);
    function walletLotCount(address account) external view returns (uint256);
    function allowedSenders(address recipient, address sender) external view returns (bool);
    function allowSender(address sender, bool allowed) external;
    /// @notice Direct B/C issuance may prepare Pending lots; D requires inventory delivery.
    function mintLot(
        address to,
        uint256 value,
        uint256 startDate_,
        uint256 expireDate_,
        bytes32 issueId
    ) external returns (uint256 lotId);
    /// @notice Explicit FEFO and standard ERC20 transfers share validity and recipient opt-in rules.
    function transferFEFO(address to, uint256 value, bytes32 transferId) external;
    /// @notice USER_SELECT only. Allocations must be positive and strictly ordered by lotId.
    function transferLots(address to, Allocation[] calldata allocations, bytes32 transferId) external;
}
