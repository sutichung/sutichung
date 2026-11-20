const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AntColonySale", function () {
  async function setup(usdtDecimals = 18) {
    const [admin, buyer, proceeds, fee] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const usdt = await Mock.deploy("Mock USDT", "USDT", usdtDecimals);
    const ant = await Mock.deploy("Ant Colony", "ANT", 18);
    const Oracle = await ethers.getContractFactory("MockAntUsdtOracle");
    const oracle = await Oracle.deploy(10n ** 8n); // 1 USDT per ANT
    const Sale = await ethers.getContractFactory("AntColonySale");
    const sale = await Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, 3600);
    await ant.mint(await sale.getAddress(), ethers.parseUnits("100000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("1000", usdtDecimals));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    return { admin, buyer, proceeds, fee, usdt, ant, oracle, sale };
  }

  it("splits 100 USDT into 5 fee and 95 proceeds, delivering 95 ANT at $1", async function () {
    const { buyer, proceeds, fee, usdt, ant, sale } = await setup();
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), ethers.parseUnits("95", 18))).to.emit(sale, "AntPurchased");
    expect(await usdt.balanceOf(fee.address)).to.equal(ethers.parseUnits("5", 18));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(ethers.parseUnits("95", 18));
    expect(await ant.balanceOf(buyer.address)).to.equal(ethers.parseUnits("95", 18));
  });

  it("supports six-decimal USDT without mispricing ANT output", async function () {
    const { buyer, proceeds, fee, usdt, ant, sale } = await setup(6);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), ethers.parseUnits("95", 18))).to.emit(sale, "AntPurchased");
    expect(await usdt.balanceOf(fee.address)).to.equal(ethers.parseUnits("5", 6));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(ethers.parseUnits("95", 6));
    expect(await ant.balanceOf(buyer.address)).to.equal(ethers.parseUnits("95", 18));
  });

  it("rejects a payment whose calculated ANT output rounds to zero", async function () {
    const { sale, oracle } = await setup(6);
    await oracle.setPrice(10n ** 30n); // extreme price forces the ANT wei result to round down to zero
    await expect(sale.quote(1n)).to.be.revertedWithCustomError(sale, "ZeroAntOutput");
  });

  it("quotes using updated market oracle price", async function () {
    const { oracle, sale } = await setup();
    await oracle.setPrice(2n * 10n ** 8n);
    const [out, fee] = await sale.quote(ethers.parseUnits("100", 18));
    expect(fee).to.equal(ethers.parseUnits("5", 18));
    expect(out).to.equal(ethers.parseUnits("47.5", 18));
  });

  it("rejects stale, zero and future oracle observations", async function () {
    const { sale, oracle } = await setup();
    await oracle.setUpdatedAt(1);
    await expect(sale.quote(ethers.parseUnits("10", 18))).to.be.revertedWithCustomError(sale, "StalePrice");
    await oracle.setPrice(0);
    await expect(sale.quote(ethers.parseUnits("10", 18))).to.be.revertedWithCustomError(sale, "InvalidPrice");
    await oracle.setPrice(10n ** 8n);
    const now = (await ethers.provider.getBlock("latest")).timestamp;
    await oracle.setUpdatedAt(now + 1000);
    await expect(sale.quote(ethers.parseUnits("10", 18))).to.be.revertedWithCustomError(sale, "InvalidPrice");
  });

  it("enforces minimum output and inventory", async function () {
    const { buyer, sale, ant } = await setup();
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), ethers.parseUnits("96", 18))).to.be.revertedWithCustomError(sale, "SlippageExceeded");
    await (await ethers.getContractAt("MockAntUsdtOracle", await sale.oracle())).setPrice(1); // quote far exceeds the 100,000 ANT inventory
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), 0)).to.be.revertedWithCustomError(sale, "InsufficientInventory");
  });

  it("rejects zero payment and has immutable fee and recipients", async function () {
    const { sale, fee, proceeds } = await setup();
    await expect(sale.quote(0)).to.be.revertedWithCustomError(sale, "InvalidAmount");
    expect(await sale.FEE_BPS()).to.equal(500);
    expect(await sale.feeRecipient()).to.equal(fee.address);
    expect(await sale.proceedsRecipient()).to.equal(proceeds.address);
    expect(sale.interface.hasFunction("owner")).to.equal(false);
    expect(sale.interface.hasFunction("setFee")).to.equal(false);
    expect(sale.interface.hasFunction("setOracle")).to.equal(false);
  });

  it("rolls back the entire purchase if the fee recipient transfer fails", async function () {
    const [, buyer, proceeds, fee] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockFailingERC20")).deploy(6);
    const ant = await (await ethers.getContractFactory("MockERC20")).deploy("Ant Colony", "ANT", 18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, 3600);
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await usdt.setBlockedRecipient(fee.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0)).to.be.revertedWithCustomError(usdt, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(0n);
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
  });

  it("rolls back the fee transfer if the proceeds recipient transfer fails", async function () {
    const [, buyer, proceeds, fee] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockFailingERC20")).deploy(6);
    const ant = await (await ethers.getContractFactory("MockERC20")).deploy("Ant Colony", "ANT", 18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, 3600);
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await usdt.setBlockedRecipient(proceeds.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0)).to.be.revertedWithCustomError(usdt, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(fee.address)).to.equal(0n);
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
  });

  it("rolls back both USDT transfers if ANT delivery fails", async function () {
    const [, buyer, proceeds, fee] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDT", "USDT", 6);
    const ant = await (await ethers.getContractFactory("MockFailingERC20")).deploy(18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, 3600);
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await ant.setBlockedRecipient(buyer.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0)).to.be.revertedWithCustomError(ant, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(fee.address)).to.equal(0n);
    expect(await usdt.balanceOf(proceeds.address)).to.equal(0n);
    expect(await ant.balanceOf(await sale.getAddress())).to.equal(ethers.parseUnits("1000", 18));
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
  });

});
