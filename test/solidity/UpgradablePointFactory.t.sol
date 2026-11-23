// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../../contracts/UpgradablePointFactory.sol";
import "./helpers/UpgradablePointFactoryV2.sol";
import {IPointToken} from "../../contracts/interfaces/IPointToken.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract UpgradablePointFactoryTest is Test {
    UpgradablePointFactory public factory;
    UpgradablePointFactory public implementation;
    ERC1967Proxy public proxy;

    address public owner;
    address public user1 = address(0x123);

    function setUp() public {
        vm.warp(1_700_000_000);
        owner = address(this);

        implementation = new UpgradablePointFactory();

        bytes memory initData = abi.encodeWithSelector(
            UpgradablePointFactory.initialize.selector
        );

        proxy = new ERC1967Proxy(address(implementation), initData);

        factory = UpgradablePointFactory(address(proxy));
    }

    function test_Initialization() public view {
        assertEq(factory.owner(), owner);
        assertEq(factory.pointTokenVersion(), 3);
        assertEq(factory.getDeployedTokensCount(), 0);
    }

    function test_DeployPointToken() public {
        address newToken = factory.deployPointToken("Test", "TST");
        assertEq(factory.getDeployedTokensCount(), 1);
        assertEq(factory.deployedTokens(0), newToken);
        PointToken token = PointToken(newToken);
        assertEq(token.owner(), owner);
        assertEq(uint256(token.state()), uint256(IPointToken.State.Draft));
        assertEq(token.totalSupply(), 0);
        assertEq(token.balanceOf(owner), 0);
    }

    function test_Upgrade() public {
        PointToken token = PointToken(factory.deployPointToken("First", "ONE"));
        uint256 start = block.timestamp;
        uint256 expiry = start + 1 days;
        token.configureBusiness(IPointToken.Business.A, abi.encode(start, expiry));
        token.mint(user1, 1000, keccak256("upgrade-issue"));
        bytes32 originalCodeHash = address(token).codehash;
        UpgradablePointFactoryV2 implementationV2 = new UpgradablePointFactoryV2();

        factory.upgradeToAndCall(address(implementationV2), "");

        UpgradablePointFactoryV2 factoryV2 = UpgradablePointFactoryV2(
            address(proxy)
        );
        assertEq(factoryV2.version(), "v2");

        assertEq(factoryV2.owner(), owner);
        assertEq(factoryV2.pointTokenVersion(), 3);
        assertEq(factoryV2.getDeployedTokensCount(), 1);
        assertEq(factoryV2.deployedTokens(0), address(token));
        assertEq(address(token).codehash, originalCodeHash);
        assertEq(token.owner(), owner);
        assertEq(token.startDate(), start);
        assertEq(token.expireDate(), expiry);
        assertEq(token.balanceOf(user1), 1000);
        PointToken second = PointToken(factoryV2.deployPointToken("Second", "TWO"));
        assertEq(factoryV2.getDeployedTokensCount(), 2);
        assertEq(factoryV2.deployedTokens(0), address(token));
        assertEq(uint256(second.state()), uint256(IPointToken.State.Draft));
        assertEq(second.totalSupply(), 0);
    }

    function test_RevertUpgradeUnauthorized() public {
        UpgradablePointFactoryV2 implementationV2 = new UpgradablePointFactoryV2();

        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                OwnableUpgradeable.OwnableUnauthorizedAccount.selector,
                user1
            )
        );
        factory.upgradeToAndCall(address(implementationV2), "");
    }

    function test_InitializationIsOneTimeAndImplementationLocked() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        factory.initialize();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        implementation.initialize();
        assertEq(implementation.owner(), address(0));
        assertEq(factory.owner(), owner);
    }

    function test_UnauthorizedDeployDoesNotChangeRegistry() public {
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, user1));
        vm.prank(user1);
        factory.deployPointToken("Denied", "NO");
        assertEq(factory.getDeployedTokensCount(), 0);
    }

    function test_ConfigurationFailurePreservesDraftRegistryAndSupply() public {
        PointToken token = PointToken(factory.deployPointToken("Draft", "DFT"));
        vm.expectRevert(IPointToken.InvalidDateRange.selector);
        token.configureBusiness(IPointToken.Business.A, abi.encode(block.timestamp, block.timestamp));
        assertEq(factory.getDeployedTokensCount(), 1);
        assertEq(factory.deployedTokens(0), address(token));
        assertEq(uint256(token.state()), uint256(IPointToken.State.Draft));
        assertEq(token.startDate(), 0);
        assertEq(token.expireDate(), 0);
        assertEq(token.totalSupply(), 0);
        token.configureBusiness(IPointToken.Business.A, abi.encode(block.timestamp, block.timestamp + 1 days));
        assertEq(uint256(token.state()), uint256(IPointToken.State.Configured));
    }
}
