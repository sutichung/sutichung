// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/// @title Ant Colony (ANT)
/// @notice Fixed initial supply token. Holders may burn their own tokens.
/// @dev No owner, mint, pause, blacklist, transfer tax, or privileged controls.
contract AntColony is ERC20, ERC20Burnable {
    uint256 public constant INITIAL_SUPPLY = 200_000 * 10 ** 18;

    error ZeroInitialHolder();

    constructor(address initialHolder) ERC20("Ant Colony", "ANT") {
        if (initialHolder == address(0)) revert ZeroInitialHolder();
        _mint(initialHolder, INITIAL_SUPPLY);
    }
}
