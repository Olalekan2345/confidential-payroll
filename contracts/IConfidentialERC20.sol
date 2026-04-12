// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { euint64 } from "@fhevm/solidity/lib/FHE.sol";

/**
 * @title IConfidentialERC20
 * @notice Minimal interface used by ConfidentialPayroll to call operatorTransfer
 *         on cUSDC / cUSDT wrappers.
 */
interface IConfidentialERC20 {
    function operatorTransfer(address from, address to, euint64 amount) external;
    function isOperatorApproved(address operator, address owner) external view returns (bool);
}
