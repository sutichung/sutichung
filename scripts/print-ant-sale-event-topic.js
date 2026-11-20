const { ethers } = require("hardhat");

const iface = new ethers.Interface([
  "event AntPurchased(address indexed buyer,uint256 grossUsdt,uint256 feeUsdt,uint256 netUsdt,uint256 antOut,uint256 priceUsdtPerAnt)"
]);
process.stdout.write("ANT_PURCHASED_TOPIC0=" + iface.getEvent("AntPurchased").topicHash + "\n");
