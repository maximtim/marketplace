import { constants } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { BaseToken1155, Marketplace } from "../typechain";
import { delay } from "./lib";

task("mp-create-fung", "Create new fungible token on marketplace")
    .addParam("uri", "Metadata URI")
    .addParam("owner", "Owner of minted tokens")
    .addParam("amount", "Supply amount of token")
    .setAction(async ({uri, owner, amount}, hre) => {
        const mplace = await hre.ethers.getContractAt("Marketplace", process.env.MARKETPLACE_ADDRESS ?? "") as unknown as Marketplace;
        const baseToken = await hre.ethers.getContractAt("BaseToken1155", process.env.BASETOKEN_ADDRESS ?? "") as unknown as BaseToken1155;

        await mplace.callStatic.createItem(uri, owner, amount);
        console.log("Callstatic success");
        

        const filterTranfer = baseToken.filters.TransferSingle(null, constants.AddressZero, owner);
        baseToken.on(filterTranfer, (operator, from, to, id, value, event) => {
            console.log("Transfer happened: ", "\nOperator: ", operator, "\nFrom: ", from, "\nTo: ", to, "\nId: ", id.toHexString(), "\nValue: ", value.toString());
        });

        const tx = await mplace.createItem(uri, owner, amount);
        const txRes = await tx.wait();

        console.log("Gas used: ", (txRes.gasUsed.toString()));

        await delay(4);
});