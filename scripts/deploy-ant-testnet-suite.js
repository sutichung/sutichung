const { ethers, network } = require("hardhat");

async function main() {
  if (Number(network.config.chainId) !== 97) {
    throw new Error("Refusing test suite deployment: BSC Testnet chainId 97 is required.");
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY must be configured and funded with test BNB.");
  const feeWallet = process.env.ANT_FEE_WALLET;
  const treasuryWallet = process.env.ANT_TREASURY_WALLET;
  if (![feeWallet, treasuryWallet].every(x => x && ethers.isAddress(x) && x !== ethers.ZeroAddress)) {
    throw new Error("Set ANT_FEE_WALLET and ANT_TREASURY_WALLET to valid testnet recipient addresses.");
  }
  if (feeWallet.toLowerCase() === treasuryWallet.toLowerCase()) throw new Error("Fee and treasury wallets must be separate.");

  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const testUsdt = await MockERC20.deploy("Test USDT - Not a Stablecoin", "tUSDT", 18);
  await testUsdt.waitForDeployment();

  const Ant = await ethers.getContractFactory("AntColony");
  const ant = await Ant.deploy(deployer.address);
  await ant.waitForDeployment();

  const Oracle = await ethers.getContractFactory("MockAntUsdtOracle");
  const oracle = await Oracle.deploy(10n ** 8n);
  await oracle.waitForDeployment();

  const Sale = await ethers.getContractFactory("AntColonySale");
  const sale = await Sale.deploy(
    await testUsdt.getAddress(), await ant.getAddress(), await oracle.getAddress(),
    feeWallet, treasuryWallet, 3600,
    BigInt(Math.floor(Date.now() / 1000) - 60),
    BigInt(Math.floor(Date.now() / 1000) + 86400),
    ethers.parseUnits("1000", 18), ethers.parseUnits("200", 18)
  );
  await sale.waitForDeployment();

  const inventory = ethers.parseUnits("100000", 18);
  await (await ant.transfer(await sale.getAddress(), inventory)).wait();
  await (await testUsdt.mint(deployer.address, ethers.parseUnits("1000", 18))).wait();
  await (await testUsdt.connect(deployer).approve(await sale.getAddress(), ethers.parseUnits("100", 18))).wait();

  const gross = ethers.parseUnits("100", 18);
  const minAnt = ethers.parseUnits("95", 18);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const tx = await sale.connect(deployer).buy(gross, minAnt, deadline);
  const receipt = await tx.wait();

  const [feeBalance, treasuryBalance, buyerAnt, saleInventory] = await Promise.all([
    testUsdt.balanceOf(feeWallet), testUsdt.balanceOf(treasuryWallet),
    ant.balanceOf(deployer.address), ant.balanceOf(await sale.getAddress())
  ]);
  if (feeBalance !== ethers.parseUnits("5", 18) ||
      treasuryBalance !== ethers.parseUnits("95", 18) ||
      buyerAnt !== ethers.parseUnits("95", 18) ||
      saleInventory !== inventory - buyerAnt) {
    throw new Error("End-to-end balance reconciliation failed.");
  }

  console.log(JSON.stringify({
    network: network.name, chainId: 97, testOnly: true,
    warning: "tUSDT is a freely mintable mock token, not USDT and has no real value.",
    ant: await ant.getAddress(), testUsdt: await testUsdt.getAddress(),
    oracle: await oracle.getAddress(), sale: await sale.getAddress(),
    feeWallet, treasuryWallet,
    saleStartAt: Number(await sale.saleStartAt()), saleEndAt: Number(await sale.saleEndAt()),
    hardCapRaw: (await sale.maxGrossUsdt()).toString(), walletCapRaw: (await sale.maxWalletGrossUsdt()).toString(),
    buyer: deployer.address, purchaseTx: receipt.hash,
    grossUsdtRaw: gross.toString(), feeUsdtRaw: ethers.parseUnits("5",18).toString(),
    netUsdtRaw: ethers.parseUnits("95",18).toString(), antDeliveredRaw: buyerAnt.toString(),
    remainingAntInventoryRaw: saleInventory.toString()
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
