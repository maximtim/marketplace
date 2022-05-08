import * as hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, constants, Contract, ContractTransaction } from "ethers";
import { id, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { BaseToken1155, ERC20PresetMinterPauser, Marketplace } from "../typechain";
const { time, BN, address } = hre.testUtils;

//////////////////////////////////////////////////////////////////////////////////

async function execTx(txPromise : Promise<ContractTransaction>) {
  const tx = await txPromise;
  return await tx.wait();
}

async function expectTuple(txRes : Promise<any[]>, ...args : any[]) {
  const [...results] = await txRes;

  results.forEach((element, index) => {
    expect(element).to.eq(args[index]);
  });
}

///////////////////////////////////////////////////////////////////////////////////

describe("Marketplace", function () {
  let owner : SignerWithAddress,
     first: SignerWithAddress, 
     second: SignerWithAddress, 
     third : SignerWithAddress;
  let ownerAddr : string,
     firstAddr: string, 
     secondAddr: string, 
     thirdAddr : string;
  let mktPlace : Contract;
  let mktPlaceImp : Marketplace;
  let currencyTokenImp : ERC20PresetMinterPauser;
  let baseTokenImp : BaseToken1155;

  beforeEach(async () => {
    [ owner, first, second, third ] = await ethers.getSigners();
    ownerAddr = await owner.getAddress();
    firstAddr = await first.getAddress();
    secondAddr = await second.getAddress();
    thirdAddr = await third.getAddress();

    const ERC20PresetMinterPauser = await hre.ethers.getContractFactory("ERC20PresetMinterPauser");
    const currencyToken = await ERC20PresetMinterPauser.deploy("Test", "TEST");
    currencyTokenImp = currencyToken as unknown as ERC20PresetMinterPauser;
    await currencyToken.deployed();

    const BaseToken1155 = await hre.ethers.getContractFactory("BaseToken1155");
    const baseToken = await BaseToken1155.deploy();
    baseTokenImp = baseToken as unknown as BaseToken1155;
    await baseToken.deployed();

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    mktPlace = await Marketplace.deploy(baseToken.address, currencyToken.address);
    mktPlaceImp = mktPlace as unknown as Marketplace;
    await mktPlace.deployed();

    await execTx(currencyTokenImp.mint(ownerAddr, 1000_000));
    await execTx(currencyTokenImp.mint(firstAddr, 1000_000));
    await execTx(currencyTokenImp.mint(secondAddr, 1000_000));

    await execTx(baseTokenImp.grantRole(await baseTokenImp.MINTER_ROLE(), mktPlace.address));
  });

  it("should deploy successfully", async () => {
    expect(mktPlace.address).to.be.properAddress;
    expect(await mktPlaceImp.BIDS_MIN_COUNT()).to.be.eq(3);
    expect(await mktPlaceImp.AUCTION_DURATION()).to.be.eq(time.duration.days(3));

    expect(await currencyTokenImp.balanceOf(ownerAddr)).to.eq(1000_000);
    expect(baseTokenImp.hasRole(await baseTokenImp.MINTER_ROLE(), mktPlace.address));
  });

  it("creates NFT successfully", async () => {
    const id = BN.from(1).shl(255);
    expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);

    await execTx(mktPlaceImp.createItemNFT("test", firstAddr));

    expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
    expect(await baseTokenImp.uri(id)).to.eq("test");
  });

  context("NFT listing", async () => {
    let id : BigNumber;

    beforeEach(async () => {
      id = BN.from(1).shl(255);
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);

      await execTx(mktPlaceImp.createItemNFT("test", firstAddr));

      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
    });

    it("creates listing", async () => {
      const price = 100;

      await expectTuple(mktPlaceImp.listingsNFT(id), 0, constants.AddressZero);

      await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
      await execTx(mktPlaceImp.connect(first).listItemNFT(id, price));

      await expectTuple(mktPlaceImp.listingsNFT(id), price, firstAddr);
    });
  })
});
