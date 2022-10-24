// SPDX-License-Identifier: MIT

pragma solidity ^0.8.6;

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
