pragma solidity ^0.8.4;

// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";

contract Marketplace is Ownable {
    struct SellOffer {
        address seller;
        uint256 minPrice;
    }

    struct BuyOffer {
        address buyer;
        uint256 price;
        uint256 createTime;
    }

    constructor(address talentirNftAddress) {
        setNftContract(talentirNftAddress);
    }

    function setNftContract(address talentirNftAddress) public onlyOwner {
        nftAddress = talentirNftAddress;
        nftContract = IERC721(talentirNftAddress);
        royaltyContract = IERC2981(talentirNftAddress);
    }

    // TalentirNFT Contract
    address public nftAddress = address(0);
    IERC721 internal nftContract;
    IERC2981 internal royaltyContract;

    // Active Offers
    mapping(uint256 => SellOffer) public activeSellOffers;
    mapping(uint256 => BuyOffer) public activeBuyOffers;
    
    // Escrow for buy offers
    mapping(address => mapping(uint256 => uint256)) public buyOffersEscrow;

    // Events
    event NewSellOffer(uint256 tokenId, address seller, uint256 value);
    event NewBuyOffer(uint256 tokenId, address buyer, uint256 value);
    event SellOfferWithdrawn(uint256 tokenId, address seller);
    event BuyOfferWithdrawn(uint256 tokenId, address buyer);
    event RoyaltiesPaid(uint256 tokenId, uint value);
    event Sale(uint256 tokenId, address seller, address buyer, uint256 value);

    function makeSellOffer(uint256 tokenId, uint256 minPrice) external 
        isMarketable(tokenId) 
        tokenOwnerOnly(tokenId)
    {
        // Create sell offer
        activeSellOffers[tokenId] = SellOffer({seller : msg.sender,
                                               minPrice : minPrice});
        // Broadcast sell offer
        emit NewSellOffer(tokenId, msg.sender, minPrice);
    }

    function withdrawSellOffer(uint256 tokenId) external isMarketable(tokenId)
    {
        require(activeSellOffers[tokenId].seller != address(0), "No sale offer");
        require(activeSellOffers[tokenId].seller == msg.sender, "Not seller");

        // Removes the current sell offer
        delete activeSellOffers[tokenId];

        // Broadcast offer withdrawal
        emit SellOfferWithdrawn(tokenId, msg.sender);
    }


    function purchase(uint256 tokenId) external tokenOwnerForbidden(tokenId) payable {
        address seller = activeSellOffers[tokenId].seller;

        require(seller != address(0), "No active sell offer");

        // If, for some reason, the token is not approved anymore (transfer or
        // sale on another market place for instance), we remove the sell order
        // and throw
        if (nftContract.getApproved(tokenId) != address(this)) {
            delete (activeSellOffers[tokenId]);
            // Broadcast offer withdrawal
            emit SellOfferWithdrawn(tokenId, seller);
            // Revert
            revert("Invalid sell offer");
        }

        require(msg.value >= activeSellOffers[tokenId].minPrice, "Amount sent too low");

        uint256 saleValue = _deduceRoyalties(tokenId, msg.value);

        // Transfer funds to the seller
        _sendFunds(activeSellOffers[tokenId].seller, saleValue);

        // And token to the buyer
        nftContract.safeTransferFrom(seller, msg.sender, tokenId);

        // Remove all sell and buy offers
        delete (activeSellOffers[tokenId]);
        delete (activeBuyOffers[tokenId]);

        // Broadcast the sale
        emit Sale(tokenId, seller, msg.sender, msg.value);
    }

    /// @notice Makes a buy offer for a token. The token does not need to have
    ///         been put up for sale. A buy offer can not be withdrawn or
    ///         replaced for 24 hours. Amount of the offer is put in escrow
    ///         until the offer is withdrawn or superceded
    /// @param tokenId - id of the token to buy
    function makeBuyOffer(uint256 tokenId) external tokenOwnerForbidden(tokenId) payable {
        // Reject the offer if item is already available for purchase at a
        // lower or identical price
        if (activeSellOffers[tokenId].minPrice != 0) {
            require((msg.value > activeSellOffers[tokenId].minPrice), 
             "Sell order at this price or lower exists");
        }
        
        // Only process the offer if it is higher than the previous one or the
        // previous one has expired
        require(activeBuyOffers[tokenId].createTime <
                (block.timestamp - 1 days) || msg.value >
                activeBuyOffers[tokenId].price,
                "Previous buy offer higher or not expired");
        address previousBuyOfferOwner = activeBuyOffers[tokenId].buyer;
        uint256 refundBuyOfferAmount = buyOffersEscrow[previousBuyOfferOwner][tokenId];

        // Refund the owner of the previous buy offer
        buyOffersEscrow[previousBuyOfferOwner][tokenId] = 0;
        if (refundBuyOfferAmount > 0) {
            _sendFunds(previousBuyOfferOwner, refundBuyOfferAmount);
        }

        // Create a new buy offer
        activeBuyOffers[tokenId] = BuyOffer({buyer : msg.sender,
                                             price : msg.value,
                                             createTime : block.timestamp});
        // Create record of funds deposited for this offer
        buyOffersEscrow[msg.sender][tokenId] = msg.value;
        // Broadcast the buy offer
        emit NewBuyOffer(tokenId, msg.sender, msg.value);
    }

    /// @notice Withdraws a buy offer. Can only be withdrawn a day after being
    ///         posted
    /// @param tokenId - id of the token whose buy order to remove
    function withdrawBuyOffer(uint256 tokenId) external lastBuyOfferExpired(tokenId) {
        require(activeBuyOffers[tokenId].buyer == msg.sender, "Not buyer");

        uint256 refundBuyOfferAmount = buyOffersEscrow[msg.sender][tokenId];

        // Set the buyer balance to 0 before refund
        buyOffersEscrow[msg.sender][tokenId] = 0;

        // Remove the current buy offer
        delete(activeBuyOffers[tokenId]);

        // Refund the current buy offer if it is non-zero
        if (refundBuyOfferAmount > 0) {
            _sendFunds(msg.sender, refundBuyOfferAmount);
        }
        
        // Broadcast offer withdrawal
        emit BuyOfferWithdrawn(tokenId, msg.sender);
    }

    /// @notice Lets a token owner accept the current buy offer
    ///         (even without a sell offer)
    /// @param tokenId - id of the token whose buy order to accept
    function acceptBuyOffer(uint256 tokenId) external isMarketable(tokenId) tokenOwnerOnly(tokenId) {
        address currentBuyer = activeBuyOffers[tokenId].buyer;
        require(currentBuyer != address(0), "No buy offer");

        uint256 saleValue = activeBuyOffers[tokenId].price;
        uint256 netSaleValue = _deduceRoyalties(tokenId, saleValue);

        // Delete the current sell offer whether it exists or not
        delete (activeSellOffers[tokenId]);

        // Delete the buy offer that was accepted
        delete (activeBuyOffers[tokenId]);

        // Withdraw buyer's balance
        buyOffersEscrow[currentBuyer][tokenId] = 0;

        // Transfer funds to the seller
        _sendFunds(msg.sender, netSaleValue);

        // And token to the buyer
        nftContract.safeTransferFrom(
            msg.sender,
            currentBuyer,
            tokenId
        );

        // Broadcast the sale
        emit Sale(tokenId, msg.sender, currentBuyer, saleValue);
    }

    /// @notice Transfers royalties to the rightsowner if applicable
    function _deduceRoyalties(uint256 tokenId, uint256 grossSaleValue) internal returns (uint256 netSaleAmount) {
        if (_checkRoyalties(nftAddress)) {
            // Get amount of royalties to pays and recipient
            (address royaltiesReceiver, uint256 royaltiesAmount) 
                = royaltyContract.royaltyInfo(tokenId, grossSaleValue);

            // Deduce royalties from sale value
            uint256 netSaleValue = grossSaleValue - royaltiesAmount;

            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                _sendFunds(royaltiesReceiver, royaltiesAmount);
            }

            // Broadcast royalties payment
            emit RoyaltiesPaid(tokenId, royaltiesAmount);
            return netSaleValue;
        } else {
            return grossSaleValue;
        }
    }

    function _sendFunds(address receiver, uint256 amount) internal {
        (bool success,) =  receiver.call{value: amount}("");
        require(success == true, "Couldn't send funds");
    }

    function _checkRoyalties(address _contract) internal view returns (bool) {
        bytes4 interfaceIdErc2981 = 0x2a55205a;
        return  IERC2981(_contract).supportsInterface(interfaceIdErc2981);
    }

    modifier isMarketable(uint256 tokenId) {
        require(nftContract.getApproved(tokenId) == address(this), "Not approved");
        _;
    }

    modifier tokenOwnerForbidden(uint256 tokenId) {
        require(nftContract.ownerOf(tokenId) != msg.sender, "Token owner not allowed");
        _;
    }

    modifier tokenOwnerOnly(uint256 tokenId) {
        require(nftContract.ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    modifier lastBuyOfferExpired(uint256 tokenId) {
        require(activeBuyOffers[tokenId].createTime < (block.timestamp - 1 days), "Buy offer not expired");
        _;
    }
}