const { ethers, network } = require("hardhat");

function requiredAddress(name) {
  const value = process.env[name];
  if (!value || !ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error("Missing or invalid " + name);
  return ethers.getAddress(value);
}
async function main() {
  if (Number(network.config.chainId) !== 97) throw new Error("Refusing sale deployment: expected BSC Testnet chainId 97.");
  const usdtAddress = requiredAddress("ANT_USDT_CONTRACT");
  const antAddress = requiredAddress("ANT_TOKEN_CONTRACT");
  const oracleAddress = requiredAddress("ANT_ORACLE_CONTRACT");
  const feeWallet = requiredAddress("ANT_FEE_WALLET");
  const treasuryWallet = requiredAddress("ANT_TREASURY_WALLET");
  const decimals = Number(process.env.ANT_USDT_DECIMALS);
  const maxAge = Number(process.env.ANT_MAX_ORACLE_AGE || 3600);
  const saleStartAt = Number(process.env.ANT_SALE_START_AT);
  const saleEndAt = Number(process.env.ANT_SALE_END_AT);
  const hardCapRaw = process.env.ANT_SALE_HARD_CAP_RAW;
  const walletCapRaw = process.env.ANT_SALE_WALLET_CAP_RAW;
  if (!Number.isSafeInteger(saleStartAt) || saleStartAt <= 0 || !Number.isSafeInteger(saleEndAt) || saleEndAt <= saleStartAt) throw new Error("ANT_SALE_START_AT and ANT_SALE_END_AT must be valid Unix timestamps.");
  if (!/^\d{1,78}$/.test(hardCapRaw || "") || BigInt(hardCapRaw) <= 0n || !/^\d{1,78}$/.test(walletCapRaw || "") || BigInt(walletCapRaw) <= 0n || BigInt(walletCapRaw) > BigInt(hardCapRaw)) throw new Error("ANT_SALE_HARD_CAP_RAW and ANT_SALE_WALLET_CAP_RAW must be valid raw USDT amounts, with wallet cap <= hard cap.");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("ANT_USDT_DECIMALS must be verified and between 0 and 18.");
  if (!Number.isSafeInteger(maxAge) || maxAge < 60) throw new Error("ANT_MAX_ORACLE_AGE must be at least 60 seconds.");
  if (feeWallet.toLowerCase() === treasuryWallet.toLowerCase()) throw new Error("Fee and treasury recipients must be separate Safe wallets.");
  const provider = ethers.provider;
  const safeAbi = ["function getThreshold() view returns(uint256)", "function getOwners() view returns(address[])"];
  for (const [label, wallet] of [["ANT_FEE_WALLET", feeWallet], ["ANT_TREASURY_WALLET", treasuryWallet]]) {
    if (await provider.getCode(wallet) === "0x") throw new Error(label + " must be a deployed Safe contract.");
    const safe = new ethers.Contract(wallet, safeAbi, provider);
    const [threshold, owners] = await Promise.all([safe.getThreshold(), safe.getOwners()]);
    if (threshold < 2n || owners.length < 3) throw new Error(label + " must have a Safe threshold of at least 2 with at least 3 owners.");
  }
  const usdt = new ethers.Contract(usdtAddress, ["function decimals() view returns(uint8)"], provider);
  const ant = new ethers.Contract(antAddress, ["function decimals() view returns(uint8)"], provider);
  const oracle = new ethers.Contract(oracleAddress, ["function latestPrice() view returns(uint256,uint256)"], provider);
  const [actualUsdtDecimals, antDecimals, priceData] = await Promise.all([usdt.decimals(), ant.decimals(), oracle.latestPrice()]);
  if (Number(actualUsdtDecimals) !== decimals) throw new Error("USDT decimals mismatch: env=" + decimals + ", on-chain=" + actualUsdtDecimals);
  if (Number(antDecimals) !== 18) throw new Error("ANT token must have 18 decimals.");
  if (priceData[0] <= 0n || priceData[1] > BigInt(Math.floor(Date.now()/1000)) ||
      BigInt(Math.floor(Date.now()/1000)) - priceData[1] > BigInt(maxAge)) throw new Error("Oracle is zero, future-dated or stale; refusing deployment.");
  const Sale = await ethers.getContractFactory("AntColonySale");
  const sale = await Sale.deploy(usdtAddress, antAddress, oracleAddress, feeWallet, treasuryWallet, maxAge, saleStartAt, saleEndAt, hardCapRaw, walletCapRaw);
  await sale.waitForDeployment();
  const address = await sale.getAddress();
  const antToken = new ethers.Contract(antAddress, ["function balanceOf(address) view returns(uint256)"], provider);
  const saleInventory = await antToken.balanceOf(address);
  const [onchainUsdt,onchainAnt,onchainFee,onchainTreasury] = await Promise.all([
    sale.usdt(),sale.ant(),sale.feeRecipient(),sale.proceedsRecipient()
  ]);
  if ([onchainUsdt,onchainAnt,onchainFee,onchainTreasury].some((x,i)=>x.toLowerCase()!==[usdtAddress,antAddress,feeWallet,treasuryWallet][i].toLowerCase())) {
    throw new Error("Post-deployment immutable configuration verification failed.");
  }
  console.log(JSON.stringify({
    network:network.name,chainId:97,sale:address,usdt:usdtAddress,usdtDecimals:decimals,
    ant:antAddress,oracle:oracleAddress,feeWallet,treasuryWallet,maxOracleAge:maxAge,saleStartAt,saleEndAt,hardCapRaw,walletCapRaw,
    feeBps:(await sale.FEE_BPS()).toString(),
    saleInventoryRaw:saleInventory.toString(),
    activationStatus:saleInventory > 0n ? "inventory funded; verify API status and test a purchase" : "disabled until the Safe funds ANT inventory",
    warning:"This is a testnet deployment only. Do not use mock oracle or mock stablecoin for production."
  },null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
