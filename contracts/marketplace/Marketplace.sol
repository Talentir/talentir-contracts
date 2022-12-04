// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// CONTRACTS ///
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/// LIBRARIES ///
import "./RBTLibrary.sol";
import "./LinkedListLibrary.sol";

/// INTERFACES ///
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// TYPES ///
import {Side, Order} from "./OrderTypes.sol";

import "hardhat/console.sol";

contract TalentirMarketplaceV0 is Pausable, Ownable, ReentrancyGuard, ERC1155Holder {
    /// LIBRARIES ///
    using RBTLibrary for RBTLibrary.Tree;
    using LinkedListLibrary for LinkedListLibrary.LinkedList;

    /// TYPES ///
    struct OrderBook {
        RBTLibrary.Tree priceTree;
        mapping(uint256 => LinkedListLibrary.LinkedList) orderList;
    }

    /// CONTRACTS ///

    /// STATE ///
    mapping(uint256 => mapping(Side => OrderBook)) markets;
    /// @dev tokenId => Side => OrderBook
    mapping(uint256 => Order) public orders; /// @dev OrderId => Order
    mapping(address => LinkedListLibrary.LinkedList) userOrders; /// @dev User => Linked list of open orders by user
    address public TalentirNFT;
    uint256 public talentirFeePercent;
    address public talentirFeeWallet;
    uint256 public nextOrderId;
    uint256 internal constant PERCENT = 100000;

    /// EVENTS ///
    event OrderAdded(
        uint256 indexed orderId,
        uint256 tokenId,
        Side side,
        address indexed sender,
        uint256 price,
        uint256 quantity
    );
    event OrderExecuted(
        uint256 indexed orderId,
        address indexed initiator,
        uint256 price,
        uint256 royalties,
        address royaltiesReceiver,
        uint256 quantity,
        uint256 remainingQuantity
    );
    event OrderCancelled(uint256 orderId);
    event TalentirFeeSet(uint256 fee, address wallet);

    /// CONSTRUCTOR ///

    constructor(address _talentirNFT, uint256 _nextOrderId) {
        nextOrderId = _nextOrderId;
        TalentirNFT = _talentirNFT;
        require(IERC1155(TalentirNFT).supportsInterface(0x2a55205a)); // must implement ERC-2981 royalties standard
    }

    /// VIEW FUNCTIONS ///
    /**
        @notice Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
        @dev Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
        @param _tokenId token Id (ERC1155)
        @return uint256 Id of best order
        @return uint256 price of best order
     */
    function getBestOrder(uint256 _tokenId, Side _side) public view returns (uint256, uint256) {
        uint256 price = _side == Side.BUY
            ? markets[_tokenId][_side].priceTree.last()
            : markets[_tokenId][_side].priceTree.first();
        uint256 bestOrderId;
        (, bestOrderId, ) = markets[_tokenId][_side].orderList[price].getNode(0);
        return (bestOrderId, price);
    }

    /**
        @notice Computes the fee amount to be paid to Talentir for a transaction of size `_totalPaid`
        @dev Computes the fee amount to be paid for a transaction of size `_quantity`. 
        @param _totalPaid price*volume
        @return uint256 fee 
     */
    function calcTalentirFee(uint256 _totalPaid) public view returns (uint256) {
        return ((100 * talentirFeePercent * _totalPaid) / PERCENT) / 100;
    }

    /// PUBLIC FUNCTIONS ///

    /**
        @notice Sell `tokenQuantity` of token `tokenId` for min `ETHquantity` total price. (ERC1155)
        @dev Sell `tokenQuantity` of token `tokenId` for min `ETHquantity` total price. (ERC1155)
        @dev Price limit must always be included to prevent frontrunning. 
        @dev Sender address must be able to receive Ether, otherwise funds may be lost (ony relevant if sent from a smart contract)
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param tokenId token Id (ERC1155)
        @param ETHquantity total ETH demanded (quantity*minimum price per unit)
        @param tokenQuantity how much to sell in total of token 
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
     */
    function makeSellOrder(
        uint256 tokenId,
        uint256 ETHquantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused {
        _makeOrder(tokenId, Side.SELL, ETHquantity, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /**
        @notice Buy `tokenQuantity` of token `tokenId` for max `msg.value` total price.
        @dev Buy `tokenQuantity` of token `tokenId` for max `msg.value` total price.
        @dev Price limit must always be included to prevent frontrunning. 
        @dev Sender address must be able to receive Ether, otherwise funds may be lost (ony relevant if sent from a smart contract)
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param tokenId token Id (ERC1155)
        @param tokenQuantity how much to buy in total of token 
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
        @dev `msg.value` total ETH offered (quantity*maximum price per unit)
     */
    function makeBuyOrder(
        uint256 tokenId,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external payable whenNotPaused {
        _makeOrder(tokenId, Side.BUY, msg.value, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /**
        @notice Cancel orders: `orders`
        @dev Cancel orders: `orders`. 
        @dev emits OrdersCancelled event. 
        @param orderIds array of order Ids
     */
    function cancelOrders(uint256[] calldata orderIds) external nonReentrant {
        bool success;
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            require(msg.sender == orders[orderId].sender, "Wrong user");
            Side side = orders[orderId].side;
            uint256 price = orders[orderId].price;
            uint256 quantity = orders[orderId].quantity;
            uint256 tokenId = orders[orderId].tokenId;
            _removeOrder(orderId);
            if (side == Side.BUY) {
                (success, ) = msg.sender.call{value: (price * quantity)}("");
            } else {
                _safeTransferFrom(TalentirNFT, tokenId, address(this), msg.sender, quantity);
            }
            emit OrderCancelled(orderId);
        }
    }

    /// RESTRICTED PUBLIC FUNCTIONS ///

    /// @dev Pause contract.
    function pause() external onlyOwner {
        _pause();
    }

    /// @dev Unpause contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
        @dev Set the fee that Talentir will receive on each transaction.
        @dev emits DefaultFeeSet event. 
        @dev fee capped at 10%
        @param _fee fee percent (100% = 100,000)
        @param _wallet address where Talentir fee will be sent to
     */
    function setTalentirFee(uint256 _fee, address _wallet) external onlyOwner {
        require(_fee <= PERCENT / 10, "Must be <=10k"); // Talentir fee can never be higher than 10%
        talentirFeePercent = _fee;
        talentirFeeWallet = _wallet;
        emit TalentirFeeSet(_fee, _wallet);
    }

    /// INTERNAL FUNCTIONS ///

    /// @dev Return BUY for SELL or vice versa.
    function _oppositeSide(Side _side) internal pure returns (Side) {
        return Side(1 - uint8(_side));
    }

    /// @dev Make a limit order. Internally, all orders are limit orders to prevent front running.
    function _makeOrder(
        uint256 _tokenId,
        Side _side,
        uint256 _ETHquantity,
        uint256 _tokenQuantity,
        bool _addOrderForRemaining
    ) internal {
        uint256 bestPrice;
        uint256 bestOrderId;
        uint256 price = _ETHquantity / _tokenQuantity;
        require(_ETHquantity > 0, "Price must be positive");
        // This check prevents orders from being added if there are rounding problems:
        require(
            _side == Side.BUY ? price * _tokenQuantity <= _ETHquantity : price * _tokenQuantity >= _ETHquantity,
            "Rounding problem"
        );
        Side oppositeSide = _oppositeSide(_side);
        (bestOrderId, bestPrice) = getBestOrder(_tokenId, oppositeSide);
        // If possible, buy up to the specified price limit
        uint256 remainingQuantity = _tokenQuantity;
        while (
            (remainingQuantity > 0) &&
            ((_side == Side.BUY) ? price >= bestPrice : price <= bestPrice) &&
            (bestOrderId > 0)
        ) {
            uint256 quantityToBuy;
            if (orders[bestOrderId].quantity >= remainingQuantity) {
                quantityToBuy = remainingQuantity;
            } else {
                quantityToBuy = orders[bestOrderId].quantity;
            }
            _ETHquantity -= _executeOrder(bestOrderId, quantityToBuy);
            remainingQuantity -= quantityToBuy;
            if (remainingQuantity > 0) {
                (bestOrderId, bestPrice) = getBestOrder(_tokenId, oppositeSide);
            }
        }
        // If the order couldn't be filled, add the remaining quantity to buy orders
        if (_addOrderForRemaining && (remainingQuantity > 0)) {
            _addOrder(_tokenId, _side, msg.sender, price, remainingQuantity);
        }
        // Refund any remaining ETH from a buy order not added to order book
        if ((_side == Side.BUY) && !(_addOrderForRemaining)) {
            require(msg.value >= _ETHquantity, "Couldn't refund"); // just to be safe - don't refund more than what was sent
            bool success;
            (success, ) = msg.sender.call{value: _ETHquantity}("");
        }
    }

    /// @dev Executes one atomic order (transfers tokens and removes order).
    function _executeOrder(uint256 _orderId, uint256 _quantity) internal returns (uint256 ETHquantity) {
        if (_quantity > 0) {
            uint256 tokenId = orders[_orderId].tokenId;
            Side side = orders[_orderId].side;
            uint256 price = orders[_orderId].price;
            address sender = orders[_orderId].sender;
            bool success;
            (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981(TalentirNFT).royaltyInfo(
                tokenId,
                (price * _quantity)
            );
            uint256 talentirFee = calcTalentirFee((price * _quantity));
            require(price * _quantity > (royaltiesAmount + talentirFee), "Problem calculating fees");

            if (_quantity == orders[_orderId].quantity) {
                _removeOrder(_orderId);
            } else {
                orders[_orderId].quantity -= _quantity;
            }
            if (side == Side.BUY) {
                // Original order was a buy order: ETH has already been transferred into the contract
                // Distribute Fees from contract
                (success, ) = royaltiesReceiver.call{value: royaltiesAmount}("");
                (success, ) = talentirFeeWallet.call{value: talentirFee}("");
                // Caller is the seller - distribute to buyer first
                _safeTransferFrom(TalentirNFT, tokenId, msg.sender, sender, _quantity);
                // Seller receives price*quantity - fees
                (success, ) = msg.sender.call{value: (price * _quantity) - royaltiesAmount - talentirFee}("");
            } else {
                // Original order was a sell order: NFT has already been transferred into the contract
                // Distribute Fees
                (success, ) = royaltiesReceiver.call{value: royaltiesAmount}("");
                (success, ) = talentirFeeWallet.call{value: talentirFee}("");
                // Caller is the buyer - distribute to seller first
                (success, ) = msg.sender.call{value: (price * _quantity) - royaltiesAmount - talentirFee}("");
                _safeTransferFrom(TalentirNFT, tokenId, address(this), msg.sender, _quantity);
            }
            emit OrderExecuted(
                _orderId,
                msg.sender,
                price,
                royaltiesAmount,
                royaltiesReceiver,
                _quantity,
                orders[_orderId].quantity
            );
            return price * _quantity;
        }
    }

    /// @dev Add order to all data structures.
    function _addOrder(
        uint256 _tokenId,
        Side _side,
        address _sender,
        uint256 _price,
        uint256 _quantity
    ) internal {
        // Transfer tokens to this contract
        if (_side == Side.SELL) {
            _safeTransferFrom(TalentirNFT, _tokenId, _sender, address(this), _quantity);
        }
        // Check if orders already exist at that price, otherwise add tree entry
        if (!markets[_tokenId][_side].priceTree.exists(_price)) {
            markets[_tokenId][_side].priceTree.insert(_price);
        }
        // Add order to FIFO linked list at _price
        markets[_tokenId][_side].orderList[_price].push(nextOrderId, true);
        // add order to order mapping
        orders[nextOrderId] = Order({
            orderId: nextOrderId,
            side: _side,
            tokenId: _tokenId,
            sender: _sender,
            price: _price,
            quantity: _quantity
        });
        userOrders[_sender].push(nextOrderId, true);
        emit OrderAdded(nextOrderId, _tokenId, _side, _sender, _price, _quantity);
        unchecked {
            nextOrderId++;
        }
    }

    /// @dev Remove order from all data structures..
    function _removeOrder(uint256 _orderId) internal {
        uint256 price = orders[_orderId].price;
        uint256 tokenId = orders[_orderId].tokenId;
        Side side = orders[_orderId].side;
        // remove from userOrders linked list
        userOrders[orders[_orderId].sender].remove(_orderId);
        // remove order from linked list
        markets[tokenId][side].orderList[price].pop(false);
        // if this was the last remaining order, remove node from red-black tree
        if (!markets[tokenId][side].orderList[price].listExists()) {
            markets[tokenId][side].priceTree.remove(price);
        }
        // remove from order mapping
        delete (orders[_orderId]);
    }

    /// @dev Calls safeTransferFrom (ERC1155)
    function _safeTransferFrom(
        address _token,
        uint256 _tokenId,
        address _from,
        address _to,
        uint256 _quantity
    ) internal {
        bytes memory data;
        IERC1155(_token).safeTransferFrom(_from, _to, _tokenId, _quantity, data);
    }
}
