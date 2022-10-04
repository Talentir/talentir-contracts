// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

/// CONTRACTS ///
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

/// LIBRARIES ///
import "./RBTLibrary.sol";
import "./LinkedListLibrary.sol";

/// INTERFACES ///
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// TYPES ///
import {Side, Order} from "./OrderTypes.sol";

// TODO: whitelist ODER nur ein Vertrag
// TODO: buyer fees rausnehmen, ERC2981-royalties-Kompatibilitaet ueberlegen

contract Marketplace is Pausable, AccessControl, ReentrancyGuard, ERC1155Holder {
    /// LIBRARIES ///
    using RBTLibrary for RBTLibrary.Tree;
    using LinkedListLibrary for LinkedListLibrary.LinkedList;

    /// TYPES ///
    struct OrderBook {
        RBTLibrary.Tree priceTree;
        mapping(uint256 => LinkedListLibrary.LinkedList) orderList;
    }

    /// ROLES ///
    bytes32 public constant MODERATOR_ROLE = keccak256("MODERATOR_ROLE");

    /// CONTRACTS ///
    IERC20 public WETHtoken;

    /// STATE ///
    mapping(address => mapping(uint256 => mapping(Side => OrderBook))) markets;
    /// @dev Token => tokenId => Side => OrderBook
    mapping(uint256 => Order) public orders; /// @dev OrderId => Order
    mapping(address => LinkedListLibrary.LinkedList) userOrders; /// @dev User => Linked list of open orders by user
    mapping(address => mapping(Side => uint256)) marketFees; /// @dev Token => Side => Fee
    mapping(address => mapping(Side => bool)) marketFeeSet; /// @dev Token => Side => Bool Fee Set
    mapping(Side => uint256) defaultFee; /// @dev Side => Fee
    uint256 public nextOrderId;
    uint256 internal constant PERCENT = 100000;
    uint256 internal constant PRICE_FACTOR = 1000000000;
    uint256 public roundingFactor = 1;
    address[] public feeAddresses;
    uint256[] public feePercents;

    /// EVENTS ///
    event OrderAdded(
        uint256 indexed orderId,
        address indexed token,
        uint256 tokenId,
        Side side,
        address indexed sender,
        uint256 price,
        uint256 quantity
    );
    event OrderExecuted(
        uint256 indexed orderId,
        address indexed initiator,
        uint256 quantity,
        uint256 remainingQuantity
    );
    event OrdersCancelled(uint256[] orderIds);
    event DecimalsSet(uint32 decimals);
    event DefaultFeeSet(Side side, uint256 fee);
    event MarketFeeSet(address token, Side side, uint256 fee);

    /// CONSTRUCTOR ///

    constructor(address _WETHaddress, uint256 _nextOrderId) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MODERATOR_ROLE, msg.sender);
        nextOrderId = _nextOrderId;
        WETHtoken = IERC20(_WETHaddress);
    }

    /// VIEW FUNCTIONS ///
    /**
        @notice Return the best `_side` (buy=0, sell=1) order for token `_token` (ERC1155)
        @dev Return the best `_side` (buy=0, sell=1) order for token `_token` (ERC1155). 
        @param _token token address
        @param _tokenId token Id (ERC1155)
        @return uint256 Id of best order
        @return uint256 price of best order (in units of 10^(27-tokenDecimals))
     */
    function getBestOrder(
        address _token,
        uint256 _tokenId,
        Side _side
    ) public view returns (uint256, uint256) {
        uint256 price = _side == Side.BUY
            ? markets[_token][_tokenId][_side].priceTree.last()
            : markets[_token][_tokenId][_side].priceTree.first();
        uint256 bestOrderId;
        (, bestOrderId, ) = markets[_token][_tokenId][_side].orderList[price].getNode(0);
        return (bestOrderId, price);
    }

    /**
        @notice Computes the fee amount to be paid for a transaction of size `_quantity`
        @dev Computes the fee amount to be paid for a transaction of size `_quantity`. 
        @param _token token address
        @param _side BUY (0) or SELL (1)
        @param _quantity how much is traded (in units of 10^tokenDecimals)
        @return uint256 fee (in units of 10^(27-tokenDecimals))
     */
    function calcFee(
        address _token,
        Side _side,
        uint256 _quantity
    ) public view returns (uint256) {
        uint256 fee;
        if (marketFeeSet[_token][_side]) {
            fee = marketFees[_token][_side];
        } else {
            fee = defaultFee[_side];
        }
        return ((100 * fee * _quantity) / PERCENT) / 100;
    }

    /// @dev See {IERC165-supportsInterface}.
    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC1155Receiver)
        returns (bool)
    {
        return
            interfaceId == type(IAccessControl).interfaceId ||
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    /// PUBLIC FUNCTIONS ///

    /**
        @notice Sell `tokenQuantity` of `token`:`tokenId` for min `WETHquantity` total price. (ERC1155)
        @dev Sell `tokenQuantity` of `token`:`tokenId` for min `WETHquantity` total price. (ERC1155)
        @dev Price limit must always be included to prevent frontrunning. 
        @dev price will be rounded to 10^(18-roundingFactor) decimal places!
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param token token address
        @param tokenId token Id (ERC1155)
        @param WETHquantity total WETH demanded (quantity*minimum price per unit, in units of 10^18)
        @param tokenQuantity how much to sell in total of token (in units of 10^tokenDecimals)
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
     */
    function makeSellOrderERC1155(
        address token,
        uint256 tokenId,
        uint256 WETHquantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused {
        _makeOrder(token, tokenId, Side.SELL, WETHquantity, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /**
        @notice Buy `tokenQuantity` of `token`:`tokenId` for max `WETHquantity` total price. (ERC1155)
        @dev Buy `tokenQuantity` of `token`:`tokenId` for max `WETHquantity` total price. (ERC1155)
        @dev Price limit must always be included to prevent frontrunning. 
        @dev price will be rounded to 10^(18-roundingFactor) decimal places!
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param token token address
        @param tokenId token Id (ERC1155)
        @param WETHquantity total WETH offered (quantity*maximum price per unit, in units of 10^18)
        @param tokenQuantity how much to buy in total of token (in units of 10^tokenDecimals)
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
     */
    function makeBuyOrderERC1155(
        address token,
        uint256 tokenId,
        uint256 WETHquantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused {
        _makeOrder(token, tokenId, Side.BUY, WETHquantity, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /**
        @notice Cancel orders: `orders`
        @dev Cancel orders: `orders`. 
        @dev emits OrdersCancelled event. 
        @param orderIds array of order Ids
     */
    function cancelOrders(uint256[] calldata orderIds) external nonReentrant {
        for (uint256 i = 0; i < orderIds.length; i++) {
            uint256 orderId = orderIds[i];
            require(msg.sender == orders[orderId].sender, "Wrong user");
            Side side = orders[orderId].side;
            uint256 price = orders[orderId].price;
            uint256 quantity = orders[orderId].quantity;
            address token = orders[orderId].token;
            uint256 tokenId = orders[orderId].tokenId;
            _removeOrder(orderId);
            if (side == Side.BUY) {
                WETHtoken.transfer(msg.sender, (price * quantity) / PRICE_FACTOR);
            } else {
                _safeTransferOut(token, tokenId, msg.sender, quantity);
            }
        }
        emit OrdersCancelled(orderIds);
    }

    /// RESTRICTED PUBLIC FUNCTIONS ///

    /// @dev Pause contract.
    function pause() external onlyRole(MODERATOR_ROLE) {
        _pause();
    }

    /// @dev Unpause contract.
    function unpause() external onlyRole(MODERATOR_ROLE) {
        _unpause();
    }

    /**
        @dev Sets the addresses and percentages that will receive fees.
        @dev emits DecimalsSet event
        @param _feeAddresses An array of addresses to send fees to.
        @param _feePercents An array of percentages for the addresses to get.
     */
    function setFees(address[] memory _feeAddresses, uint256[] memory _feePercents) external onlyRole(MODERATOR_ROLE) {
        // Make sure the length of the two arrays match.
        require(_feeAddresses.length == _feePercents.length, "length mismatch");

        // Make sure the percentages all add up to 10000.
        uint256 total = 0;
        for (uint256 i = 0; i < _feePercents.length; i++) {
            total = total + _feePercents[i];
        }

        require(total == 10000, "invalid fee amounts");

        // Set the fees.
        feePercents = _feePercents;
        feeAddresses = _feeAddresses;
    }

    /**
        @dev Set default fee.
        @dev emits DefaultFeeSet event. 
        @param _side BUY (0) or SELL (1)
        @param _fee fee percent (100% = 100,000)
     */
    function setDefaultFee(Side _side, uint256 _fee) external onlyRole(MODERATOR_ROLE) {
        require(_fee <= PERCENT / 10, "Must be <10k");
        defaultFee[_side] = _fee;
        emit DefaultFeeSet(_side, _fee);
    }

    /**
        @dev Set market-specific fee.
        @dev emits MarketFeeSet event. 
        @param _token token contract address (all tokenIds for ERC1155 have the same fee)
        @param _side BUY (0) or SELL (1)
        @param _fee fee percent (100% = 100,000)
     */
    function setMarketFee(
        address _token,
        Side _side,
        uint256 _fee
    ) external onlyRole(MODERATOR_ROLE) {
        require(_fee <= PERCENT / 10, "Must be <10k");
        marketFeeSet[_token][_side] = true;
        marketFees[_token][_side] = _fee;
        emit MarketFeeSet(_token, _side, _fee);
    }

    /**
        @dev Set significant decimal places.
        @dev emits DecimalsSet event. 
        @param _decimals uint32 number of significant decimal places
     */
    function setDecimals(uint32 _decimals) external onlyRole(MODERATOR_ROLE) {
        require(_decimals <= 18, "Too many digits");
        roundingFactor = 10**(18 - _decimals);
        emit DecimalsSet(_decimals);
    }

    /// INTERNAL FUNCTIONS ///

    /// @dev Return BUY for SELL or vice versa.
    function _oppositeSide(Side _side) internal pure returns (Side) {
        return Side(1 - uint8(_side));
    }

    /// @dev Make a limit order. Internally, all orders are limit orders to prevent front running.
    function _makeOrder(
        address _token,
        uint256 _tokenId,
        Side _side,
        uint256 _WETHquantity,
        uint256 _tokenQuantity,
        bool _addOrderForRemaining
    ) internal {
        uint256 bestPrice;
        uint256 bestOrderId;
        uint256 price = (PRICE_FACTOR * _WETHquantity) / _tokenQuantity;
        price = (price / roundingFactor) * roundingFactor;
        require(
            _side == Side.BUY
                ? price * _tokenQuantity <= _WETHquantity * PRICE_FACTOR
                : price * _tokenQuantity >= _WETHquantity * PRICE_FACTOR,
            "Rounding problem"
        );
        Side oppositeSide = _oppositeSide(_side);
        (bestOrderId, bestPrice) = getBestOrder(_token, _tokenId, oppositeSide);
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
            _executeOrder(bestOrderId, quantityToBuy);
            remainingQuantity -= quantityToBuy;
            if (remainingQuantity > 0) {
                (bestOrderId, bestPrice) = getBestOrder(_token, _tokenId, oppositeSide);
            }
        }
        // If the order couldn't be filled, add the remaining quantity to buy orders
        if (_addOrderForRemaining && (remainingQuantity > 0)) {
            _addOrder(_token, _tokenId, _side, msg.sender, price, remainingQuantity);
        }
    }

    /// @dev Executes one atomic order (transfers tokens and removes order).
    function _executeOrder(uint256 _orderId, uint256 _quantity) internal {
        if (_quantity > 0) {
            address token = orders[_orderId].token;
            uint256 tokenId = orders[_orderId].tokenId;
            Side side = orders[_orderId].side;
            uint256 price = orders[_orderId].price;
            address sender = orders[_orderId].sender;
            uint256 sellerFee = calcFee(token, Side.SELL, (price * _quantity) / PRICE_FACTOR);
            if (_quantity == orders[_orderId].quantity) {
                _removeOrder(_orderId);
            } else {
                orders[_orderId].quantity -= _quantity;
            }
            if (side == Side.BUY) {
                // If the order in the order book was a buy order, the buyer fee has already been distributed
                _distributeWETH(sellerFee);
                _safeTransferFrom(token, tokenId, msg.sender, sender, _quantity);
                WETHtoken.transfer(msg.sender, (price * _quantity) / PRICE_FACTOR - sellerFee);
            } else {
                // If the original order was a sell order, both buyer and seller fees need to be distributed
                _distributeWETHFrom(
                    msg.sender,
                    sellerFee + calcFee(token, Side.BUY, (price * _quantity) / PRICE_FACTOR)
                );
                WETHtoken.transferFrom(msg.sender, sender, (price * _quantity) / PRICE_FACTOR - sellerFee);
                _safeTransferOut(token, tokenId, msg.sender, _quantity);
            }
            emit OrderExecuted(_orderId, msg.sender, _quantity, orders[_orderId].quantity);
        }
    }

    /// @dev Add order to all data structures.
    function _addOrder(
        address _token,
        uint256 _tokenId,
        Side _side,
        address _sender,
        uint256 _price,
        uint256 _quantity
    ) internal {
        // Transfer tokens to this contract
        if (_side == Side.BUY) {
            _distributeWETHFrom(msg.sender, calcFee(_token, Side.BUY, (_price * _quantity) / PRICE_FACTOR));
            WETHtoken.transferFrom(msg.sender, address(this), (_price * _quantity) / PRICE_FACTOR);
        } else {
            _safeTransferIn(_token, _tokenId, msg.sender, _quantity);
        }
        // Check if orders already exist at that price, otherwise add tree entry
        if (!markets[_token][_tokenId][_side].priceTree.exists(_price)) {
            markets[_token][_tokenId][_side].priceTree.insert(_price);
        }
        // Add order to FIFO linked list at _price
        markets[_token][_tokenId][_side].orderList[_price].push(nextOrderId, true);
        // add order to order mapping
        orders[nextOrderId] = Order({
            orderId: nextOrderId,
            side: _side,
            token: _token,
            tokenId: _tokenId,
            sender: _sender,
            price: _price,
            quantity: _quantity
        });
        userOrders[_sender].push(nextOrderId, true);
        emit OrderAdded(nextOrderId, _token, _tokenId, _side, _sender, _price, _quantity);
        unchecked {
            nextOrderId++;
        }
    }

    /// @dev Remove order from all data structures..
    function _removeOrder(uint256 _orderId) internal {
        uint256 price = orders[_orderId].price;
        address token = orders[_orderId].token;
        uint256 tokenId = orders[_orderId].tokenId;
        Side side = orders[_orderId].side;
        // remove from userOrders linked list
        userOrders[orders[_orderId].sender].remove(_orderId);
        // remove order from linked list
        markets[token][tokenId][side].orderList[price].pop(false);
        // if this was the last remaining order, remove node from red-black tree
        if (!markets[token][tokenId][side].orderList[price].listExists()) {
            markets[token][tokenId][side].priceTree.remove(price);
        }
        // remove from order mapping
        delete (orders[_orderId]);
    }

    /// @dev Spends WETHs and takes care to send them to the proper places.
    function _distributeWETH(uint256 _quantity) internal {
        // Send percentages to different wallets.
        for (uint256 i = 0; i < feeAddresses.length; i++) {
            uint256 feeQuantity = (feePercents[i] * _quantity) / 10000;
            WETHtoken.transfer(feeAddresses[i], feeQuantity);
        }
    }

    /// @dev Spends WETHs and takes care to send them to the proper places.
    function _distributeWETHFrom(address _from, uint256 _quantity) internal {
        // Send percentages to different wallets.
        for (uint256 i = 0; i < feeAddresses.length; i++) {
            uint256 feeQuantity = (feePercents[i] * _quantity) / 10000;
            WETHtoken.transferFrom(_from, feeAddresses[i], feeQuantity);
        }
    }

    /// @dev Checks contract balance before and after transfer - prevents reflections or other potentially unexpected behaviour
    function _safeTransferIn(
        address _token,
        uint256 _tokenId,
        address _sender,
        uint256 _quantity
    ) internal {
        uint256 balanceBefore = _balanceOf(_token, _tokenId, address(this));
        _safeTransferFrom(_token, _tokenId, _sender, address(this), _quantity);
        require((_balanceOf(_token, _tokenId, address(this)) - balanceBefore) >= _quantity, "Transfer problem");
    }

    /// @dev Checks contract balance before and after transfer - prevents reflections or other potentially unexpected behaviour
    function _safeTransferOut(
        address _token,
        uint256 _tokenId,
        address _receiver,
        uint256 _quantity
    ) internal {
        uint256 balanceBefore = _balanceOf(_token, _tokenId, address(this));
        _safeTransferFrom(_token, _tokenId, address(this), _receiver, _quantity);

        require(balanceBefore - _balanceOf(_token, _tokenId, address(this)) <= _quantity, "Transfer problem");
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

    /// @dev Calls balanceOf.
    function _balanceOf(
        address _token,
        uint256 _tokenId,
        address _account
    ) internal view returns (uint256) {
        return IERC1155(_token).balanceOf(_account, _tokenId);
    }
}
