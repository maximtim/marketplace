// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.4;

import "./BaseToken1155.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract Marketplace is ERC1155Holder {
    using Counters for Counters.Counter;
    uint constant public AUCTION_DURATION = 3 days;
    uint constant public BIDS_MIN_COUNT = 3;
    uint constant public NFT_FLAG = 1 << 255;

    BaseToken1155 public baseToken;
    IERC20 public currencyToken;

    Counters.Counter private _tokenIdCounter;

    struct LotF {
        uint price;
        uint amount;
    }

    struct LotNF {
        uint price;
        address owner;
    }

    struct BidF {
        address bidder;
        uint price;
        uint amount;
        uint bidNum;
        uint startTime;
    }

    struct BidNF {
        address owner;
        address bidder;
        uint price;
        uint bidNum;
        uint startTime;
    }

    mapping (uint => mapping (address => LotF)) public listingsFungible;
    mapping (uint => mapping (address => BidF)) public bidsFungible;

    mapping (uint => LotNF) public listingsNFT;
    mapping (uint => BidNF) public bidsNFT;

    constructor(address baseToken_, address currencyToken_) {
        baseToken = BaseToken1155(baseToken_);
        currencyToken = IERC20(currencyToken_);
    }

    modifier positive(uint number, string memory name) {
        require(number > 0, string(bytes.concat(bytes(name), bytes(" must be positive"))));
        _;
    }

    modifier nonFungibleItem(uint _id) {
        require(_id & NFT_FLAG == NFT_FLAG, "Must be NFT");
        _;
    }

    modifier fungibleItem(uint _id) {
        require(_id & NFT_FLAG == 0, "Must be fungible");
        _;
    }

    ////////////////////////////////////////////////////////////////////////////////////////////
    // Fungible

    /**
     * @dev Create item
     */
    function createItem(string memory tokenURI, address owner, uint amount) external {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        baseToken.mint(owner, tokenURI, tokenId, amount, "");
    }

    ////////////////////////////////////////////////////////////////////////////////////////////

    /**
     * @dev Create new lot
     */
    function listItem(uint tokenId, uint price, uint amount) 
        public 
        fungibleItem(tokenId)
        positive(price, "Price")
        positive(amount, "Amount")
    {
        LotF storage lot = listingsFungible[tokenId][msg.sender];
        uint oldAmount = lot.amount;
        require(oldAmount == 0, "Lot already exists");
        
        lot.price = price;
        lot.amount = amount;
        baseToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
    }

    /**
     * @dev Edit existing lot. Changing price isn't allowed to prevent attacks
     * (creator edits price with faster transaction after seeing block with buyItem)
     */
    function editLot(uint tokenId, uint amount) 
        public
        fungibleItem(tokenId) 
    {
        LotF storage lot = listingsFungible[tokenId][msg.sender];
        uint oldAmount = lot.amount;
        require(oldAmount > 0, "Lot doesn't exist");
        require(amount != oldAmount, "Same amount as current");

        lot.amount = amount;

        if (amount > oldAmount) {
            baseToken.safeTransferFrom(msg.sender, address(this), tokenId, amount - oldAmount, "");
        } else {
            baseToken.safeTransferFrom(address(this), msg.sender, tokenId, oldAmount - amount, "");
        }
    }

    function cancel(uint tokenId) 
        external
        fungibleItem(tokenId) 
    {
        editLot(tokenId, 0);
    }

    function buyItem(uint tokenId, address from, uint amount) 
        external 
        fungibleItem(tokenId)
        positive(amount, "Amount") 
    {
        LotF storage lot = listingsFungible[tokenId][from];

        // require?
        lot.amount -= amount;
        currencyToken.transferFrom(msg.sender, from, lot.price);
        baseToken.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
    }

    ///////////////////////////////////////////////////////////////////////////////////////////

    function listItemOnAuction(uint tokenId, uint minPrice, uint amount) 
        external
        fungibleItem(tokenId) 
        positive(amount, "Amount")
        positive(minPrice, "MinPrice") 
    {
        BidF storage bid = bidsFungible[tokenId][msg.sender];
        require(bid.amount == 0, "Auction already exists");
        
        bid.bidder = msg.sender;
        bid.price = minPrice;
        bid.amount = amount;
        bid.startTime = block.timestamp;
        bid.bidNum = 0;

        baseToken.safeTransferFrom(msg.sender, address(this), tokenId, amount, "");
    }

    function makeBid(uint tokenId, address creator, uint price) 
        external
        fungibleItem(tokenId) 
    {
        BidF storage bid = bidsFungible[tokenId][creator];
        address oldBidder = bid.bidder;
        uint oldPrice = bid.price;

        require(bid.amount > 0, "Auction doesn't exist");
        require(oldPrice < price, "Next bid price must be greater than current");
        require(oldBidder != msg.sender, "Same bidder");
        require(creator != msg.sender, "Creator can't bid");

        bid.bidder = msg.sender;
        bid.price = price;
        bid.bidNum++;

        if (oldBidder != creator) {
            currencyToken.transfer(oldBidder, oldPrice);
        }

        currencyToken.transferFrom(msg.sender, address(this), price);
    }

    function finishAuction(uint tokenId) 
        external
        fungibleItem(tokenId)
    {
        BidF storage bid = bidsFungible[tokenId][msg.sender];
        uint amount = bid.amount;
        uint bidNum = bid.bidNum;

        require(amount > 0, "Auction doesn't exist");
        require(block.timestamp > bid.startTime + AUCTION_DURATION, "Auction is not ended yet");

        bid.amount = 0;
        
        if (bidNum >= BIDS_MIN_COUNT)
        {
            // finish
            currencyToken.transfer(msg.sender, bid.price);
            baseToken.safeTransferFrom(address(this), bid.bidder, tokenId, amount, "");
        } else {
            // cancel
            if (bidNum > 0) {
                currencyToken.transfer(bid.bidder, bid.price);
            }
            
            baseToken.safeTransferFrom(address(this), msg.sender, tokenId, amount, "");
        }
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////
    // NFT

    /**
     * @dev Create item NFT
     */
    function createItemNFT(string memory tokenURI, address owner) external {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        baseToken.mint(owner, tokenURI, tokenId | NFT_FLAG, 1, "");
    }

    ////////////////////////////////////////////////////////////////////////////////////////////

    function listItemNFT(uint tokenId, uint price) 
        public 
        nonFungibleItem(tokenId)
        positive(price, "Price")
    {
        require(listingsNFT[tokenId].owner == address(0), "Lot already exists");
        
        listingsNFT[tokenId] = LotNF(price, msg.sender);
        baseToken.safeTransferFrom(msg.sender, address(this), tokenId, 1, "");
    }

    function cancelNFT(uint tokenId) 
        public
        nonFungibleItem(tokenId)
    {
        require(listingsNFT[tokenId].owner == msg.sender, "You are not owner or lot doesn't exist");

        listingsNFT[tokenId].owner = address(0);
        baseToken.safeTransferFrom(address(this), msg.sender, tokenId, 1, "");
    }

    function buyItemNFT(uint tokenId) 
        external 
        nonFungibleItem(tokenId)
    {
        address owner = listingsNFT[tokenId].owner;
        require(owner != address(0), "Lot doesn't exist");

        listingsNFT[tokenId].owner = address(0);
        currencyToken.transferFrom(msg.sender, owner, listingsNFT[tokenId].price);
        baseToken.safeTransferFrom(address(this), msg.sender, tokenId, 1, "");
    }

    ///////////////////////////////////////////////////////////////////////////////////////////

    function listItemOnAuctionNFT(uint tokenId, uint minPrice) 
        external
        nonFungibleItem(tokenId)
        positive(minPrice, "MinPrice") 
    {
        BidNF storage bid = bidsNFT[tokenId];
        require(bid.owner == address(0), "Auction already exists");
        
        bid.owner = msg.sender;
        bid.price = minPrice;
        bid.startTime = block.timestamp;
        bid.bidNum = 0;

        baseToken.safeTransferFrom(msg.sender, address(this), tokenId, 1, "");
    }

    function makeBidNFT(uint tokenId, uint price) 
        external 
        nonFungibleItem(tokenId)
    {
        BidNF storage bid = bidsNFT[tokenId];
        address oldBidder = bid.bidder;
        uint oldPrice = bid.price;
        address owner = bid.owner;

        require(owner != address(0), "Auction doesn't exist");
        require(oldPrice < price, "Next bid price must be greater than current");
        require(oldBidder != msg.sender, "Same bidder");
        require(owner != msg.sender, "Creator can't bid");

        bid.bidder = msg.sender;
        bid.price = price;
        bid.bidNum++;

        if (oldBidder != address(0)) {
            currencyToken.transfer(oldBidder, oldPrice);
        }

        currencyToken.transferFrom(msg.sender, address(this), price);
    }

    function finishAuctionNFT(uint tokenId) 
        external 
        nonFungibleItem(tokenId)
    {
        BidNF storage bid = bidsNFT[tokenId];
        address owner = bid.owner;
        uint bidNum = bid.bidNum;

        require(owner == msg.sender, "You are not owner or bid doesn't exist");
        require(block.timestamp > bid.startTime + AUCTION_DURATION, "Auction is not ended yet");

        bid.owner = address(0);
        
        if (bidNum >= BIDS_MIN_COUNT)
        {
            // finish
            currencyToken.transfer(owner, bid.price);
            baseToken.safeTransferFrom(address(this), bid.bidder, tokenId, 1, "");
        } else {
            // cancel
            if (bidNum > 0) {
                currencyToken.transfer(bid.bidder, bid.price);
            }
            
            baseToken.safeTransferFrom(address(this), owner, tokenId, 1, "");
        }
    }
}