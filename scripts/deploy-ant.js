const { ethers, network, run } = require("hardhat");

async function main() {
  if (network.config.chainId !== 97) {
    throw new Error(`Refusing deployment: expected BSC testnet chainId 97, got ${network.config.chainId}`);
  }
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY is not configured.");

  // Explicitly opted-in BSC testnet-only path: the deployer EOA may receive
  // the test token supply. The configured address must match the signer.
  // Production/mainnet deployments must use the independently verified Safe path.
  const testnetHolder = process.env.ANT_TESTNET_INITIAL_HOLDER;
  let recipient;
  if (testnetHolder) {
    if (!ethers.isAddress(testnetHolder) || ethers.getAddress(testnetHolder) !== deployer.address) {
      throw new Error("ANT_TESTNET_INITIAL_HOLDER must exactly match the configured deployer address.");
    }
    recipient = deployer.address;
    console.log("TESTNET ONLY: initial supply will be held by the deployer EOA.");
  } else {
    recipient = process.env.ANT_MULTISIG_ADDRESS;
    if (!recipient || !ethers.isAddress(recipient) || recipient === ethers.ZeroAddress) {
      throw new Error("Set ANT_MULTISIG_ADDRESS to the verified BSC testnet Safe/multisig address, or explicitly set ANT_TESTNET_INITIAL_HOLDER to the deployer EOA for testnet only.");
    }
    const safeCode = await ethers.provider.getCode(recipient);
    if (safeCode === "0x") throw new Error("ANT_MULTISIG_ADDRESS has no deployed contract code; verify the BSC testnet Safe address.");
    const safe = new ethers.Contract(recipient, [
      "function getThreshold() view returns(uint256)",
      "function getOwners() view returns(address[])"
    ], ethers.provider);
    const [threshold, owners] = await Promise.all([safe.getThreshold(), safe.getOwners()]);
    if (threshold < 2n || owners.length < 3) throw new Error("ANT initial holder must be a Safe with at least a 2-of-3 signer threshold.");
  }

  console.log("Network:", network.name, "chainId:", network.config.chainId);
  console.log("Deployer:", deployer.address);
  console.log("Initial supply recipient (multisig):", recipient);

  const Token = await ethers.getContractFactory("AntColony");
  const token = await Token.deploy(recipient);
  await token.waitForDeployment();
  const address = await token.getAddress();

  const expected = ethers.parseUnits("200000", 18);
  const [supply, balance] = await Promise.all([
    token.totalSupply(),
    token.balanceOf(recipient)
  ]);
  if (supply !== expected || balance !== expected) {
    throw new Error("Post-deployment supply/recipient balance verification failed.");
  }

  console.log("ANT_CONTRACT_ADDRESS=", address);
  console.log("ANT_MULTISIG_ADDRESS=", recipient);
  console.log("TOTAL_SUPPLY=", supply.toString());
  console.log("DEPLOYMENT_TX=", token.deploymentTransaction().hash);
  console.log("Explorer:", `https://testnet.bscscan.com/address/${address}`);

  if (process.env.BSCSCAN_API_KEY) {
    await run("verify:verify", {
      address,
      constructorArguments: [recipient]
    });
  } else {
    console.log("Source verification skipped: BSCSCAN_API_KEY is not configured.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
