import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address + " - " + formatEther(await account.getBalance()) + " ETH");
  }
});