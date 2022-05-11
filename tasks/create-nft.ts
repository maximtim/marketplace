import { constants } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { BaseToken1155, Marketplace } from "../typechain";
import { delay } from "./lib";

task("mp-create-nft", "Crete new NFT on marketplace")
    .addParam("uri", "Metadata URI")
    .addParam("owner", "Onwner of minted NFT")
    .setAction(async ({uri, owner}, hre) => {
        const mplace = await hre.ethers.getContractAt("Marketplace", process.env.MARKETPLACE_ADDRESS ?? "") as unknown as Marketplace;
        const baseToken = await hre.ethers.getContractAt("BaseToken1155", process.env.BASETOKEN_ADDRESS ?? "") as unknown as BaseToken1155;

        await mplace.callStatic.createItemNFT(uri, owner);
        console.log("Callstatic success");
        

        const filterTranfer = baseToken.filters.TransferSingle(null, constants.AddressZero, owner);
        baseToken.on(filterTranfer, (operator, from, to, id, value, event) => {
            console.log("Transfer happened: ", "\nOperator: ", operator, "\nFrom: ", from, "\nTo: ", to, "\nId: ", id.toHexString(), "\nValue: ", value.toString());
        });

        const tx = await mplace.createItemNFT(uri, owner);
        const txRes = await tx.wait();

        console.log("Gas used: ", (txRes.gasUsed.toString()));

        await delay(4);
});