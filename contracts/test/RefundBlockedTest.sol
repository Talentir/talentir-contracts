// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

contract RefundBlockedTest {
    bool public shouldRevert = false;

    receive() external payable {
        require(shouldRevert == false, "bla");
    }

    function enableBlock() public {
        shouldRevert = true;
    }

    function makeBuyOffer(
        address marketplace,
        address nftAddress,
        uint256 tokenID,
        uint256 price
    ) public {
        // TalentirMarketplace(marketplace).makeBuyOffer{value: price}(nftAddress, tokenID);
    }

    function withdrawBuyOffer(
        address marketplace,
        address nftAddress,
        uint256 tokenID
    ) public {
        // TalentirMarketplace(marketplace).withdrawBuyOffer(nftAddress, tokenID);
    }
}
