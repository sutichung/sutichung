// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract MockAntUsdtOracle {
    uint256 public price;
    uint256 public updatedAt;
    constructor(uint256 initialPrice) { price = initialPrice; updatedAt = block.timestamp; }
    function setPrice(uint256 p) external { price = p; updatedAt = block.timestamp; }
    function setUpdatedAt(uint256 t) external { updatedAt = t; }
    function latestPrice() external view returns (uint256, uint256) { return (price, updatedAt); }
}
