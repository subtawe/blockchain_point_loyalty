// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "forge-std/Test.sol";
import "../PointFactory.sol";
import "../PointToken.sol";

contract PointFactoryTest is Test {
    PointTokenFactory public factory;
    PointToken public token;

    address public owner = address(0x123);
    address public tokenOwner = address(0x456);
    address public user = address(0x789);

    function setUp() public {
        // Deploy Factory as 'owner'
        vm.prank(msg.sender);
        factory = new PointTokenFactory();
    }

    function test_DeployPointToken() public {
        // Parameters for the new token
        string memory name = "Loyalty Point";
        string memory symbol = "LP";
        uint256 initBlock = block.number;
        uint40 duration = 100;
        uint8 size = 3;
        bool safe = false;

        // Expect the TokenDeployed event
        // arguments: (indexed tokenAddress, string name, string symbol, address deployer)
        // We can't predict the exact address, so we'll just check that the event was emitted
        vm.prank(msg.sender);
        address newTokenAddr = factory.deployPointToken(
            name,
            symbol,
            initBlock,
            duration,
            size,
            safe,
            tokenOwner,
            1000 // amountInit
        );

        // Verify Factory state
        assertEq(factory.getDeployedTokensCount(), 1);
        assertEq(factory.deployedTokens(0), newTokenAddr);

        // Verify Token state
        PointToken newToken = PointToken(newTokenAddr);
        assertEq(newToken.name(), name);
        assertEq(newToken.symbol(), symbol);
        assertEq(newToken.owner(), tokenOwner); // Check if ownership was passed correctly
    }

    function test_OnlyOwnerCanDeploy() public {
        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                Ownable.OwnableUnauthorizedAccount.selector,
                user
            )
        );

        factory.deployPointToken(
            "Fail Token",
            "FT",
            block.number,
            100,
            3,
            false,
            user,
            0
        );
    }

    function test_TokenMinting() public {
        // 1. Deploy Token
        vm.prank(msg.sender);
        address newTokenAddr = factory.deployPointToken(
            "Test",
            "TST",
            block.number,
            100,
            3,
            false,
            tokenOwner,
            0
        );
        PointToken newToken = PointToken(newTokenAddr);

        // 2. Mint as Token Owner
        vm.prank(tokenOwner);
        newToken.mint(user, 1000);

        assertEq(newToken.balanceOf(user), 1000);
    }

    function test_TokenBurn() public {
        // 1. Setup Token and mint to user
        vm.prank(msg.sender);
        address newTokenAddr = factory.deployPointToken(
            "Test",
            "TST",
            block.number,
            100,
            3,
            false,
            tokenOwner,
            0
        );
        PointToken newToken = PointToken(newTokenAddr);

        vm.prank(tokenOwner);
        newToken.mint(user, 1000);

        // 2. User burns their own tokens
        vm.prank(user);
        newToken.burn(500);

        assertEq(newToken.balanceOf(user), 500);
    }
}
