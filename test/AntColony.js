const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AntColony", function () {
  async function deploy() {
    const [deployer, holder, spender] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("AntColony");
    const token = await Token.deploy(holder.address);
    await token.waitForDeployment();
    return { token, deployer, holder, spender };
  }

  it("sets metadata and mints exactly 200,000 ANT to the multisig recipient", async function () {
    const { token, holder } = await deploy();
    const supply = ethers.parseUnits("200000", 18);
    expect(await token.name()).to.equal("Ant Colony");
    expect(await token.symbol()).to.equal("ANT");
    expect(await token.decimals()).to.equal(18);
    expect(await token.totalSupply()).to.equal(supply);
    expect(await token.balanceOf(holder.address)).to.equal(supply);
  });

  it("rejects a zero initial holder", async function () {
    const Token = await ethers.getContractFactory("AntColony");
    await expect(Token.deploy(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(Token, "ZeroInitialHolder");
  });

  it("allows ordinary transfers", async function () {
    const { token, holder, spender } = await deploy();
    await token.connect(holder).transfer(spender.address, ethers.parseUnits("25", 18));
    expect(await token.balanceOf(spender.address)).to.equal(ethers.parseUnits("25", 18));
  });

  it("allows holders to burn and reduces total supply", async function () {
    const { token, holder } = await deploy();
    await token.connect(holder).burn(ethers.parseUnits("100", 18));
    expect(await token.totalSupply()).to.equal(ethers.parseUnits("199900", 18));
    expect(await token.balanceOf(holder.address)).to.equal(ethers.parseUnits("199900", 18));
  });

  it("requires allowance for burnFrom", async function () {
    const { token, holder, spender } = await deploy();
    await expect(token.connect(spender).burnFrom(holder.address, 1n)).to.be.reverted;
    await token.connect(holder).approve(spender.address, 1n);
    await token.connect(spender).burnFrom(holder.address, 1n);
    expect(await token.totalSupply()).to.equal(ethers.parseUnits("200000", 18) - 1n);
  });

  it("rejects transfers exceeding the sender balance", async function () {
    const { token, deployer, spender } = await deploy();
    await expect(token.connect(deployer).transfer(spender.address, 1n)).to.be.reverted;
  });

  it("exposes no privileged mint or owner controls", async function () {
    const { token } = await deploy();
    expect(token.interface.hasFunction("mint")).to.equal(false);
    expect(token.interface.hasFunction("owner")).to.equal(false);
    expect(token.interface.hasFunction("pause")).to.equal(false);
    expect(token.interface.hasFunction("blacklist")).to.equal(false);
  });
});
