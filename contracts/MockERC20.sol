// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockERC20
 * @notice Mintable test token — deployed as mock USDC and mock USDT on Sepolia.
 *         Anyone can call mint() to get tokens for testing.
 */
contract MockERC20 is ERC20 {
    uint8 private _dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_)
        ERC20(name_, symbol_)
    {
        _dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    /// @notice Free mint for testing — no access control.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
