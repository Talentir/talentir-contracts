// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

/// CONTRACTS ///
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {PullPayment} from "@openzeppelin/contracts/security/PullPayment.sol";
import {ERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Receiver.sol";
import {ERC1155PullTransfer} from "./utils/ERC1155PullTransfer.sol";

/// LIBRARIES ///
import {RBTLibrary} from "./libraries/RBTLibrary.sol";
import {LinkedListLibrary} from "./libraries/LinkedListLibrary.sol";

/// INTERFACES ///
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// @title Talentir Marketplace Contract
/// @author Christoph Siebenbrunner, Johannes Kares
/// @custom:security-contact office@talentir.com
contract TalentirMarketplaceV1 is
    Pausable,
    Ownable,
    ReentrancyGuard,
    ERC1155Receiver,
    PullPayment,
    ERC1155PullTransfer
{
    /// LIBRARIES ///

    using RBTLibrary for RBTLibrary.Tree;
    using LinkedListLibrary for LinkedListLibrary.LinkedList;

    /// TYPES ///

    /// @notice Side of order (buy=0, sell=1)
    enum Side {
        BUY,
        SELL
    }

    /// @notice Order struct
    /// @param orderId Id of order
    /// @param tokenId Id of token (ERC1155)
    /// @param side Side of order (buy=0, sell=1)
    /// @param sender Address of sender
    /// @param price Price of order. This is the price for 100% of the quantity.
    /// @param quantity Remaining quantity of order
    struct Order {
        uint256 orderId;
        uint256 tokenId;
        Side side;
        address sender;
        uint256 price;
        uint256 quantity;
    }

    /// @dev Internal OrderBook struct representing on specific tokenId
    struct OrderBook {
        /// @dev The price tree. Contains all available sorted prices for the token
        RBTLibrary.Tree priceTree;
        /// @dev price -> Linkedlist of orderIds. Each list contains all orders at specific price.
        mapping(uint256 => LinkedListLibrary.LinkedList) orderList;
    }

    /// @dev Internal Struct. This is used for a "stack to deep" error optimization
    struct OrderExecutedLocals {
        address seller;
        address buyer;
        address tokenSender;
        uint256 payToSeller;
        uint256 royalties;
        address royaltiesReceiver;
        bool success;
        uint256 talentirFee;
        uint256 remainingQuantity;
        uint256 quantity;
        bool useAsyncTransfer;
        uint256 cost;
    }

    /// MEMBERS ///

    /// @notice orderId => Order
    mapping(uint256 => Order) public orders;

    /// @notice Address of the corresponding ERC1155 contract
    address public talentirToken;

    /// @notice Current Marketplace Fee. 100% => 100 000
    uint256 public talentirFeePercent;

    /// @notice Address of the wallet receiving the marketplace fee
    address public talentirFeeWallet;

    /// @notice The constant represnting 100%
    uint256 public constant ONE_HUNDRED_PERCENT = 100_000;

    /// @notice This is the price factor. Public prices in this contract always represent 100% of
    /// the available quantity. This can be used to calculate the price for a single token.
    uint256 public constant PRICE_FACTOR = 1_000_000;

    /// @dev the next available orderId
    uint256 private _nextOrderId = 1;

    /// @dev tokenId => Side => OrderBook
    mapping(uint256 => mapping(Side => OrderBook)) private _markets;

    /// @dev private flag to enable receiving tokens
    bool private _contractCanReceiveToken = false;

    /// EVENTS ///

    /// @notice Event emitted when a new order is added
    /// @param orderId Id of order
    /// @param from Address of sender
    /// @param tokenId Id of token (ERC1155)
    /// @param side Side of order (buy=0, sell=1)
    /// @param price Price of order. This is the price for 100% of the quantity.
    /// @param quantity Quantity of order
    event OrderAdded(
        uint256 indexed orderId,
        address indexed from,
        uint256 tokenId,
        Side side,
        uint256 price,
        uint256 quantity
    );

    /// @notice Event emitted when an order is executed
    /// @param orderId Id of order
    /// @param buyer Address of buyer
    /// @param seller Address of seller
    /// @param paidToSeller Amount of token paid to seller (in wei)
    /// @param price Price of order. This is the price for 100% of the quantity.
    /// @param royalties Amount of token paid to royalties receiver (in wei)
    /// @param royaltiesReceiver Address of royalties receiver
    /// @param quantity Executed quantity of order
    /// @param remainingQuantity Remaining quantity in order
    /// @param asyncTransfer If true, the transfer of the token / ETH was executed async
    event OrderExecuted(
        uint256 orderId,
        address indexed buyer,
        address indexed seller,
        uint256 paidToSeller,
        uint256 price,
        uint256 royalties,
        address indexed royaltiesReceiver,
        uint256 quantity,
        uint256 remainingQuantity,
        bool asyncTransfer
    );

    /// @notice Event emitted when an order is cancelled
    /// @param orderId Id of order
    /// @param from Address of sender
    /// @param tokenId Id of token (ERC1155)
    /// @param side Side of order (buy=0, sell=1)
    /// @param price Price of order. This is the price for 100% of the quantity.
    /// @param quantity Quantity of order that was cancelled
    /// @param asyncTransfer If true, the refund of the token / ETH was executed async
    event OrderCancelled(
        uint256 indexed orderId,
        address indexed from,
        uint256 indexed tokenId,
        Side side,
        uint256 price,
        uint256 quantity,
        bool asyncTransfer
    );

    /// @notice Event emitted when the fee is changed
    /// @param fee New fee (100% => 100 000)
    /// @param wallet New wallet that receives the fee
    event TalentirFeeSet(uint256 fee, address indexed wallet);

    /// CONSTRUCTOR ///
    /// @param initialTalentirToken Address of the corresponding ERC1155 contract
    constructor(address initialTalentirToken) ERC1155PullTransfer(initialTalentirToken) {
        require(initialTalentirToken != address(0), "Invalid address");
        require(IERC165(initialTalentirToken).supportsInterface(type(IERC2981).interfaceId), "Must implement IERC2981");
        require(IERC165(initialTalentirToken).supportsInterface(type(IERC1155).interfaceId), "Must implement IERC1155");
        talentirToken = initialTalentirToken;
    }

    /// PUBLIC FUNCTIONS ///

    /// @notice Return the best `side` (buy=0, sell=1) order for token `tokenId`
    /// @param tokenId token Id (ERC1155)
    /// @param side Side of order (buy=0, sell=1)
    /// @return orderId of best order
    /// @return price price of best order. This is the price for 100% of the quantity.
    function getBestOrder(uint256 tokenId, Side side) public view returns (uint256 orderId, uint256 price) {
        price = side == Side.BUY ? _markets[tokenId][side].priceTree.last() : _markets[tokenId][side].priceTree.first();

        (, uint256 bestOrderId, ) = _markets[tokenId][side].orderList[price].getNode(0);
        orderId = bestOrderId;
    }

    /// @notice Computes the fee amount to be paid to Talentir for a transaction of size `totalPaid`
    /// @param totalPaid price*volume
    /// @return uint256 fee
    function calcTalentirFee(uint256 totalPaid) public view returns (uint256) {
        return (talentirFeePercent * totalPaid) / ONE_HUNDRED_PERCENT;
    }

    /// @notice Sell `tokenQuantity` of token `tokenId` for min `ethQuantity` total price. (ERC1155)
    /// @dev Price limit (`ethQuantity`) must always be included to prevent frontrunning.
    /// @dev Can emit multiple OrderExecuted events.
    /// @param from address that will send the ERC1155 and receive the ETH on successful sale
    /// (msg.sender must be approved to send token on behalf of for)
    /// @param tokenId token Id (ERC1155)
    /// @param ethQuantity total ETH demanded (quantity*minimum price per unit)
    /// @param tokenQuantity how much to sell in total of token
    /// @param addUnfilledOrderToOrderbook add order to order list at a limit price of ethQuantity/tokenQuantity if it can't be filled
    /// @param useAsyncTransfer use async transfer for ETH and ERC1155 transfers. Typically should
    /// be false but can be useful in case the ETH or ERC1155 transfer is blocked by the recipient
    function makeSellOrder(
        address from,
        uint256 tokenId,
        uint256 ethQuantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook,
        bool useAsyncTransfer
    ) external whenNotPaused nonReentrant {
        _makeOrder(from, tokenId, Side.SELL, ethQuantity, tokenQuantity, addUnfilledOrderToOrderbook, useAsyncTransfer);
    }

    /// @notice Buy `tokenQuantity` of token `tokenId` for max `msg.value` total price.
    /// @dev Price limit must always be included to prevent frontrunning.
    /// @dev Can emit multiple OrderExecuted events.
    /// @param from address that will receive the ERC1155 token on successfull purchase
    /// @param tokenId token Id (ERC1155)
    /// @param tokenQuantity how much to buy in total of token
    /// @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
    /// @param useAsyncTransfer use async transfer for ETH and ERC1155 transfers. Typically should
    /// be false but can be useful in case the ETH or ERC1155 transfer is blocked by the recipient
    /// @dev `msg.value` total ETH offered (quantity*maximum price per unit)
    function makeBuyOrder(
        address from,
        uint256 tokenId,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook,
        bool useAsyncTransfer
    ) external payable whenNotPaused nonReentrant {
        _makeOrder(from, tokenId, Side.BUY, msg.value, tokenQuantity, addUnfilledOrderToOrderbook, useAsyncTransfer);
    }

    /// @notice Cancel orders: `orders`.
    /// This function may be front-runnable. This may be abused when the order owner wants
    /// to cancel one or more unfavorable market orders. Consider using private mempools, i.e.
    /// flashots.
    /// @dev emits OrdersCancelled event.
    /// @param orderIds array of order Ids
    /// @param useAsyncTransfer use async transfer for ETH and ERC1155 refunds. Typically should
    /// be false but can be useful in case the ETH or ERC1155 refund is blocked by the recipient
    function cancelOrders(uint256[] calldata orderIds, bool useAsyncTransfer) external nonReentrant {
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            Order memory order = orders[orderId];
            require(msg.sender == order.sender || msg.sender == owner(), "Wrong user");

            Side side = order.side;
            uint256 price = order.price;
            uint256 quantity = order.quantity;
            uint256 tokenId = order.tokenId;

            _removeOrder(orderId);

            if (useAsyncTransfer) {
                if (side == Side.BUY) {
                    _asyncTransfer(order.sender, (price * quantity) / PRICE_FACTOR);
                } else {
                    _asyncTokenTransferFrom(tokenId, address(this), order.sender, quantity);
                }
            } else {
                if (side == Side.BUY) {
                    _ethTransfer(order.sender, (price * quantity) / PRICE_FACTOR);
                } else {
                    _tokenTransferFrom(tokenId, address(this), order.sender, quantity);
                }
            }

            emit OrderCancelled(orderId, order.sender, tokenId, side, price, quantity, useAsyncTransfer);
        }
    }

    /// RESTRICTED PUBLIC FUNCTIONS ///

    /// @notice Pause contract.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause contract.
    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Set the fee that Talentir will receive on each transaction.
    /// @dev emits DefaultFeeSet event.
    /// @dev fee capped at 10%
    /// @param fee fee percent (100% = 100 000)
    /// @param wallet address where Talentir fee will be sent to
    function setTalentirFee(uint256 fee, address wallet) external onlyOwner {
        require(wallet != address(0), "Wallet is zero");
        require(fee <= ONE_HUNDRED_PERCENT / 10, "Must be <= 10%"); // Talentir fee can never be higher than 10%
        talentirFeePercent = fee;
        talentirFeeWallet = wallet;

        emit TalentirFeeSet(fee, wallet);
    }

    /// PRIVATE / INTERNAL FUNCTIONS ///

    /// @dev Return BUY for SELL or vice versa.
    function _oppositeSide(Side side) internal pure returns (Side) {
        return (side == Side.BUY) ? Side.SELL : Side.BUY;
    }

    /// @dev Make a limit order. Internally, all orders are limit orders to prevent frontrunning.
    function _makeOrder(
        address sender,
        uint256 tokenId,
        Side side,
        uint256 ethQuantity,
        uint256 tokenQuantity,
        bool addOrderForRemaining,
        bool useAsyncTransfer
    ) private {
        if (side == Side.SELL) {
            require(
                (sender == msg.sender) || (IERC1155(talentirToken).isApprovedForAll(sender, msg.sender)),
                "Not allowed"
            );
        }

        require(ethQuantity > 0, "Price must be positive");
        require(tokenQuantity > 0, "Token quantity must be positive");
        require(tokenQuantity <= 1_000_000, "Token quantity too high");

        uint256 price = (ethQuantity * PRICE_FACTOR) / tokenQuantity;
        require(price > 0, "Rounding problem");

        uint256 ethQuantityExecuted;
        Side oppositeSide = _oppositeSide(side);
        (uint256 bestOrderId, uint256 bestPrice) = getBestOrder(tokenId, oppositeSide);

        // If possible, buy up to the specified price limit
        uint256 remainingQuantity = tokenQuantity;

        while (
            (remainingQuantity > 0) &&
            ((side == Side.BUY) ? price >= bestPrice : price <= bestPrice) &&
            (bestOrderId > 0)
        ) {
            uint256 quantityToBuy;
            if (orders[bestOrderId].quantity >= remainingQuantity) {
                quantityToBuy = remainingQuantity;
            } else {
                quantityToBuy = orders[bestOrderId].quantity;
            }

            ethQuantityExecuted = _executeOrder(sender, bestOrderId, quantityToBuy, useAsyncTransfer);
            remainingQuantity -= quantityToBuy;

            if ((side == Side.BUY) && !(addOrderForRemaining)) {
                ethQuantity -= ethQuantityExecuted;
            }

            if (remainingQuantity > 0) {
                (bestOrderId, bestPrice) = getBestOrder(tokenId, oppositeSide);
            }
        }

        // If the order couldn't be filled, add the remaining quantity to buy orders
        if (addOrderForRemaining && (remainingQuantity > 0)) {
            _addOrder(tokenId, side, sender, price, remainingQuantity);
        }

        // Refund any remaining ETH from a buy order not added to order book
        if ((side == Side.BUY) && !(addOrderForRemaining)) {
            require(msg.value >= ethQuantity, "Couldn't refund"); // just to be safe - don't refund more than what was sent

            // Safe to directly send ETH. In the worst case the transaction just doesn't go through.
            _ethTransfer(sender, ethQuantity);
        }
    }

    /// @dev Executes one atomic order (transfers tokens and removes order).
    function _executeOrder(
        address sender,
        uint256 orderId,
        uint256 quantity,
        bool useAsyncTransfer
    ) private returns (uint256 ethQuantity) {
        // This is an optimization to avoid the famous "stack to deep" error.
        OrderExecutedLocals memory locals;
        Order memory order = orders[orderId];

        locals.quantity = quantity;
        locals.useAsyncTransfer = useAsyncTransfer;
        locals.cost = (order.price * quantity) / PRICE_FACTOR;

        (locals.royaltiesReceiver, locals.royalties) = IERC2981(talentirToken).royaltyInfo(order.tokenId, locals.cost);

        locals.talentirFee = calcTalentirFee(locals.cost);

        require(locals.cost > (locals.royalties + locals.talentirFee), "Problem calculating fees");

        if (quantity == order.quantity) {
            _removeOrder(orderId);
        } else {
            orders[orderId].quantity -= quantity;
            locals.remainingQuantity = orders[orderId].quantity;
        }

        if (order.side == Side.BUY) {
            // Caller is the seller
            locals.seller = sender;
            locals.buyer = order.sender;
            locals.tokenSender = sender;
        } else {
            // Caller is the buyer
            locals.seller = order.sender;
            locals.buyer = sender;
            locals.tokenSender = address(this);
        }

        locals.payToSeller = locals.cost - locals.royalties - locals.talentirFee;

        if (useAsyncTransfer) {
            _asyncTokenTransferFrom(order.tokenId, locals.tokenSender, locals.buyer, quantity);
            _asyncTransfer(locals.seller, locals.payToSeller);
            _asyncTransfer(locals.royaltiesReceiver, locals.royalties);
            _asyncTransfer(talentirFeeWallet, locals.talentirFee);
        } else {
            _tokenTransferFrom(order.tokenId, locals.tokenSender, locals.buyer, quantity);
            _ethTransfer(locals.seller, locals.payToSeller);
            _ethTransfer(locals.royaltiesReceiver, locals.royalties);
            _ethTransfer(talentirFeeWallet, locals.talentirFee);
        }

        _emitOrderExecutedEvent(locals, order);

        return locals.cost;
    }

    /// @dev This function exists to use less local variables and avoid the "stack to deep" error.
    function _emitOrderExecutedEvent(OrderExecutedLocals memory locals, Order memory order) private {
        emit OrderExecuted(
            order.orderId,
            locals.buyer,
            locals.seller,
            locals.payToSeller,
            order.price,
            locals.royalties,
            locals.royaltiesReceiver,
            locals.quantity,
            locals.remainingQuantity,
            locals.useAsyncTransfer
        );
    }

    /// @dev Add order to all data structures.
    function _addOrder(uint256 tokenId, Side side, address sender, uint256 price, uint256 quantity) private {
        // Transfer tokens to this contract
        if (side == Side.SELL) {
            _tokenTransferFrom(tokenId, sender, address(this), quantity);
        }

        // Check if orders already exist at that price, otherwise add tree entry
        if (!_markets[tokenId][side].priceTree.exists(price)) {
            _markets[tokenId][side].priceTree.insert(price);
        }

        // Add order to FIFO linked list at price
        _markets[tokenId][side].orderList[price].push(_nextOrderId, true);

        // add order to order mapping
        orders[_nextOrderId] = Order({
            orderId: _nextOrderId,
            side: side,
            tokenId: tokenId,
            sender: sender,
            price: price,
            quantity: quantity
        });

        emit OrderAdded(_nextOrderId, sender, tokenId, side, price, quantity);

        unchecked {
            _nextOrderId++;
        }
    }

    /// @dev Remove order from all data structures.
    function _removeOrder(uint256 orderId) private {
        uint256 price = orders[orderId].price;
        uint256 tokenId = orders[orderId].tokenId;
        Side side = orders[orderId].side;

        // remove order from linked list
        _markets[tokenId][side].orderList[price].remove(orderId);

        // if this was the last remaining order, remove node from red-black tree
        if (!_markets[tokenId][side].orderList[price].listExists()) {
            _markets[tokenId][side].priceTree.remove(price);
        }

        // remove from order mapping
        delete (orders[orderId]);
    }

    /// @dev Calls safeTransferFrom (ERC1155)
    function _tokenTransferFrom(uint256 tokenId, address from, address to, uint256 quantity) private {
        _contractCanReceiveToken = true;
        bytes memory data;
        IERC1155(talentirToken).safeTransferFrom(from, to, tokenId, quantity, data);
        _contractCanReceiveToken = false;
    }

    /// @dev Initiates an asynchronous transfer of tokens.
    function _asyncTokenTransferFrom(
        uint256 tokenId,
        address from,
        address to,
        uint256 quantity
    ) internal virtual override {
        _contractCanReceiveToken = true;
        super._asyncTokenTransferFrom(tokenId, from, to, quantity);
        _contractCanReceiveToken = false;
    }

    /// @dev Initiates an direct transfer of ETH.
    function _ethTransfer(address to, uint256 weiCount) private {
        (bool success, ) = to.call{value: weiCount}("");
        require(success, "Transfer failed");
    }

    /// OVERRIDE FUNCTIONS ///

    /// @dev This contract can only receive tokens when executing an order.
    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    ) public virtual override returns (bytes4) {
        require(_contractCanReceiveToken, "Cannot receive");

        return this.onERC1155Received.selector;
    }

    /// @dev This contract can't receive batch transfers.
    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) public virtual override returns (bytes4) {
        return 0;
    }
}
