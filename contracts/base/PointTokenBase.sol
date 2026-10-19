// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.0 <0.9.0;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IPointToken} from "../interfaces/IPointToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ThaiCalendar} from "../utils/ThaiCalendar.sol";

/// @notice Owner-configured Customer points with escrow-backed Marketer inventory.
/// @dev Expiration locks spending without burning ledger balances or supply.
abstract contract PointTokenBase is ERC20, Ownable, IPointToken {
    uint256 private constant DATE_CONFIG_LENGTH = 64;
    uint256 private constant POLICY_CONFIG_LENGTH = 32;
    uint256 private constant MAX_WALLET_LOTS = 256;
    uint256 private constant MIN_EXPIRY_MONTHS_AHEAD = 2;
    uint256 private constant MAX_EXPIRY_MONTHS_AHEAD = 13;
    uint256 private constant LONGEST_MONTH = 31 days;

    State public override state;
    Business public override business;
    TransferPolicy public override transferPolicy;
    uint256 public override startDate;
    uint256 public override expireDate;
    mapping(address account => uint256 value) public override inventoryBalanceOf;
    mapping(address account => bool allowed) public override isMarketer;
    mapping(address caller => mapping(bytes32 operationId => bytes32 payloadHash)) private _operations;
    uint256 public override lotCount;
    mapping(uint256 lotId => Lot) private _lots;
    mapping(bytes32 datesHash => uint256 lotId) private _lotIdsByDates;
    mapping(address account => mapping(uint256 lotId => uint256 value)) public override balanceByLot;
    mapping(address account => uint256[] lotIds) public override walletLotIds;
    mapping(address recipient => mapping(address sender => bool allowed)) public override allowedSenders;

    constructor(
        string memory name_,
        string memory symbol_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {}

    /// @dev Only the owner can lock the business and its configuration, exactly once.
    function configureBusiness(Business business_, bytes calldata config) external override onlyOwner {
        if (state != State.Draft) revert AlreadyConfigured();
        if (business_ == Business.None) revert InvalidBusiness();
        if (business_ == Business.A) {
            (startDate, expireDate) = _decodeDates(config);
        } else {
            if (config.length != POLICY_CONFIG_LENGTH) revert InvalidConfiguration();
            TransferPolicy policy = abi.decode(config, (TransferPolicy));
            if (business_ == Business.B && policy != TransferPolicy.FEFO_ONLY) revert InvalidConfiguration();
            if (business_ == Business.C && policy != TransferPolicy.USER_SELECT) revert InvalidConfiguration();
            transferPolicy = policy;
        }
        business = business_;
        state = State.Configured;
        emit BusinessConfigured(business_, config);
    }

    /// @dev Inventory claims are backed only by ERC20 units held in this token's escrow.
    function mintInventory(address to, uint256 value, bytes32 issueId) external override onlyOwner {
        _recordOperation(issueId, keccak256(abi.encode(msg.sig, to, value, issueId)));
        _validateAccount(to);
        _validateAmount(value);
        inventoryBalanceOf[to] += value;
        super._update(address(0), address(this), value);
        emit InventoryMinted(to, value, issueId);
    }

    function setMarketer(address marketer, bool allowed) external override onlyOwner {
        _validateAccount(marketer);
        if (isMarketer[marketer] == allowed) return;
        isMarketer[marketer] = allowed;
        emit MarketerPermissionUpdated(marketer, allowed);
    }

    /// @dev Direct issuance requires owner authority and a configured A business.
    function mint(address to, uint256 value, bytes32 issueId) external override onlyOwner {
        _recordOperation(issueId, keccak256(abi.encode(msg.sig, to, value, issueId)));
        _requireSharedDates();
        _validateAmount(value);
        _mint(to, value);
        emit CustomerMinted(to, value, issueId);
    }

    /// @dev Only trusted issuance bypasses recipient opt-in, after validating dates and index capacity.
    function mintLot(
        address to,
        uint256 value,
        uint256 startDate_,
        uint256 expireDate_,
        bytes32 issueId
    ) external override onlyOwner returns (uint256 lotId) {
        _recordOperation(issueId, keccak256(abi.encode(msg.sig, to, value, startDate_, expireDate_, issueId)));
        _requireLotBusiness();
        if (business == Business.D) revert UnsupportedBusiness();
        _validateAccount(to);
        _validateAmount(value);
        _validateDates(startDate_, expireDate_);
        lotId = _findOrCreateLot(startDate_, expireDate_);
        _creditLot(to, lotId, value);
        super._update(address(0), to, value);
        emit LotMinted(to, lotId, value, issueId);
    }

    /// @dev Delivery moves existing escrow units; the named claim is the sole inventory source.
    function sendToCustomer(
        address inventoryAccount,
        address customer,
        uint256 value,
        bytes calldata deliveryConfig,
        bytes32 deliveryId
    ) external override {
        _requireDeliveryAuthority(inventoryAccount);
        _recordOperation(deliveryId, keccak256(abi.encode(
            msg.sig, inventoryAccount, customer, value, deliveryConfig, deliveryId
        )));
        _requireConfigured();
        _validateAccount(inventoryAccount);
        _validateAccount(customer);
        _validateAmount(value);
        uint256 lotId = _deliveryLot(deliveryConfig);
        if (inventoryBalanceOf[inventoryAccount] < value) revert InsufficientInventory();
        inventoryBalanceOf[inventoryAccount] -= value;
        if (lotId != 0) _creditLot(customer, lotId, value);
        super._update(address(this), customer, value);
        emit CustomerDelivered(inventoryAccount, customer, value, lotId, deliveryId);
    }

    function _requireDeliveryAuthority(address inventoryAccount) private view {
        if (msg.sender == owner()) return;
        if (business != Business.D || !isMarketer[msg.sender]) revert OwnableUnauthorizedAccount(msg.sender);
        if (inventoryAccount != msg.sender) revert InventorySourceNotAllowed(msg.sender, inventoryAccount);
    }

    /// @dev Owner redemption never consumes inventory, Pending balances, or Expired balances.
    function burn(address from, uint256 value, bytes32 redemptionId) external override onlyOwner {
        _redeem(from, value, redemptionId);
    }

    function redeemFEFO(address from, uint256 value, bytes32 redemptionId) external override onlyOwner {
        _redeem(from, value, redemptionId);
    }

    function allowSender(address sender, bool allowed) external override {
        _validateAccount(msg.sender);
        _validateAccount(sender);
        allowedSenders[msg.sender][sender] = allowed;
        emit SenderPermission(msg.sender, sender, allowed);
    }

    function transferFEFO(address to, uint256 value, bytes32 transferId) external override {
        _requireConfigured();
        _validateAmount(value);
        _validateAccount(msg.sender);
        _validateCustomRecipient(to);
        if (business != Business.A) _requireSenderPermission(msg.sender, to);
        _recordOperation(transferId, keccak256(abi.encode(msg.sig, to, value, transferId)));
        _transfer(msg.sender, to, value);
    }

    /// @dev Manual movement validates every allocation and uses the same lot credits as FEFO.
    function transferLots(address to, Allocation[] calldata allocations, bytes32 transferId) external override {
        _requireLotBusiness();
        if (transferPolicy != TransferPolicy.USER_SELECT) revert ManualSelectionDisabled();
        _validateAccount(msg.sender);
        _validateCustomRecipient(to);
        _requireSenderPermission(msg.sender, to);
        _recordOperation(transferId, keccak256(abi.encode(msg.sig, to, allocations, transferId)));
        uint256 value = _validateAllocations(msg.sender, allocations);
        if (msg.sender != to) {
            _pruneLots(to);
            for (uint256 position; position < allocations.length; ++position) {
                Allocation calldata allocation = allocations[position];
                _moveAllocation(msg.sender, to, allocation.lotId, allocation.value);
            }
            _pruneLots(msg.sender);
        }
        super._update(msg.sender, to, value);
    }

    function getPointDates() external view override returns (uint256, uint256) {
        _requireSharedDates();
        return (startDate, expireDate);
    }

    function isActive() public view override returns (bool) {
        return business == Business.A && block.timestamp >= startDate && block.timestamp <= expireDate;
    }

    function isExpired() public view override returns (bool) {
        return business == Business.A && block.timestamp > expireDate;
    }

    function validityStatus() external view override returns (ValidityStatus) {
        _requireSharedDates();
        if (block.timestamp < startDate) return ValidityStatus.Pending;
        return isExpired() ? ValidityStatus.Expired : ValidityStatus.Active;
    }

    function availableBalanceOf(address account) public view override returns (uint256) {
        if (account == address(this) || state != State.Configured) return 0;
        if (business == Business.A) return isActive() ? balanceOf(account) : 0;
        uint256 available;
        uint256[] storage lotIds = walletLotIds[account];
        for (uint256 position; position < lotIds.length; ++position) {
            uint256 lotId = lotIds[position];
            if (_lotStatus(lotId) == ValidityStatus.Active) available += balanceByLot[account][lotId];
        }
        return available;
    }

    function availableSupply() external view override returns (uint256) {
        _requireSharedDates();
        return isActive() ? totalSupply() - balanceOf(address(this)) : 0;
    }

    function maxWalletLots() external pure override returns (uint256) {
        return MAX_WALLET_LOTS;
    }

    function maxExpiryMonthsAhead() external pure override returns (uint256) {
        return MAX_EXPIRY_MONTHS_AHEAD;
    }

    function walletLotCount(address account) external view override returns (uint256) {
        return walletLotIds[account].length;
    }

    function getLotDates(uint256 lotId) external view override returns (uint256, uint256) {
        _requireLot(lotId);
        Lot storage lot = _lots[lotId];
        return (lot.startDate, lot.expireDate);
    }

    function lotValidityStatus(uint256 lotId) external view override returns (ValidityStatus) {
        _requireLot(lotId);
        return _lotStatus(lotId);
    }

    function _redeem(address from, uint256 value, bytes32 redemptionId) private {
        _recordOperation(redemptionId, keccak256(abi.encode(msg.sig, from, value, redemptionId)));
        _validateAmount(value);
        _burn(from, value);
        emit CustomerRedeemed(from, value, redemptionId);
    }

    function _update(address from, address to, uint256 value) internal override {
        _requireConfigured();
        if (from != address(0)) _validateAccount(from);
        if (to != address(0)) _validateAccount(to);
        if (business == Business.A) {
            if (from != address(0) && block.timestamp < startDate) revert PointNotStarted();
            if (isExpired()) revert PointExpired();
        } else {
            if (from == address(0)) revert UnsupportedBusiness();
            if (to != address(0)) _requireSenderPermission(from, to);
            _spendFEFO(from, to, value);
        }
        super._update(from, to, value);
    }

    function _deliveryLot(bytes calldata config) private returns (uint256) {
        if (business == Business.A) {
            if (config.length != 0) revert InvalidConfiguration();
            if (isExpired()) revert PointExpired();
            return 0;
        }
        (uint256 start, uint256 expiry) = _decodeDates(config);
        if (business == Business.D) _requireCurrentThaiMonthWindow(start, expiry);
        return _findOrCreateLot(start, expiry);
    }

    function _requireCurrentThaiMonthWindow(uint256 start, uint256 expiry) private view {
        (uint256 currentYear, uint256 currentMonth, , ) = ThaiCalendar.civil(block.timestamp);
        if (start != ThaiCalendar.monthStart(currentYear, currentMonth)) revert MonthWindowNotCurrent();
        if (expiry - start > MAX_EXPIRY_MONTHS_AHEAD * LONGEST_MONTH) revert InvalidMonthWindow();
        (uint256 expiryYear, uint256 expiryMonth, uint256 expiryDay, uint256 expirySeconds) = ThaiCalendar.civil(expiry);
        if (expiryDay != 1 || expirySeconds != 0) revert InvalidMonthWindow();
        uint256 monthsAhead = expiryYear * 12 + expiryMonth - (currentYear * 12 + currentMonth);
        if (monthsAhead < MIN_EXPIRY_MONTHS_AHEAD || monthsAhead > MAX_EXPIRY_MONTHS_AHEAD) revert InvalidMonthWindow();
    }

    function _decodeDates(bytes calldata config) private view returns (uint256 start, uint256 expiry) {
        if (config.length != DATE_CONFIG_LENGTH) revert InvalidConfiguration();
        (start, expiry) = abi.decode(config, (uint256, uint256));
        _validateDates(start, expiry);
    }

    function _validateDates(uint256 start, uint256 expiry) private view {
        if (start >= expiry) revert InvalidDateRange();
        if (expiry <= block.timestamp) revert PointExpired();
    }

    function _requireSharedDates() private view {
        _requireConfigured();
        if (business != Business.A) revert UnsupportedBusiness();
    }

    function _requireLotBusiness() private view {
        _requireConfigured();
        if (business == Business.A) revert UnsupportedBusiness();
    }

    function _requireConfigured() private view {
        if (state != State.Configured) revert NotConfigured();
    }

    function _requireLot(uint256 lotId) private view {
        if (lotId == 0 || lotId > lotCount) revert InvalidLot();
    }

    function _lotStatus(uint256 lotId) private view returns (ValidityStatus) {
        Lot storage lot = _lots[lotId];
        if (block.timestamp < lot.startDate) return ValidityStatus.Pending;
        bool expired = business == Business.D
            ? block.timestamp >= lot.expireDate
            : block.timestamp > lot.expireDate;
        return expired ? ValidityStatus.Expired : ValidityStatus.Active;
    }

    function _findOrCreateLot(uint256 start, uint256 expiry) private returns (uint256 lotId) {
        bytes32 datesHash = keccak256(abi.encode(start, expiry));
        lotId = _lotIdsByDates[datesHash];
        if (lotId != 0) return lotId;
        lotId = ++lotCount;
        _lots[lotId] = Lot(start, expiry);
        _lotIdsByDates[datesHash] = lotId;
        emit LotCreated(lotId, start, expiry);
    }

    function _comesBefore(uint256 firstLotId, uint256 secondLotId) private view returns (bool) {
        uint256 firstExpiry = _lots[firstLotId].expireDate;
        uint256 secondExpiry = _lots[secondLotId].expireDate;
        return firstExpiry < secondExpiry || (firstExpiry == secondExpiry && firstLotId < secondLotId);
    }

    function _creditLot(address account, uint256 lotId, uint256 value) private {
        _pruneLots(account);
        _creditPrunedLot(account, lotId, value);
    }

    function _creditPrunedLot(address account, uint256 lotId, uint256 value) private {
        uint256[] storage lotIds = walletLotIds[account];
        for (uint256 position; position < lotIds.length; ++position) {
            if (lotIds[position] == lotId) {
                balanceByLot[account][lotId] += value;
                return;
            }
        }
        if (lotIds.length == MAX_WALLET_LOTS) revert WalletLotLimit();
        lotIds.push(lotId);
        uint256 insertion = lotIds.length - 1;
        while (insertion > 0 && _comesBefore(lotId, lotIds[insertion - 1])) {
            lotIds[insertion] = lotIds[insertion - 1];
            --insertion;
        }
        lotIds[insertion] = lotId;
        balanceByLot[account][lotId] += value;
    }

    function _pruneLots(address account) private {
        uint256[] storage lotIds = walletLotIds[account];
        uint256 retained;
        for (uint256 position; position < lotIds.length; ++position) {
            uint256 lotId = lotIds[position];
            if (balanceByLot[account][lotId] == 0 || _lotStatus(lotId) == ValidityStatus.Expired) continue;
            lotIds[retained++] = lotId;
        }
        while (lotIds.length > retained) lotIds.pop();
    }

    function _spendFEFO(address from, address to, uint256 value) private {
        if (availableBalanceOf(from) < value) revert InsufficientAvailableBalance();
        if (from == to) return;
        _pruneLots(from);
        if (to != address(0) && value > 0) _pruneLots(to);
        uint256[] memory lotIds = walletLotIds[from];
        uint256 remaining = value;
        for (uint256 position; position < lotIds.length && remaining > 0; ++position) {
            uint256 lotId = lotIds[position];
            if (_lotStatus(lotId) != ValidityStatus.Active) continue;
            uint256 lotBalance = balanceByLot[from][lotId];
            uint256 allocation = lotBalance < remaining ? lotBalance : remaining;
            _moveAllocation(from, to, lotId, allocation);
            remaining -= allocation;
        }
        _pruneLots(from);
    }

    function _moveAllocation(address from, address to, uint256 lotId, uint256 value) private {
        balanceByLot[from][lotId] -= value;
        if (to == address(0)) {
            emit LotRedeemed(from, lotId, value);
        } else {
            _creditPrunedLot(to, lotId, value);
            emit LotTransferred(from, to, lotId, value);
        }
    }

    function _validateAllocations(address from, Allocation[] calldata allocations) private view returns (uint256 value) {
        if (allocations.length == 0 || allocations.length > MAX_WALLET_LOTS) revert InvalidAllocations();
        uint256 previousLotId;
        for (uint256 position; position < allocations.length; ++position) {
            Allocation calldata allocation = allocations[position];
            _requireLot(allocation.lotId);
            _validateAmount(allocation.value);
            if (allocation.lotId <= previousLotId) revert InvalidAllocations();
            ValidityStatus status = _lotStatus(allocation.lotId);
            if (status == ValidityStatus.Pending) revert PointNotStarted();
            if (status == ValidityStatus.Expired) revert PointExpired();
            if (balanceByLot[from][allocation.lotId] < allocation.value) revert InsufficientAvailableBalance();
            value += allocation.value;
            previousLotId = allocation.lotId;
        }
    }

    function _requireSenderPermission(address from, address to) private view {
        if (!allowedSenders[to][from]) revert SenderNotAllowed();
    }

    function _validateAccount(address account) private view {
        if (account == address(0) || account == address(this)) revert InvalidAccount();
    }

    function _validateCustomRecipient(address recipient) private view {
        _validateAccount(recipient);
        if (recipient == msg.sender) revert InvalidAccount();
    }

    function _validateAmount(uint256 value) private pure {
        if (value == 0) revert InvalidAmount();
    }

    function _recordOperation(bytes32 operationId, bytes32 payloadHash) private {
        bytes32 previousHash = _operations[msg.sender][operationId];
        if (previousHash == payloadHash) revert AlreadyProcessed();
        if (previousHash != bytes32(0)) revert OperationConflict();
        _operations[msg.sender][operationId] = payloadHash;
    }
}
