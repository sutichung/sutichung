// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {MockERC20} from "./MockERC20.sol";

/** @dev Test-only USDT mock that can reject transfers to a selected recipient. */
contract MockFailingERC20 is MockERC20 {
    address public blockedRecipient;
    error BlockedRecipient(address recipient);

    constructor(uint8 decimals_) MockERC20("Mock USDT", "USDT", decimals_) {}

    function setBlockedRecipient(address recipient) external {
        blockedRecipient = recipient;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (to != address(0) && to == blockedRecipient) revert BlockedRecipient(to);
        super._update(from, to, value);
    }
}