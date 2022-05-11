import { constants } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { task } from "hardhat/config";
import { BaseToken1155 } from "../typechain";
import { delay } from "./lib";

task("token-give-minter-role", "Give token minter role for address")
    .addParam("address", "Address of minter")
    .setAction(async ({address}, hre) => {
        const baseToken = await hre.ethers.getContractAt("BaseToken1155", process.env.BASETOKEN_ADDRESS ?? "") as unknown as BaseToken1155;
        const role = await baseToken.MINTER_ROLE();

        await baseToken.callStatic.grantRole(await baseToken.MINTER_ROLE(), address);
        console.log("Callstatic success");
        

        const filter = baseToken.filters.RoleGranted(role, address);
        baseToken.on("RoleGranted", (role, account, sender, event) => {
            console.log("RoleGranted emitted: ", "\nRole: ", role, "\nAccount: ", account, "\nSender: ", sender);
        });

        const tx = await baseToken.grantRole(role, address);
        const txRes = await tx.wait();

        console.log("Gas used: ", (txRes.gasUsed.toNumber()));

        await delay(4);
});