import * as hre from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { BigNumber, constants, Contract, ContractTransaction, Signer } from "ethers";
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
    if (index >= args.length) return;
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
  const initialBalance = 1000_000;

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

    await execTx(currencyTokenImp.mint(ownerAddr, initialBalance));
    await execTx(currencyTokenImp.mint(firstAddr, initialBalance));
    await execTx(currencyTokenImp.mint(secondAddr, initialBalance));
    await execTx(currencyTokenImp.mint(thirdAddr, initialBalance));

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
    const id = BN.from(1).shl(255);;

    beforeEach(async () => {
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);

      await execTx(mktPlaceImp.createItemNFT("test", firstAddr));

      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
    });

    it("creates listing", async () => {
      const price = 100;

      await expectTuple(mktPlaceImp.listingsNFT(id), 0, constants.AddressZero);
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);

      await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
      await execTx(mktPlaceImp.connect(first).listItemNFT(id, price));

      await expectTuple(mktPlaceImp.listingsNFT(id), price, firstAddr);
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);
    });

    it("doesn't create listing if it already exists", async () => {
      const price = 100;

      await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
      await execTx(mktPlaceImp.connect(first).listItemNFT(id, price));

      await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
      await expect(mktPlaceImp.connect(first).listItemNFT(id, price)).to.be.revertedWith("Lot already exists");
    });

    context("Created listing", async () => {
      const price = 100;

      beforeEach(async () => {
        await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
        await execTx(mktPlaceImp.connect(first).listItemNFT(id, price));
      });

      it("cancels listing", async () => {
        await expectTuple(mktPlaceImp.listingsNFT(id), price, firstAddr);
        expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);
      
        await execTx(mktPlaceImp.connect(first).cancelNFT(id));
        
        await expectTuple(mktPlaceImp.listingsNFT(id), price, constants.AddressZero);
        expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
      });

      it("doesn't cancel if not owner", async () => {
        await expect(mktPlaceImp.connect(second).cancelNFT(id)).to.be.revertedWith("You are not owner or lot doesn't exist");
      });

      it("executes purchase", async () => {
        await expectTuple(mktPlaceImp.listingsNFT(id), price, firstAddr);
        expect(await currencyTokenImp.balanceOf(secondAddr)).to.eq(initialBalance);
        expect(await baseTokenImp.balanceOf(secondAddr, id)).to.eq(0);
      
        await execTx(currencyTokenImp.connect(second).approve(mktPlace.address, price));
        await execTx(mktPlaceImp.connect(second).buyItemNFT(id));
        
        await expectTuple(mktPlaceImp.listingsNFT(id), price, constants.AddressZero);
        expect(await currencyTokenImp.balanceOf(secondAddr)).to.eq(initialBalance - price);
        expect(await baseTokenImp.balanceOf(secondAddr, id)).to.eq(1);
      });

      it.only("doesn't sell if lot doesn't exist", async () => {
        await execTx(currencyTokenImp.connect(first).approve(mktPlace.address, price));
        await expect(mktPlaceImp.connect(first).buyItemNFT(BN.from(1).shl(255).add(42))).to.be.revertedWith("Lot doesn't exist");
      });
    });
  });

  context("NFT auction", async () => {
    const id = BN.from(1).shl(255);;

    beforeEach(async () => {
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);

      await execTx(mktPlaceImp.createItemNFT("test", firstAddr));

      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
    });

    it("creates auction", async () => {
      const price = 100;

      await expectTuple(mktPlaceImp.bidsNFT(id), constants.AddressZero, constants.AddressZero, 0, 0, 0);
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);

      await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
      await execTx(mktPlaceImp.connect(first).listItemOnAuctionNFT(id, price));

      await expectTuple(mktPlaceImp.bidsNFT(id), firstAddr, constants.AddressZero, price, 0);
      expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);
    });

    context("Created auction", async () => {
      const price = 100;
      const price2 = 200;
      const price3 = 300;
      const price4 = 400;

      beforeEach(async () => {
        await execTx(baseTokenImp.connect(first).setApprovalForAll(mktPlace.address, true));
        await execTx(mktPlaceImp.connect(first).listItemOnAuctionNFT(id, price));
      });

      async function makeBid(signer : Signer, addrOld : string, addrNew : string, priceOld : number, priceNew : number, bidNum : number) {
        expect(await currencyTokenImp.balanceOf(addrNew)).to.eq(initialBalance);
        await expectTuple(mktPlaceImp.bidsNFT(id), firstAddr, addrOld, priceOld, bidNum);

        await execTx(currencyTokenImp.connect(signer).approve(mktPlace.address, priceNew));
        await execTx(mktPlaceImp.connect(signer).makeBidNFT(id, priceNew));
        
        expect(await currencyTokenImp.balanceOf(addrNew)).to.eq(initialBalance - priceNew);
        await expectTuple(mktPlaceImp.bidsNFT(id), firstAddr, addrNew, priceNew, bidNum + 1);
      }

      it("makes bid", async () => {
        await makeBid(second, constants.AddressZero, secondAddr, price, price2, 0);
      });

      it("makes second bid", async () => {
        await makeBid(second, constants.AddressZero, secondAddr, price, price2, 0);
        await makeBid(third, secondAddr, thirdAddr, price2, price3, 1);
      });

      it("cancels auction when not enough bidders", async () => {
        await makeBid(second, constants.AddressZero, secondAddr, price, price2, 0);
        await makeBid(third, secondAddr, thirdAddr, price2, price3, 1);

        await expectTuple(mktPlaceImp.bidsNFT(id), firstAddr, thirdAddr, price3, 2);
        const balanceBefore = await currencyTokenImp.balanceOf(thirdAddr);
        expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(0);
      
        await time.increase(time.duration.days(4));
        await execTx(mktPlaceImp.connect(first).finishAuctionNFT(id));
        
        await expectTuple(mktPlaceImp.bidsNFT(id), constants.AddressZero, thirdAddr, price3, 2);
        expect(await currencyTokenImp.balanceOf(thirdAddr)).to.eq(balanceBefore.add(price3));
        expect(await baseTokenImp.balanceOf(firstAddr, id)).to.eq(1);
      });

      it("finishes auction", async () => {
        await makeBid(second, constants.AddressZero, secondAddr, price, price2, 0);
        await makeBid(third, secondAddr, thirdAddr, price2, price3, 1);
        await makeBid(second, thirdAddr, secondAddr, price3, price4, 2);

        await expectTuple(mktPlaceImp.bidsNFT(id), firstAddr, secondAddr, price4, 3);
        const balanceBefore = await currencyTokenImp.balanceOf(secondAddr);
        expect(await baseTokenImp.balanceOf(secondAddr, id)).to.eq(0);
      
        await time.increase(time.duration.days(4));
        await execTx(currencyTokenImp.connect(second).approve(mktPlace.address, price4));
        await execTx(mktPlaceImp.connect(first).finishAuctionNFT(id));
        
        await expectTuple(mktPlaceImp.bidsNFT(id), constants.AddressZero, secondAddr, price4, 3);
        expect(await currencyTokenImp.balanceOf(secondAddr)).to.eq(balanceBefore);
        expect(await baseTokenImp.balanceOf(secondAddr, id)).to.eq(1);
      });
    });
  });
});
