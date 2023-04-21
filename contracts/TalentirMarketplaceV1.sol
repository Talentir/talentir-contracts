// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// CONTRACTS ///
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/// LIBRARIES ///
import {RBTLibrary} from "./utils/RBTLibrary.sol";
import {LinkedListLibrary} from "./utils/LinkedListLibrary.sol";

/// INTERFACES ///
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @title Talentir Marketplace Contract
/// @author Christoph Siebenbrunner, Johannes Kares
/// @custom:security-contact office@talentir.com
contract TalentirMarketplaceV1 is Pausable, Ownable, ReentrancyGuard, ERC1155Holder {
    /// LIBRARIES ///
    using RBTLibrary for RBTLibrary.Tree;
    using LinkedListLibrary for LinkedListLibrary.LinkedList;

    /// TYPES ///
    struct OrderBook {
        RBTLibrary.Tree priceTree;
        mapping(uint256 => LinkedListLibrary.LinkedList) orderList;
    }

    enum Side {
        BUY,
        SELL
    }

    struct Order {
        uint256 orderId;
        uint256 tokenId;
        Side side;
        address sender;
        uint256 price;
        uint256 quantity;
    }

    // This is used for a "stack to deep" error optimization
    struct OrderExecutedLocals {
        address seller;
        address buyer;
        address tokenSender;
        uint256 payToSeller;
        uint256 royalties;
        address royaltiesReceiver;
        bool success;
        uint256 talentirFee;
    }

    /// MEMBERS ///
    /// @dev tokenId => Side => OrderBook
    mapping(uint256 => mapping(Side => OrderBook)) internal markets;
    /// @dev OrderId => Order
    mapping(uint256 => Order) public orders;
    address public talentirNFT;
    uint256 public talentirFeePercent;
    address public talentirFeeWallet;
    uint256 public nextOrderId = 1;
    uint256 internal constant PERCENT = 100_000;

    /// EVENTS ///
    event OrderAdded(
        uint256 indexed orderId,
        address indexed from,
        uint256 tokenId,
        Side side,
        uint256 price,
        uint256 quantity
    );

    event OrderExecuted(
        uint256 orderId,
        address indexed buyer,
        address indexed seller,
        uint256 paidToSeller,
        uint256 price,
        uint256 royalties,
        address indexed royaltiesReceiver,
        uint256 quantity,
        uint256 remainingQuantity
    );

    event OrderCancelled(
        uint256 indexed orderId, 
        address indexed from, 
        uint256 indexed tokenId, 
        Side side, 
        uint256 price, 
        uint256 quantity
    );

    event TalentirFeeSet(uint256 fee, address wallet);

    /// CONSTRUCTOR ///
    constructor(address _talentirNFT) {
        require(_talentirNFT != address(0), "Invalid address");
        require(IERC165(_talentirNFT).supportsInterface(type(IERC2981).interfaceId), "Must implement IERC2981");
        talentirNFT = _talentirNFT;
    }

    /// VIEW FUNCTIONS ///

    /// @notice Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
    /// @dev Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
    /// @param _tokenId token Id (ERC1155)
    /// @return uint256 Id of best order
    /// @return uint256 price of best order
    function getBestOrder(uint256 _tokenId, Side _side) public view returns (uint256, uint256) {
        uint256 price = _side == Side.BUY
            ? markets[_tokenId][_side].priceTree.last()
            : markets[_tokenId][_side].priceTree.first();
        uint256 bestOrderId;
        (, bestOrderId, ) = markets[_tokenId][_side].orderList[price].getNode(0);
        return (bestOrderId, price);
    }

    ///   @notice Computes the fee amount to be paid to Talentir for a transaction of size `_totalPaid`
    ///  @dev Computes the fee amount to be paid for a transaction of size `_totalPaid`.
    ///   @param _totalPaid price*volume
    ///   @return uint256 fee
    function calcTalentirFee(uint256 _totalPaid) public view returns (uint256) {
        return ((100 * talentirFeePercent * _totalPaid) / PERCENT) / 100;
    }

    /// PUBLIC FUNCTIONS ///

    /// @notice Sell `tokenQuantity` of token `tokenId` for min `ETHquantity` total price. (ERC1155)
    /// @dev Sell `tokenQuantity` of token `tokenId` for min `ETHquantity` total price. (ERC1155)
    /// @dev Price limit (`ETHquantity`) must always be included to prevent frontrunning.
    /// @dev Sender address must be able to receive Ether, otherwise funds may be lost (ony relevant if sent from a smart contract)
    /// @dev Does NOT work for ERC20!.
    /// @dev can emit multiple OrderExecuted events.
    /// @param _for recipient who will receive the token (msg.sender must be approved to send token on behalf of _for)
    /// @param tokenId token Id (ERC1155)
    /// @param ethQuantity total ETH demanded (quantity*minimum price per unit)
    /// @param tokenQuantity how much to sell in total of token
    /// @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
    function makeSellOrder(
        address _for,
        uint256 tokenId,
        uint256 ethQuantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused nonReentrant {
        _makeOrder(_for, tokenId, Side.SELL, ethQuantity, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /// @notice Buy `tokenQuantity` of token `tokenId` for max `msg.value` total price.
    /// @dev Buy `tokenQuantity` of token `tokenId` for max `msg.value` total price.
    /// @dev Price limit must always be included to prevent frontrunning.
    /// @dev Sender address must be able to receive Ether, otherwise funds may be lost (ony relevant if sent from a smart contract)
    /// @dev Does NOT work for ERC20!.
    /// @dev can emit multiple OrderExecuted events.
    /// @param _for recipient who will receive the token (can be different from msg.sender)
    /// @param tokenId token Id (ERC1155)
    /// @param tokenQuantity how much to buy in total of token
    /// @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
    /// @dev `msg.value` total ETH offered (quantity*maximum price per unit)
    function makeBuyOrder(
        address _for,
        uint256 tokenId,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external payable whenNotPaused nonReentrant {
        _makeOrder(_for, tokenId, Side.BUY, msg.value, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /// @notice Cancel orders: `orders`
    /// @dev Cancel orders: `orders`.
    /// @dev emits OrdersCancelled event.
    /// @param orderIds array of order Ids
    function cancelOrders(uint256[] calldata orderIds) external nonReentrant {
        bool success;
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            Order memory order = orders[orderId];
            require(msg.sender == order.sender, "Wrong user");
            Side side = order.side;
            uint256 price = order.price;
            uint256 quantity = order.quantity;
            uint256 tokenId = order.tokenId;
            _removeOrder(orderId);
            if (side == Side.BUY) {
                (success, ) = msg.sender.call{value: (price * quantity)}("");
            } else {
                _safeTransferFrom(talentirNFT, tokenId, address(this), msg.sender, quantity);
            }
            emit OrderCancelled(orderId, order.sender, tokenId, side, price, quantity);
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

    /// @dev Set the fee that Talentir will receive on each transaction.
    /// @dev emits DefaultFeeSet event.
    /// @dev fee capped at 10%
    /// @param _fee fee percent (100% = 100,000)
    /// @param _wallet address where Talentir fee will be sent to
    function setTalentirFee(uint256 _fee, address _wallet) external onlyOwner {
        require(_wallet != address(0), "Wallet is zero");
        require(_fee <= PERCENT / 10, "Must be <=10k"); // Talentir fee can never be higher than 10%
        talentirFeePercent = _fee;
        talentirFeeWallet = _wallet;
        emit TalentirFeeSet(_fee, _wallet);
    }

    /// INTERNAL FUNCTIONS ///

    /// @dev Return BUY for SELL or vice versa.
    function _oppositeSide(Side _side) internal pure returns (Side) {
        return (_side == Side.BUY) ? Side.SELL : Side.BUY;
    }

    /// @dev Make a limit order. Internally, all orders are limit orders to prevent frontrunning.
    function _makeOrder(
        address _sender,
        uint256 _tokenId,
        Side _side,
        uint256 _ethQuantity,
        uint256 _tokenQuantity,
        bool _addOrderForRemaining
    ) internal {
        if (_side == Side.SELL) {
            require(
                (_sender == msg.sender) || (IERC1155(talentirNFT).isApprovedForAll(_sender, msg.sender)),
                "Not allowed"
            );
        }
        require(_ethQuantity > 0, "Price must be positive");
        require(_tokenQuantity > 0, "Token quantity must be positive");
        require(_tokenQuantity <= 1_000_000, "Token quantity too high");
        uint256 price = _ethQuantity / _tokenQuantity;
        require(price > 0, "Rounding problem");
        uint256 bestPrice;
        uint256 bestOrderId;
        uint256 ethQuantityExecuted;
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
            ethQuantityExecuted = _executeOrder(_sender, bestOrderId, quantityToBuy);
            remainingQuantity -= quantityToBuy;
            if ((_side == Side.BUY) && !(_addOrderForRemaining)) {
                _ethQuantity -= ethQuantityExecuted;
            }
            if (remainingQuantity > 0) {
                (bestOrderId, bestPrice) = getBestOrder(_tokenId, oppositeSide);
            }
        }
        // If the order couldn't be filled, add the remaining quantity to buy orders
        if (_addOrderForRemaining && (remainingQuantity > 0)) {
            _addOrder(_tokenId, _side, _sender, price, remainingQuantity);
        }
        // Refund any remaining ETH from a buy order not added to order book
        if ((_side == Side.BUY) && !(_addOrderForRemaining)) {
            require(msg.value >= _ethQuantity, "Couldn't refund"); // just to be safe - don't refund more than what was sent
            bool success;
            (success, ) = _sender.call{value: _ethQuantity}("");
        }
    }

    /// @dev Executes one atomic order (transfers tokens and removes order).
    function _executeOrder(
        address _sender,
        uint256 _orderId,
        uint256 _quantity
    ) internal returns (uint256 ethQuantity) {
        // This is an optimization to avoid the famous "stack to deep" error.
        OrderExecutedLocals memory locals;

        Order memory order = orders[_orderId];

        (locals.royaltiesReceiver, locals.royalties) = IERC2981(talentirNFT).royaltyInfo(
            order.tokenId,
            (order.price * _quantity)
        );

        locals.talentirFee = calcTalentirFee((order.price * _quantity));
        require(order.price * _quantity > (locals.royalties + locals.talentirFee), "Problem calculating fees");

        if (_quantity == order.quantity) {
            _removeOrder(_orderId);
        } else {
            orders[_orderId].quantity -= _quantity;
        }

        if (order.side == Side.BUY) {
            // Caller is the seller
            locals.seller = _sender;
            locals.buyer = order.sender;
            locals.tokenSender = _sender;
        } else {
            // Caller is the buyer
            locals.seller = order.sender;
            locals.buyer = _sender;
            locals.tokenSender = address(this);
        }

        locals.payToSeller = (order.price * _quantity) - locals.royalties - locals.talentirFee;

        _safeTransferFrom(talentirNFT, order.tokenId, locals.tokenSender, locals.buyer, _quantity);
        (locals.success, ) = locals.seller.call{value: locals.payToSeller}("");
        (locals.success, ) = locals.royaltiesReceiver.call{value: locals.royalties}("");
        (locals.success, ) = talentirFeeWallet.call{value: locals.talentirFee}("");

        emit OrderExecuted(
            _orderId, // orderId
            locals.buyer, // buyer
            locals.seller, // seller
            locals.payToSeller, // paidToSeller
            order.price, // price
            locals.royalties, // royalties
            locals.royaltiesReceiver, // royaltiesReceiver
            _quantity, // quantity
            orders[_orderId].quantity // remainingQuantity
        );

        return order.price * _quantity;
    }

    /// @dev Add order to all data structures.
    function _addOrder(uint256 _tokenId, Side _side, address _sender, uint256 _price, uint256 _quantity) internal {
        // Transfer tokens to this contract
        if (_side == Side.SELL) {
            _safeTransferFrom(talentirNFT, _tokenId, _sender, address(this), _quantity);
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

        emit OrderAdded(nextOrderId, _sender, _tokenId, _side, _price, _quantity);
        unchecked {
            nextOrderId++;
        }
    }

    /// @dev Remove order from all data structures..
    function _removeOrder(uint256 _orderId) internal {
        uint256 price = orders[_orderId].price;
        uint256 tokenId = orders[_orderId].tokenId;
        Side side = orders[_orderId].side;

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
