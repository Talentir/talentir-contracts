// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/// @custom:security-contact jk@talentir.com
contract TalentirMarketplace is Ownable, ReentrancyGuard, Pausable {
    // - TYPES
    struct SellOffer {
        address seller;
        uint256 minPrice;
    }

    struct BuyOffer {
        address buyer;
        uint256 price; // This amount will be held in escrow
    }

    // - MEMBERS

    // Active Sell and Buy Offers mapping (nftContractAddress => (tokenID => Offer))
    mapping(address => mapping(uint256 => SellOffer)) public activeSellOffers;
    mapping(address => mapping(uint256 => BuyOffer)) public activeBuyOffers;

    // Only approved NFT contracts can be traded with this marketplace
    mapping(address => bool) public approvedNftContracts;

    uint256 public marketplaceFeePerMill = 25;
    uint256 public totalAmountInEscrow = 0;

    // - EVENTS
    event NftContractApproved(address nftContractAddress, bool approved);
    event MarketplaceFeeChanged(uint256 feePermill);

    event NewSellOffer(address nftAddress, uint256 tokenId, address seller, uint256 value);
    event SellOfferWithdrawn(address nftAddress, uint256 tokenId, address seller);

    event NewBuyOffer(address nftAddress, uint256 tokenId, address buyer, uint256 value, bool previousRefunded);
    event BuyOfferWithdrawn(address nftAddress, uint256 tokenId, address buyer);

    event RoyaltiesPaid(address nftAddress, uint256 tokenId, uint256 value, address receiver);
    event Sale(address nftAddress, uint256 tokenId, address seller, address buyer, uint256 value);

    // - ADMIN FUNCTIONS
    function setNftContractApproval(address nftContract, bool approval) external onlyOwner {
        approvedNftContracts[nftContract] = approval;
        emit NftContractApproved(nftContract, approval);
    }

    function setMarketPlaceFee(uint256 newMarketplaceFeePerMill) external onlyOwner {
        marketplaceFeePerMill = newMarketplaceFeePerMill;
        emit MarketplaceFeeChanged(newMarketplaceFeePerMill);
    }

    function getFeeBalance() public view returns (uint256 feeBalance) {
        return address(this).balance - totalAmountInEscrow;
    }

    function withdrawFees(address payable receiver) external onlyOwner {
        Address.sendValue(receiver, getFeeBalance());
    }

    function setPause(bool shouldPause) external onlyOwner {
        if (shouldPause) {
            _pause();
        } else {
            _unpause();
        }
    }

    /**
     * If owner of the NFT changes outside of the scope of this marketplace, there could still be an
     * orphant Sell Offer. This function allows anyone to clean up this orphant Sell Offer.
     */
    function cleanupSelloffers(address nftAddress, uint256[] calldata tokenIds) external {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenID = tokenIds[i];

            address seller = activeSellOffers[nftAddress][tokenID].seller;
            if (seller != IERC721(nftAddress).ownerOf(tokenID)) {
                delete activeSellOffers[nftAddress][tokenID];
                emit SellOfferWithdrawn(nftAddress, tokenID, seller);
            }
        }
    }

    // - USER FUNCTIONS
    function makeSellOffer(
        address nftAddress,
        uint256 tokenId,
        uint256 minPrice
    )
        external
        whenNotPaused
        ensureNftContractApproved(nftAddress)
        ensureMarketplaceApproved(nftAddress, tokenId)
        tokenOwnerOnly(nftAddress, tokenId)
    {
        require(minPrice > activeBuyOffers[nftAddress][tokenId].price, "BuyOffer higher");
        activeSellOffers[nftAddress][tokenId] = SellOffer({seller: msg.sender, minPrice: minPrice});

        emit NewSellOffer(nftAddress, tokenId, msg.sender, minPrice);
    }

    function withdrawSellOffer(address nftAddress, uint256 tokenId) external {
        require(activeSellOffers[nftAddress][tokenId].seller == msg.sender, "Not seller");

        delete activeSellOffers[nftAddress][tokenId];

        emit SellOfferWithdrawn(nftAddress, tokenId, msg.sender);
    }

    function purchase(address nftAddress, uint256 tokenId)
        external
        payable
        nonReentrant
        whenNotPaused
        ensureNftContractApproved(nftAddress)
        tokenOwnerForbidden(nftAddress, tokenId)
    {
        address seller = activeSellOffers[nftAddress][tokenId].seller;
        require(seller != address(0), "No active sell offer");
        require(msg.value >= activeSellOffers[nftAddress][tokenId].minPrice, "Amount sent too low");

        _exchangeNftForEth(nftAddress, tokenId, payable(seller), msg.sender, msg.value);

        emit Sale(nftAddress, tokenId, seller, msg.sender, msg.value);
    }

    /**
     * @notice Makes a buy offer for a token. The token does not need to have
     * been put up for sale. Amount of the offer is put in escrow
     * until the offer is withdrawn or superceded
     */
    function makeBuyOffer(address nftAddress, uint256 tokenId)
        external
        payable
        nonReentrant
        whenNotPaused
        ensureNftContractApproved(nftAddress)
        ensureMarketplaceApproved(nftAddress, tokenId)
        tokenOwnerForbidden(nftAddress, tokenId)
    {
        uint256 offerPrice = msg.value;

        require(
            activeSellOffers[nftAddress][tokenId].seller == address(0) ||
                offerPrice < activeSellOffers[nftAddress][tokenId].minPrice,
            "Sell order at this price or lower exists"
        );
        require(offerPrice > activeBuyOffers[nftAddress][tokenId].price, "Price too low");

        totalAmountInEscrow += offerPrice;

        // When refund is blocked, just log, so higher BuyOffers can still be admitted
        bool refunded = _removeBuyOffer(nftAddress, tokenId);

        activeBuyOffers[nftAddress][tokenId] = BuyOffer({buyer: msg.sender, price: offerPrice});

        emit NewBuyOffer(nftAddress, tokenId, msg.sender, msg.value, refunded);
    }

    /**
     * @notice Lets the Buyer withdraw the offer.
     */
    function withdrawBuyOffer(address nftAddress, uint256 tokenId) external nonReentrant {
        require(activeBuyOffers[nftAddress][tokenId].buyer == msg.sender, "Not buyer");

        bool refunded = _removeBuyOffer(nftAddress, tokenId);

        // Withdrawal is only successful, if refund was possible
        require(refunded, "Refund rejected");

        emit BuyOfferWithdrawn(nftAddress, tokenId, msg.sender);
    }

    /**
     * @notice Lets a token owner accept the current buy offer
     */
    function acceptBuyOffer(address nftAddress, uint256 tokenId)
        external
        nonReentrant
        whenNotPaused
        ensureNftContractApproved(nftAddress)
        tokenOwnerOnly(nftAddress, tokenId)
    {
        address currentBuyer = activeBuyOffers[nftAddress][tokenId].buyer;
        uint256 salesValue = activeBuyOffers[nftAddress][tokenId].price;
        require(currentBuyer != address(0), "No buy offer");

        // Delete buy offer, so it's not refunded later
        delete (activeBuyOffers[nftAddress][tokenId]);
        _exchangeNftForEth(nftAddress, tokenId, payable(msg.sender), currentBuyer, salesValue);

        emit Sale(nftAddress, tokenId, msg.sender, currentBuyer, salesValue);
    }

    // - PRIVATE FUNCTIONS

    function _removeBuyOffer(address nftAddress, uint256 tokenId) private returns (bool refunded) {
        address previousBuyOfferOwner = activeBuyOffers[nftAddress][tokenId].buyer;
        uint256 previousBuyOfferPrice = activeBuyOffers[nftAddress][tokenId].price;

        if (previousBuyOfferOwner == address(0)) {
            return false;
        }

        totalAmountInEscrow -= previousBuyOfferPrice;

        // Remove the current buy offer
        delete (activeBuyOffers[nftAddress][tokenId]);

        // Make sure that this function always succeeds, even if Buyer blocks receiving. This
        // prevents an attack where a Buyer could block receiving funds and not allow new (higher)
        // offers. If the buyer sends ETH for an offer but blocks receival for refund, it's most
        // likely malicious. Talentir can still recover the funds as part of the fee and send it back.
        (bool success, ) = previousBuyOfferOwner.call{value: previousBuyOfferPrice}("");

        return success;
    }

    function _exchangeNftForEth(
        address nftAddress,
        uint256 tokenId,
        address payable seller,
        address buyer,
        uint256 amount
    ) private {
        // Remove all sell and buy offers
        // Do this first, see Checks-Effects-Interaction Pattern
        delete (activeSellOffers[nftAddress][tokenId]);
        _removeBuyOffer(nftAddress, tokenId);

        uint256 netSaleValue = _deduceRoyaltiesAndFees(nftAddress, tokenId, amount);

        // Transfer funds to the seller
        Address.sendValue(seller, netSaleValue);

        // And token to the buyer
        IERC721(nftAddress).safeTransferFrom(seller, buyer, tokenId);
    }

    function _deduceRoyaltiesAndFees(
        address nftAddress,
        uint256 tokenId,
        uint256 grossSaleValue
    ) internal returns (uint256 netSaleAmount) {
        uint256 marketplaceFee = (grossSaleValue * marketplaceFeePerMill) / 1000;
        uint256 royaltiesAmount = 0;

        if (_doesContractSupportRoyalties(nftAddress)) {
            // Get amount of royalties to pays and recipient
            (address royaltiesReceiver, uint256 royaltiesAmountTemp) = IERC2981(nftAddress).royaltyInfo(
                tokenId,
                grossSaleValue
            );

            royaltiesAmount = royaltiesAmountTemp;

            // Transfer royalties to rightholder if not zero
            if (royaltiesAmount > 0) {
                Address.sendValue(payable(royaltiesReceiver), royaltiesAmount);
            }

            // Broadcast royalties payment
            emit RoyaltiesPaid(nftAddress, tokenId, royaltiesAmount, royaltiesReceiver);
        }

        // Deduce royalties and marketplaceFee from sale value
        return grossSaleValue - royaltiesAmount - marketplaceFee;
    }

    function _doesContractSupportRoyalties(address nftAddress) internal view returns (bool) {
        bytes4 interfaceIdErc2981 = 0x2a55205a;
        return IERC2981(nftAddress).supportsInterface(interfaceIdErc2981);
    }

    function _isMarketplaceApproved(address nftAddress, uint256 tokenId) private view returns (bool) {
        IERC721 nft = IERC721(nftAddress);
        bool approved = nft.getApproved(tokenId) == address(this);
        address owner = nft.ownerOf(tokenId);
        bool approvedForAll = nft.isApprovedForAll(owner, address(this));
        return approved || approvedForAll;
    }

    // - MODIFIERS
    modifier ensureMarketplaceApproved(address nftAddress, uint256 tokenId) {
        require(_isMarketplaceApproved(nftAddress, tokenId), "Marketplace not approved");
        _;
    }

    modifier tokenOwnerForbidden(address nftAddress, uint256 tokenId) {
        require(IERC721(nftAddress).ownerOf(tokenId) != msg.sender, "Token owner not allowed");
        _;
    }

    modifier tokenOwnerOnly(address nftAddress, uint256 tokenId) {
        require(IERC721(nftAddress).ownerOf(tokenId) == msg.sender, "Not token owner");
        _;
    }

    modifier ensureNftContractApproved(address nftAddress) {
        require(approvedNftContracts[nftAddress] == true, "NFT Contract not approved");
        _;
    }
}
