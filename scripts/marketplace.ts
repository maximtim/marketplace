import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();


async function main() {
  const Marketplace = await ethers.getContractFactory("Marketplace");
  const marketplace = await Marketplace.deploy(process.env.BASETOKEN_ADDRESS ?? "", process.env.CURRENCYTOKEN_ADDRESS ?? "");

  await marketplace.deployed();

  console.log("Marketplace deployed to:", marketplace.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
