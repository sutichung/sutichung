const { ethers, network } = require("hardhat");

async function main() {
  if (Number(network.config.chainId) !== 97) {
    throw new Error("Refusing test suite deployment: BSC Testnet chainId 97 is required.");
  }
  const [deployer, buyer, feeWallet, treasuryWallet] = await ethers.getSigners();
  if (!deployer || !buyer || !feeWallet || !treasuryWallet) throw new Error("Four funded BSC testnet signers are required.");

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
    feeWallet.address, treasuryWallet.address, 3600
  );
  await sale.waitForDeployment();

  const inventory = ethers.parseUnits("100000", 18);
  await (await ant.transfer(await sale.getAddress(), inventory)).wait();
  await (await testUsdt.mint(buyer.address, ethers.parseUnits("1000", 18))).wait();
  await (await testUsdt.connect(buyer).approve(await sale.getAddress(), ethers.parseUnits("100", 18))).wait();

  const gross = ethers.parseUnits("100", 18);
  const minAnt = ethers.parseUnits("95", 18);
  const tx = await sale.connect(buyer).buy(gross, minAnt);
  const receipt = await tx.wait();

  const [feeBalance, treasuryBalance, buyerAnt, saleInventory] = await Promise.all([
    testUsdt.balanceOf(feeWallet.address), testUsdt.balanceOf(treasuryWallet.address),
    ant.balanceOf(buyer.address), ant.balanceOf(await sale.getAddress())
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
    feeWallet: feeWallet.address, treasuryWallet: treasuryWallet.address,
    buyer: buyer.address, purchaseTx: receipt.hash,
    grossUsdtRaw: gross.toString(), feeUsdtRaw: ethers.parseUnits("5",18).toString(),
    netUsdtRaw: ethers.parseUnits("95",18).toString(), antDeliveredRaw: buyerAnt.toString(),
    remainingAntInventoryRaw: saleInventory.toString()
  }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
