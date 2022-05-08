import { ethers } from "hardhat";

async function main() {
  const BaseToken1155 = await ethers.getContractFactory("BaseToken1155");
  const baseToken1155 = await BaseToken1155.deploy();

  await baseToken1155.deployed();

  console.log("BaseToken1155 deployed to:", baseToken1155.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
