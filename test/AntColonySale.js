const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AntColonySale", function () {
async function saleConfig(usdt, overrides = {}) {
    const block = await ethers.provider.getBlock("latest");
    const decimals = await usdt.decimals();
    return [
      3600,
      overrides.start ?? block.timestamp - 1,
      overrides.end ?? block.timestamp + 86400,
      overrides.hardCap ?? ethers.parseUnits("1000", decimals),
      overrides.walletCap ?? ethers.parseUnits("200", decimals)
    ];
  }


  async function setup(usdtDecimals = 18, saleOverrides = {}) {
    const [admin, buyer, proceeds, fee] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const usdt = await Mock.deploy("Mock USDT", "USDT", usdtDecimals);
    const ant = await Mock.deploy("Ant Colony", "ANT", 18);
    const Oracle = await ethers.getContractFactory("MockAntUsdtOracle");
    const oracle = await Oracle.deploy(10n ** 8n); // 1 USDT per ANT
    const Sale = await ethers.getContractFactory("AntColonySale");
    const sale = await Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt, saleOverrides));
    await ant.mint(await sale.getAddress(), ethers.parseUnits("100000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("1000", usdtDecimals));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    return { admin, buyer, proceeds, fee, usdt, ant, oracle, sale };
  }


  it("rejects EOAs as token or oracle dependencies", async function () {
    const [admin, , proceeds, fee] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const usdt = await Mock.deploy("Mock USDT", "USDT", 6);
    const ant = await Mock.deploy("Ant Colony", "ANT", 18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const Sale = await ethers.getContractFactory("AntColonySale");

    await expect(Sale.deploy(admin.address, await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "InvalidAddress");
    await expect(Sale.deploy(await usdt.getAddress(), admin.address, await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "InvalidAddress");
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), admin.address, fee.address, proceeds.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "InvalidAddress");
  });

  it("rejects proceeds or fee recipients that alias a sale dependency", async function () {
    const [, , proceeds, fee] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const usdt = await Mock.deploy("Mock USDT", "USDT", 6);
    const ant = await Mock.deploy("Ant Colony", "ANT", 18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const Sale = await ethers.getContractFactory("AntColonySale");

    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), await usdt.getAddress(), proceeds.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "RecipientCollision");
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, await ant.getAddress(), ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "RecipientCollision");
  });

  it("rejects non-18-decimal ANT and colliding fee/treasury recipients", async function () {
    const [, , proceeds, fee] = await ethers.getSigners();
    const Mock = await ethers.getContractFactory("MockERC20");
    const usdt = await Mock.deploy("Mock USDT", "USDT", 6);
    const wrongAnt = await Mock.deploy("Wrong ANT", "WANT", 6);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const Sale = await ethers.getContractFactory("AntColonySale");
    await expect(Sale.deploy(await usdt.getAddress(), await wrongAnt.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "InvalidAntDecimals");
    const ant = await Mock.deploy("Ant Colony", "ANT", 18);
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, fee.address, ...await saleConfig(usdt)))
      .to.be.revertedWithCustomError(Sale, "RecipientCollision");
  });

  it("splits 100 USDT into 5 fee and 95 proceeds, delivering 95 ANT at $1", async function () {
    const { buyer, proceeds, fee, usdt, ant, sale } = await setup();
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), ethers.parseUnits("95", 18), ethers.MaxUint256)).to.emit(sale, "AntPurchased");
    expect(await usdt.balanceOf(fee.address)).to.equal(ethers.parseUnits("5", 18));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(ethers.parseUnits("95", 18));
    expect(await ant.balanceOf(buyer.address)).to.equal(ethers.parseUnits("95", 18));
  });

  it("supports six-decimal USDT without mispricing ANT output", async function () {
    const { buyer, proceeds, fee, usdt, ant, sale } = await setup(6);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), ethers.parseUnits("95", 18), ethers.MaxUint256)).to.emit(sale, "AntPurchased");
    expect(await usdt.balanceOf(fee.address)).to.equal(ethers.parseUnits("5", 6));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(ethers.parseUnits("95", 6));
    expect(await ant.balanceOf(buyer.address)).to.equal(ethers.parseUnits("95", 18));
  });

  it("rejects a payment whose calculated ANT output rounds to zero", async function () {
    const { sale, oracle } = await setup(6);
    await oracle.setPrice(10n ** 30n); // extreme price forces the ANT wei result to round down to zero
    await expect(sale.quote(20n)).to.be.revertedWithCustomError(sale, "ZeroAntOutput");
  });

  it("allows the smallest payment whose rounded 5% fee is nonzero", async function () {
    const { sale } = await setup();
    const [out, fee, net] = await sale.quote(20n);
    expect(fee).to.equal(1n);
    expect(net).to.equal(19n);
    expect(out).to.equal(19n);
  });

  it("enforces the immutable per-wallet and global hard caps", async function () {
    const { admin, buyer, usdt, sale } = await setup(6, {
      hardCap: ethers.parseUnits("150", 6),
      walletCap: ethers.parseUnits("120", 6)
    });
    await sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0, ethers.MaxUint256);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("21", 6), 0, ethers.MaxUint256))
      .to.be.revertedWithCustomError(sale, "WalletCapExceeded");

    const secondBuyer = ethers.Wallet.createRandom().connect(ethers.provider);
    await admin.sendTransaction({ to: secondBuyer.address, value: ethers.parseEther("1") });
    await usdt.mint(secondBuyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(secondBuyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await expect(sale.connect(secondBuyer).buy(ethers.parseUnits("51", 6), 0, ethers.MaxUint256))
      .to.be.revertedWithCustomError(sale, "HardCapExceeded");
    expect(await sale.totalGrossSold()).to.equal(ethers.parseUnits("100", 6));
    expect(await sale.walletGrossPurchased(buyer.address)).to.equal(ethers.parseUnits("100", 6));
  });

  it("rejects invalid immutable sale windows and caps at deployment", async function () {
    const { usdt, ant, oracle, fee, proceeds } = await setup(6);
    const Sale = await ethers.getContractFactory("AntColonySale");
    const [maxAge, start, end, hardCap, walletCap] = await saleConfig(usdt);
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address,
      maxAge, start, start, hardCap, walletCap)).to.be.revertedWithCustomError(Sale, "InvalidSaleWindow");
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address,
      maxAge, start, end, hardCap, hardCap + 1n)).to.be.revertedWithCustomError(Sale, "InvalidSaleCap");
    await expect(Sale.deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address,
      maxAge, start, end, 0n, 0n)).to.be.revertedWithCustomError(Sale, "InvalidSaleCap");
  });

  it("prevents fee and proceeds recipients from buying against themselves", async function () {
    const { fee, proceeds, sale, usdt } = await setup(6);
    await usdt.mint(fee.address, ethers.parseUnits("100", 6));
    await usdt.connect(fee).approve(await sale.getAddress(), ethers.MaxUint256);
    await expect(sale.connect(fee).buy(ethers.parseUnits("10", 6), 0, ethers.MaxUint256))
      .to.be.revertedWithCustomError(sale, "RecipientCollision");

    await usdt.mint(proceeds.address, ethers.parseUnits("100", 6));
    await usdt.connect(proceeds).approve(await sale.getAddress(), ethers.MaxUint256);
    await expect(sale.connect(proceeds).buy(ethers.parseUnits("10", 6), 0, ethers.MaxUint256))
      .to.be.revertedWithCustomError(sale, "RecipientCollision");
  });

  it("rejects purchases before the start time and after the end time", async function () {
    const future = await setup(6, { start: (await ethers.provider.getBlock("latest")).timestamp + 300 });
    await expect(future.sale.connect(future.buyer).buy(
      ethers.parseUnits("10", 6), 0, ethers.MaxUint256
    )).to.be.revertedWithCustomError(future.sale, "SaleNotStarted");

    const closing = await setup(6);
    const end = Number(await closing.sale.saleEndAt());
    await ethers.provider.send("evm_setNextBlockTimestamp", [end + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(closing.sale.connect(closing.buyer).buy(
      ethers.parseUnits("10", 6), 0, ethers.MaxUint256
    )).to.be.revertedWithCustomError(closing.sale, "SaleEnded");
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
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), ethers.parseUnits("96", 18), ethers.MaxUint256)).to.be.revertedWithCustomError(sale, "SlippageExceeded");
    await (await ethers.getContractAt("MockAntUsdtOracle", await sale.oracle())).setPrice(1); // quote far exceeds the 100,000 ANT inventory
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 18), 0, ethers.MaxUint256)).to.be.revertedWithCustomError(sale, "InsufficientInventory");
  });

  it("rejects a purchase after its on-chain quote deadline", async function () {
    const { buyer, sale } = await setup();
    const latest = await ethers.provider.getBlock("latest");
    const expiredDeadline = latest.timestamp - 1;
    await expect(sale.connect(buyer).buy(
      ethers.parseUnits("10", 18), ethers.parseUnits("9.5", 18), expiredDeadline
    )).to.be.revertedWithCustomError(sale, "QuoteExpired");
  });

  it("rejects zero payment and has immutable fee and recipients", async function () {
    const { sale, fee, proceeds } = await setup();
    await expect(sale.quote(0)).to.be.revertedWithCustomError(sale, "InvalidAmount");
    await expect(sale.quote(19n)).to.be.revertedWithCustomError(sale, "InvalidAmount"); // prevents rounding the 5% fee to zero
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
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt));
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await usdt.setBlockedRecipient(fee.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0, ethers.MaxUint256)).to.be.revertedWithCustomError(usdt, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(proceeds.address)).to.equal(0n);
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
    expect(await sale.totalGrossSold()).to.equal(0n);
    expect(await sale.walletGrossPurchased(buyer.address)).to.equal(0n);
  });

  it("rolls back the fee transfer if the proceeds recipient transfer fails", async function () {
    const [, buyer, proceeds, fee] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockFailingERC20")).deploy(6);
    const ant = await (await ethers.getContractFactory("MockERC20")).deploy("Ant Colony", "ANT", 18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt));
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await usdt.setBlockedRecipient(proceeds.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0, ethers.MaxUint256)).to.be.revertedWithCustomError(usdt, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(fee.address)).to.equal(0n);
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
    expect(await sale.totalGrossSold()).to.equal(0n);
    expect(await sale.walletGrossPurchased(buyer.address)).to.equal(0n);
  });

  it("rolls back both USDT transfers if ANT delivery fails", async function () {
    const [, buyer, proceeds, fee] = await ethers.getSigners();
    const usdt = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDT", "USDT", 6);
    const ant = await (await ethers.getContractFactory("MockFailingERC20")).deploy(18);
    const oracle = await (await ethers.getContractFactory("MockAntUsdtOracle")).deploy(10n ** 8n);
    const sale = await (await ethers.getContractFactory("AntColonySale")).deploy(await usdt.getAddress(), await ant.getAddress(), await oracle.getAddress(), fee.address, proceeds.address, ...await saleConfig(usdt));
    await ant.mint(await sale.getAddress(), ethers.parseUnits("1000", 18));
    await usdt.mint(buyer.address, ethers.parseUnits("100", 6));
    await usdt.connect(buyer).approve(await sale.getAddress(), ethers.MaxUint256);
    await ant.setBlockedRecipient(buyer.address);
    await expect(sale.connect(buyer).buy(ethers.parseUnits("100", 6), 0, ethers.MaxUint256)).to.be.revertedWithCustomError(ant, "BlockedRecipient");
    expect(await usdt.balanceOf(buyer.address)).to.equal(ethers.parseUnits("100", 6));
    expect(await usdt.balanceOf(fee.address)).to.equal(0n);
    expect(await usdt.balanceOf(proceeds.address)).to.equal(0n);
    expect(await ant.balanceOf(await sale.getAddress())).to.equal(ethers.parseUnits("1000", 18));
    expect(await ant.balanceOf(buyer.address)).to.equal(0n);
    expect(await sale.totalGrossSold()).to.equal(0n);
    expect(await sale.walletGrossPurchased(buyer.address)).to.equal(0n);
  });

});
