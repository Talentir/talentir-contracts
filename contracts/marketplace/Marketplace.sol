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
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";

/// TYPES ///
import {Side, Order} from "./OrderTypes.sol";

// done: runden
// done: buyer fees rausnehmen, ERC2981-royalties-Kompatibilitaet ueberlegen
// done: nur eine Fee
// done: whitelist ODER nur ein Vertrag
// TODO: ETH statt WETH
// Security
// Handle error in external calls
// https://consensys.github.io/smart-contract-best-practices/development-recommendations/general/external-calls/#favor-pull-over-push-for-external-calls%5Bpull-payment%5D
// TODO: OrderExecuted enthaelt Preis
// TODO: priceFactor nochmal ueberpruefen
// TODO: name TalentirMarketplaceV0
// TODO: einzelne Events fuer cancelled orders
// TODO: refactor safeTransfer functions

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
    mapping(uint256 => mapping(Side => OrderBook)) markets;
    /// @dev tokenId => Side => OrderBook
    mapping(uint256 => Order) public orders; /// @dev OrderId => Order
    mapping(address => LinkedListLibrary.LinkedList) userOrders; /// @dev User => Linked list of open orders by user
    address public TalentirNFT;
    uint256 public talentirFeePercent;
    address public talentirFeeWallet;
    uint256 public nextOrderId;
    uint256 internal constant PERCENT = 100000;
    uint256 internal constant PRICE_FACTOR = 1000000000;
    uint256 public roundingFactor = 1;
    address[] public feeAddresses;
    uint256[] public feePercents;

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
        uint256 quantity,
        uint256 remainingQuantity
    );
    event OrdersCancelled(uint256[] orderIds);
    event DecimalsSet(uint32 decimals);
    event TalentirFeeSet(uint256 fee, address wallet);

    /// CONSTRUCTOR ///

    constructor(
        address _WETHaddress,
        address _talentirNFT,
        uint256 _nextOrderId
    ) {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MODERATOR_ROLE, msg.sender);
        nextOrderId = _nextOrderId;
        TalentirNFT = _talentirNFT;
        require(IERC1155(TalentirNFT).supportsInterface(0x2a55205a)); // must implement ERC-2981 royalties standard
        WETHtoken = IERC20(_WETHaddress);
    }

    /// VIEW FUNCTIONS ///
    /**
        @notice Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
        @dev Return the best `_side` (buy=0, sell=1) order for token `_tokenId`
        @param _tokenId token Id (ERC1155)
        @return uint256 Id of best order
        @return uint256 price of best order (in units of 10^(27-tokenDecimals))
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
        @return uint256 fee (in units of 10^(27-tokenDecimals))
     */
    function calcTalentirFee(uint256 _totalPaid) public view returns (uint256) {
        return ((100 * talentirFeePercent * _totalPaid) / PERCENT) / 100;
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
        @notice Sell `tokenQuantity` of token `tokenId` for min `WETHquantity` total price. (ERC1155)
        @dev Sell `tokenQuantity` of token `tokenId` for min `WETHquantity` total price. (ERC1155)
        @dev Price limit must always be included to prevent frontrunning. 
        @dev price will be rounded to 10^(18-roundingFactor) decimal places!
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param tokenId token Id (ERC1155)
        @param WETHquantity total WETH demanded (quantity*minimum price per unit, in units of 10^18)
        @param tokenQuantity how much to sell in total of token (in units of 10^tokenDecimals)
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
     */
    function makeSellOrderERC1155(
        uint256 tokenId,
        uint256 WETHquantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused {
        _makeOrder(tokenId, Side.SELL, WETHquantity, tokenQuantity, addUnfilledOrderToOrderbook);
    }

    /**
        @notice Buy `tokenQuantity` of token `tokenId` for max `WETHquantity` total price. (ERC1155)
        @dev Buy `tokenQuantity` of token `tokenId` for max `WETHquantity` total price. (ERC1155)
        @dev Price limit must always be included to prevent frontrunning. 
        @dev price will be rounded to 10^(18-roundingFactor) decimal places!
        @dev Does NOT work for ERC20!. 
        @dev can emit multiple OrderExecuted events. 
        @param tokenId token Id (ERC1155)
        @param WETHquantity total WETH offered (quantity*maximum price per unit, in units of 10^18)
        @param tokenQuantity how much to buy in total of token (in units of 10^tokenDecimals)
        @param addUnfilledOrderToOrderbook add order to order list at a limit price of WETHquantity/tokenQuantity if it can't be filled
     */
    function makeBuyOrderERC1155(
        uint256 tokenId,
        uint256 WETHquantity,
        uint256 tokenQuantity,
        bool addUnfilledOrderToOrderbook
    ) external whenNotPaused {
        _makeOrder(tokenId, Side.BUY, WETHquantity, tokenQuantity, addUnfilledOrderToOrderbook);
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
            uint256 tokenId = orders[orderId].tokenId;
            _removeOrder(orderId);
            if (side == Side.BUY) {
                WETHtoken.transfer(msg.sender, (price * quantity) / PRICE_FACTOR);
            } else {
                _safeTransferOut(TalentirNFT, tokenId, msg.sender, quantity);
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
        @dev Set the fee that Talentir will receive on each transaction.
        @dev emits DefaultFeeSet event. 
        @dev fee capped at 10%
        @param _fee fee percent (100% = 100,000)
        @param _wallet address where Talentir fee will be sent to
     */
    function setTalentirFee(uint256 _fee, address _wallet) external onlyRole(MODERATOR_ROLE) {
        require(_fee <= PERCENT / 10, "Must be <10k"); // Talentir fee can never be higher than 10%
        talentirFeePercent = _fee;
        talentirFeeWallet = _wallet;
        emit TalentirFeeSet(_fee, _wallet);
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
            _executeOrder(bestOrderId, quantityToBuy);
            remainingQuantity -= quantityToBuy;
            if (remainingQuantity > 0) {
                (bestOrderId, bestPrice) = getBestOrder(_tokenId, oppositeSide);
            }
        }
        // If the order couldn't be filled, add the remaining quantity to buy orders
        if (_addOrderForRemaining && (remainingQuantity > 0)) {
            _addOrder(_tokenId, _side, msg.sender, price, remainingQuantity);
        }
    }

    /// @dev Executes one atomic order (transfers tokens and removes order).
    function _executeOrder(uint256 _orderId, uint256 _quantity) internal {
        if (_quantity > 0) {
            uint256 tokenId = orders[_orderId].tokenId;
            Side side = orders[_orderId].side;
            uint256 price = orders[_orderId].price;
            address sender = orders[_orderId].sender;
            uint256 transactionVolume = (price * _quantity) / PRICE_FACTOR;

            (address royaltiesReceiver, uint256 royaltiesAmount) = IERC2981(TalentirNFT).royaltyInfo(
                tokenId,
                transactionVolume
            );
            uint256 talentirFee = calcTalentirFee(transactionVolume);
            transactionVolume -= royaltiesAmount - talentirFee;
            require(transactionVolume > 0, "Problem calculating fees");

            if (_quantity == orders[_orderId].quantity) {
                _removeOrder(_orderId);
            } else {
                orders[_orderId].quantity -= _quantity;
            }
            if (side == Side.BUY) {
                // Original order was a buy order: WETH has already been transferred into the contract
                // Distribute Fees from contract
                WETHtoken.transfer(royaltiesReceiver, royaltiesAmount);
                WETHtoken.transfer(talentirFeeWallet, talentirFee);
                // Caller is the seller - distribute to buyer first
                _safeTransferFrom(TalentirNFT, tokenId, msg.sender, sender, _quantity);
                // Seller receives price*quantity - fees
                WETHtoken.transfer(msg.sender, transactionVolume);
            } else {
                // Original order was a sell order: NFT has already been transferred into the contract
                // Distribute Fees from sender wallet
                WETHtoken.transferFrom(msg.sender, royaltiesReceiver, royaltiesAmount);
                WETHtoken.transferFrom(msg.sender, talentirFeeWallet, talentirFee);
                // Caller is the buyer - distribute to seller first
                WETHtoken.transferFrom(msg.sender, sender, transactionVolume);
                _safeTransferOut(TalentirNFT, tokenId, msg.sender, _quantity);
            }
            emit OrderExecuted(_orderId, msg.sender, _quantity, orders[_orderId].quantity);
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
        if (_side == Side.BUY) {
            WETHtoken.transferFrom(msg.sender, address(this), (_price * _quantity) / PRICE_FACTOR);
        } else {
            _safeTransferIn(TalentirNFT, _tokenId, msg.sender, _quantity);
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
