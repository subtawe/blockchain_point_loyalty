// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import "../../contracts/pointFactory.sol";
import {IPointToken} from "../../contracts/interfaces/IPointToken.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../../contracts/pointToken.sol";

contract PointFactoryTest is Test {
    PointTokenFactory public factory;
    PointToken public token;
    address public holder = address(0x123);
    address public recipient = address(0x456);
    address public spender = address(0x789);
    uint256 public startDate;
    uint256 public expireDate;

    function setUp() public {
        vm.warp(1_700_000_000);
        factory = new PointTokenFactory();
        startDate = block.timestamp + 100;
        expireDate = startDate + 1 days;
        token = PointToken(factory.deployPointToken("Points", "PTS"));
        token.configureBusiness(IPointToken.Business.A, abi.encode(startDate, expireDate));
        token.mint(holder, 1000, keccak256("fixture-issue"));
    }

    function test_DeploymentAndDates() public view {
        assertEq(factory.owner(), address(this));
        assertEq(factory.pointTokenVersion(), 3);
        assertEq(factory.getDeployedTokensCount(), 1);
        assertEq(factory.deployedTokens(0), address(token));
        assertEq(token.owner(), address(this));
        assertEq(token.startDate(), startDate);
        assertEq(token.expireDate(), expireDate);
        assertEq(token.balanceOf(holder), 1000);
        assertEq(token.totalSupply(), 1000);
    }

    function test_IdentityStartsEmptyAndDraft() public {
        PointToken draft = PointToken(factory.deployPointToken("Draft", "DFT"));
        assertEq(draft.owner(), address(this));
        assertEq(uint256(draft.state()), uint256(IPointToken.State.Draft));
        assertEq(uint256(draft.business()), uint256(IPointToken.Business.None));
        assertEq(draft.totalSupply(), 0);
        vm.expectRevert(IPointToken.NotConfigured.selector);
        draft.mint(holder, 1, keccak256("draft-issue"));
        draft.mintInventory(holder, 100, keccak256("draft-stock"));
        assertEq(draft.balanceOf(holder), 0);
        assertEq(draft.balanceOf(address(draft)), 100);
        assertEq(draft.inventoryBalanceOf(holder), 100);
        assertEq(draft.availableBalanceOf(holder), 0);
    }

    function test_InvalidConfigurationAndRecipientRollback() public {
        PointToken draft = PointToken(factory.deployPointToken("Draft", "DFT"));
        vm.expectRevert(IPointToken.InvalidDateRange.selector);
        draft.configureBusiness(IPointToken.Business.A, abi.encode(expireDate, startDate));
        vm.expectRevert(IPointToken.InvalidDateRange.selector);
        draft.configureBusiness(IPointToken.Business.A, abi.encode(startDate, startDate));
        vm.expectRevert(IPointToken.PointExpired.selector);
        draft.configureBusiness(IPointToken.Business.A, abi.encode(0, block.timestamp));
        assertEq(uint256(draft.state()), uint256(IPointToken.State.Draft));
        assertEq(draft.startDate(), 0);
        assertEq(draft.expireDate(), 0);
        draft.configureBusiness(IPointToken.Business.A, abi.encode(startDate, expireDate));
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InvalidReceiver.selector, address(0)));
        draft.mint(address(0), 1, keccak256("retry-issue"));
        assertEq(draft.totalSupply(), 0);
        draft.mint(holder, 1, keccak256("retry-issue"));
        assertEq(draft.balanceOf(holder), 1);
        assertEq(factory.getDeployedTokensCount(), 2);
        assertEq(factory.deployedTokens(1), address(draft));
    }

    function testFuzz_InvalidBusinessDPolicyPreservesDraftAndAllowsRetry(uint256 rawPolicy) public {
        rawPolicy = bound(rawPolicy, 2, type(uint256).max);
        PointToken draft = PointToken(factory.deployPointToken("Draft", "DFT"));
        uint256[5] memory invalidPolicies = [uint256(2), 255, 256, type(uint256).max, rawPolicy];

        for (uint256 i; i < invalidPolicies.length; ++i) {
            vm.expectRevert();
            draft.configureBusiness(IPointToken.Business.D, abi.encode(invalidPolicies[i]));
            assertEq(uint256(draft.state()), uint256(IPointToken.State.Draft));
            assertEq(uint256(draft.business()), uint256(IPointToken.Business.None));
            assertEq(uint256(draft.transferPolicy()), uint256(IPointToken.TransferPolicy.FEFO_ONLY));
        }

        draft.configureBusiness(IPointToken.Business.D, abi.encode(IPointToken.TransferPolicy.USER_SELECT));
        assertEq(uint256(draft.state()), uint256(IPointToken.State.Configured));
        assertEq(uint256(draft.business()), uint256(IPointToken.Business.D));
        assertEq(uint256(draft.transferPolicy()), uint256(IPointToken.TransferPolicy.USER_SELECT));
    }

    function test_PendingMintAndSpendingGuard() public {
        token.mint(holder, 100, keccak256("pending-issue"));
        vm.warp(startDate - 1);
        assertFalse(token.isActive());
        assertFalse(token.isExpired());
        assertEq(uint256(token.validityStatus()), 0);
        assertEq(token.balanceOf(holder), 1100);
        assertEq(token.availableBalanceOf(holder), 0);
        vm.expectRevert(IPointToken.PointNotStarted.selector);
        vm.prank(holder);
        token.transfer(recipient, 1);
        vm.expectRevert(IPointToken.PointNotStarted.selector);
        token.burn(holder, 1, keccak256("pending-burn"));
    }

    function test_InclusiveStartAndExpireDate() public {
        vm.warp(startDate);
        assertTrue(token.isActive());
        assertEq(token.availableBalanceOf(holder), 1000);
        vm.prank(holder);
        token.transfer(recipient, 100);
        vm.warp(expireDate);
        assertTrue(token.isActive());
        assertFalse(token.isExpired());
        token.mint(holder, 50, keccak256("boundary-issue"));
        token.burn(holder, 25, keccak256("boundary-burn"));
        vm.prank(holder);
        token.transfer(recipient, 100);
        assertEq(token.expireDate(), expireDate);
        assertEq(token.totalSupply(), 1025);
    }

    function test_ExpiredPreservesLedgerAndRejectsEverySpendingPath() public {
        vm.prank(holder);
        token.approve(spender, 500);
        vm.warp(expireDate + 1);
        assertTrue(token.isExpired());
        assertFalse(token.isActive());
        assertEq(uint256(token.validityStatus()), 2);
        assertEq(token.balanceOf(holder), 1000);
        assertEq(token.totalSupply(), 1000);
        assertEq(token.availableBalanceOf(holder), 0);
        assertEq(token.availableSupply(), 0);
        vm.expectRevert(IPointToken.PointExpired.selector);
        token.mint(holder, 1, keccak256("expired-issue"));
        vm.expectRevert(IPointToken.PointExpired.selector);
        token.burn(holder, 1, keccak256("expired-burn"));
        vm.expectRevert(IPointToken.PointExpired.selector);
        vm.prank(holder);
        token.transfer(recipient, 1);
        vm.expectRevert(IPointToken.PointExpired.selector);
        vm.prank(spender);
        token.transferFrom(holder, recipient, 1);
        assertEq(token.allowance(holder, spender), 500);
        assertEq(token.balanceOf(holder), 1000);
        assertEq(token.balanceOf(recipient), 0);
    }

    function test_ZeroAndSelfTransfersCannotBypassExpiry() public {
        vm.warp(startDate);
        vm.prank(holder);
        token.transfer(holder, 50);
        assertEq(token.balanceOf(holder), 1000);
        vm.warp(expireDate + 1);
        vm.expectRevert(IPointToken.PointExpired.selector);
        vm.prank(holder);
        token.transfer(holder, 0);
    }

    function test_OnlyOwnerCanDeployMintAndBurn() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, holder));
        vm.prank(holder);
        factory.deployPointToken("Bad", "BAD");
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, holder));
        vm.prank(holder);
        token.mint(holder, 1, keccak256("denied-issue"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, holder));
        vm.prank(holder);
        token.burn(holder, 1, keccak256("denied-burn"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, holder));
        vm.prank(holder);
        token.mintInventory(holder, 1, keccak256("denied-stock"));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, holder));
        vm.prank(holder);
        token.configureBusiness(IPointToken.Business.B, abi.encode(IPointToken.TransferPolicy.FEFO_ONLY));
    }

    function testFuzz_DateRange(uint32 startOffset, uint32 duration) public {
        uint256 start = block.timestamp + uint256(startOffset);
        uint256 end = start + uint256(duration) + 1;
        PointToken dated = PointToken(factory.deployPointToken("Fuzz", "FZZ"));
        dated.configureBusiness(IPointToken.Business.A, abi.encode(start, end));
        vm.warp(start);
        assertTrue(dated.isActive());
        vm.warp(end);
        assertTrue(dated.isActive());
        vm.warp(end + 1);
        assertTrue(dated.isExpired());
    }

    function testFuzz_TransferAndBurnConservation(uint128 minted, uint128 transferred, uint128 burned) public {
        vm.warp(startDate);
        if (minted > 0) token.mint(holder, minted, keccak256("fuzz-issue"));
        uint256 supply = uint256(minted) + 1000;
        uint256 moved = bound(uint256(transferred), 0, supply);
        vm.prank(holder);
        token.transfer(recipient, moved);
        uint256 spent = bound(uint256(burned), 0, moved);
        if (spent > 0) token.burn(recipient, spent, keccak256("fuzz-burn"));
        assertEq(token.balanceOf(holder) + token.balanceOf(recipient), token.totalSupply());
        assertEq(token.totalSupply(), supply - spent);
        assertEq(token.expireDate(), expireDate);
        vm.warp(expireDate + 1);
        assertEq(token.availableBalanceOf(holder), 0);
        assertEq(token.availableBalanceOf(recipient), 0);
    }

    function test_ZeroCustomIssuanceAndBurnRejectWithoutLedgerChanges() public {
        vm.warp(startDate);
        vm.expectRevert(IPointToken.InvalidAmount.selector);
        token.mint(holder, 0, keccak256("zero-issue"));
        vm.expectRevert(IPointToken.InvalidAmount.selector);
        token.burn(holder, 0, keccak256("zero-burn"));
        assertEq(token.balanceOf(holder), 1000);
        assertEq(token.totalSupply(), 1000);
    }
}
