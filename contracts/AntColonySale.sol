// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

interface IAntUsdtPriceOracle {
    function latestPrice() external view returns (uint256 price, uint256 updatedAt);
}

/// @notice Fixed 5% USDT fee sale. Oracle price is USDT per ANT, 8 decimals.
contract AntColonySale is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant FEE_BPS = 500;
    uint256 private constant BPS = 10_000;
    uint256 private constant PRICE_SCALE = 1e8;
    uint256 private constant ANT_SCALE = 1e18;

    IERC20 public immutable usdt;
    IERC20 public immutable ant;
    IAntUsdtPriceOracle public immutable oracle;
    address public immutable feeRecipient;
    address public immutable proceedsRecipient;
    uint8 public immutable usdtDecimals;
    uint256 public immutable maxOracleAge;
    uint256 public immutable saleStartAt;
    uint256 public immutable saleEndAt;
    uint256 public immutable maxGrossUsdt;
    uint256 public immutable maxWalletGrossUsdt;
    uint256 public totalGrossSold;
    mapping(address => uint256) public walletGrossPurchased;

    error InvalidAddress();
    error InvalidOracleAge();
    error InvalidUsdtDecimals();
    error InvalidAntDecimals();
    error RecipientCollision();
    error InvalidPrice();
    error StalePrice();
    error InvalidAmount();
    error QuoteExpired();
    error ZeroAntOutput();
    error SlippageExceeded(uint256 actual, uint256 minimum);
    error InsufficientInventory(uint256 available, uint256 required);
    error InvalidSaleWindow();
    error InvalidSaleCap();
    error SaleNotStarted();
    error SaleEnded();
    error HardCapExceeded(uint256 sold, uint256 requested, uint256 cap);
    error WalletCapExceeded(uint256 purchased, uint256 requested, uint256 cap);

    event AntPurchased(address indexed buyer, uint256 grossUsdt, uint256 feeUsdt, uint256 netUsdt, uint256 antOut, uint256 priceUsdtPerAnt);

    constructor(address usdt_, address ant_, address oracle_, address feeRecipient_, address proceedsRecipient_, uint256 maxOracleAge_, uint256 saleStartAt_, uint256 saleEndAt_, uint256 maxGrossUsdt_, uint256 maxWalletGrossUsdt_) {
        if (usdt_ == address(0) || ant_ == address(0) || oracle_ == address(0) || feeRecipient_ == address(0) || proceedsRecipient_ == address(0) || usdt_ == ant_) revert InvalidAddress();
        // ERC-20 and oracle dependencies must be deployed contracts, not EOAs.
        // This catches common address/configuration mistakes at deployment time.
        if (usdt_.code.length == 0 || ant_.code.length == 0 || oracle_.code.length == 0) revert InvalidAddress();
        if (feeRecipient_ == proceedsRecipient_ || feeRecipient_ == usdt_ || feeRecipient_ == ant_ || feeRecipient_ == oracle_ || proceedsRecipient_ == usdt_ || proceedsRecipient_ == ant_ || proceedsRecipient_ == oracle_) revert RecipientCollision();
        if (maxOracleAge_ == 0) revert InvalidOracleAge();
        if (saleStartAt_ == 0 || saleEndAt_ <= saleStartAt_ || saleEndAt_ <= block.timestamp) revert InvalidSaleWindow();
        if (maxGrossUsdt_ == 0 || maxWalletGrossUsdt_ == 0 || maxWalletGrossUsdt_ > maxGrossUsdt_) revert InvalidSaleCap();
        uint8 d = IERC20Metadata(usdt_).decimals();
        if (d > 18) revert InvalidUsdtDecimals();
        if (IERC20Metadata(ant_).decimals() != 18) revert InvalidAntDecimals();
        usdt = IERC20(usdt_);
        ant = IERC20(ant_);
        oracle = IAntUsdtPriceOracle(oracle_);
        feeRecipient = feeRecipient_;
        proceedsRecipient = proceedsRecipient_;
        usdtDecimals = d;
        maxOracleAge = maxOracleAge_;
        saleStartAt = saleStartAt_;
        saleEndAt = saleEndAt_;
        maxGrossUsdt = maxGrossUsdt_;
        maxWalletGrossUsdt = maxWalletGrossUsdt_;
    }

    function quote(uint256 grossUsdt) public view returns (uint256 antOut, uint256 feeUsdt, uint256 netUsdt, uint256 price) {
        if (grossUsdt == 0) revert InvalidAmount();
        if (totalGrossSold + grossUsdt > maxGrossUsdt) revert HardCapExceeded(totalGrossSold, grossUsdt, maxGrossUsdt);
        uint256 updatedAt;
        (price, updatedAt) = oracle.latestPrice();
        if (price == 0 || updatedAt > block.timestamp || price > type(uint256).max / (10 ** usdtDecimals)) revert InvalidPrice();
        if (block.timestamp - updatedAt > maxOracleAge) revert StalePrice();
        feeUsdt = Math.mulDiv(grossUsdt, FEE_BPS, BPS);
        if (feeUsdt == 0) revert InvalidAmount();
        netUsdt = grossUsdt - feeUsdt;
        antOut = Math.mulDiv(netUsdt, ANT_SCALE * PRICE_SCALE, price * (10 ** usdtDecimals));
        if (antOut == 0) revert ZeroAntOutput();
    }

    function buy(uint256 grossUsdt, uint256 minAntOut, uint256 deadline) external nonReentrant returns (uint256 antOut) {
        if (block.timestamp > deadline) revert QuoteExpired();
        if (block.timestamp < saleStartAt) revert SaleNotStarted();
        if (block.timestamp > saleEndAt) revert SaleEnded();
        if (msg.sender == feeRecipient || msg.sender == proceedsRecipient) revert RecipientCollision();
        uint256 purchased = walletGrossPurchased[msg.sender];
        if (purchased + grossUsdt > maxWalletGrossUsdt) revert WalletCapExceeded(purchased, grossUsdt, maxWalletGrossUsdt);
        uint256 feeUsdt;
        uint256 netUsdt;
        uint256 price;
        (antOut, feeUsdt, netUsdt, price) = quote(grossUsdt);
        if (antOut < minAntOut) revert SlippageExceeded(antOut, minAntOut);
        totalGrossSold += grossUsdt;
        walletGrossPurchased[msg.sender] = purchased + grossUsdt;
        uint256 inventory = ant.balanceOf(address(this));
        if (inventory < antOut) revert InsufficientInventory(inventory, antOut);
        usdt.safeTransferFrom(msg.sender, feeRecipient, feeUsdt);
        usdt.safeTransferFrom(msg.sender, proceedsRecipient, netUsdt);
        ant.safeTransfer(msg.sender, antOut);
        emit AntPurchased(msg.sender, grossUsdt, feeUsdt, netUsdt, antOut, price);
    }
}
