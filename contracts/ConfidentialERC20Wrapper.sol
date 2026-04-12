// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title ConfidentialERC20Wrapper
 * @notice Wraps a regular ERC20 (USDC / USDT) into a fully confidential token
 *         using Zama FHEVM. Balances are stored as FHE ciphertexts — on-chain
 *         observers cannot see how much any address holds.
 *
 * Flow:
 *   1. wrap(amount)   — deposit underlying ERC20, receive encrypted balance.
 *   2. transfer(to, encAmount, proof) — confidential transfer between addresses.
 *   3. unwrap(amount) — burn encrypted balance, receive underlying ERC20 back.
 *      (amount is learned off-chain via userDecrypt on balanceOf())
 *
 * Authorised operators (e.g. a ConfidentialPayroll contract) may call
 * operatorTransfer() to move encrypted funds on behalf of the from address,
 * provided they have been approved first.
 */
contract ConfidentialERC20Wrapper is ZamaEthereumConfig {

    IERC20  public immutable underlying;
    string  public name;
    string  public symbol;
    uint8   public decimals;

    /// @dev Encrypted balance per holder.
    mapping(address => euint64) private _balances;

    /// @dev approved operator → (owner → approved bool)
    mapping(address => mapping(address => bool)) private _operators;

    event Wrap(address indexed account, uint256 amount);
    event Unwrap(address indexed account, uint256 amount);
    /// @dev Transfer event intentionally contains NO amount — confidential.
    event Transfer(address indexed from, address indexed to);

    constructor(
        address underlying_,
        string memory name_,
        string memory symbol_,
        uint8  decimals_
    ) {
        underlying = IERC20(underlying_);
        name       = name_;
        symbol     = symbol_;
        decimals   = decimals_;
    }

    // ─── Wrap ─────────────────────────────────────────────────────────────────

    /**
     * @notice Deposit `amount` underlying tokens and add to your encrypted balance.
     * @dev    Caller must have approved this contract on the underlying ERC20 first.
     */
    function wrap(uint64 amount) external {
        require(amount > 0, "ConfidentialERC20Wrapper: zero amount");
        require(
            underlying.transferFrom(msg.sender, address(this), amount),
            "ConfidentialERC20Wrapper: transfer failed"
        );

        if (!FHE.isInitialized(_balances[msg.sender])) {
            _balances[msg.sender] = FHE.asEuint64(amount);
        } else {
            _balances[msg.sender] = FHE.add(_balances[msg.sender], FHE.asEuint64(amount));
        }
        _grantAccess(_balances[msg.sender], msg.sender);

        emit Wrap(msg.sender, amount);
    }

    // ─── Unwrap ───────────────────────────────────────────────────────────────

    /**
     * @notice Burn `amount` from your encrypted balance and receive underlying tokens.
     * @dev    Caller learns `amount` by calling balanceOf() and running userDecrypt
     *         in the front-end before calling this function.
     */
    function unwrap(uint64 amount) external {
        require(amount > 0, "ConfidentialERC20Wrapper: zero amount");
        require(FHE.isInitialized(_balances[msg.sender]), "ConfidentialERC20Wrapper: no balance");

        _balances[msg.sender] = FHE.sub(_balances[msg.sender], FHE.asEuint64(amount));
        _grantAccess(_balances[msg.sender], msg.sender);

        require(
            underlying.transfer(msg.sender, amount),
            "ConfidentialERC20Wrapper: transfer failed"
        );

        emit Unwrap(msg.sender, amount);
    }

    // ─── Confidential transfer ────────────────────────────────────────────────

    /**
     * @notice Transfer an encrypted amount to `to`.
     * @param  to         Recipient address.
     * @param  encAmount  Amount encrypted client-side via the FHEVM SDK.
     * @param  inputProof ZK proof from the relayer.
     *
     * The transaction reveals nothing about the transfer amount on-chain.
     */
    function transfer(
        address to,
        externalEuint64 encAmount,
        bytes calldata inputProof
    ) external {
        require(to != address(0), "ConfidentialERC20Wrapper: zero address");
        require(FHE.isInitialized(_balances[msg.sender]), "ConfidentialERC20Wrapper: no balance");

        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        _balances[msg.sender] = FHE.sub(_balances[msg.sender], amount);
        _grantAccess(_balances[msg.sender], msg.sender);

        if (!FHE.isInitialized(_balances[to])) {
            _balances[to] = amount;
        } else {
            _balances[to] = FHE.add(_balances[to], amount);
        }
        _grantAccess(_balances[to], to);

        emit Transfer(msg.sender, to);
    }

    // ─── Operator (payroll) transfer ──────────────────────────────────────────

    /**
     * @notice Approve an operator (e.g. a ConfidentialPayroll contract) to move
     *         funds on your behalf.
     */
    function approveOperator(address operator, bool approved) external {
        _operators[operator][msg.sender] = approved;
    }

    function isOperatorApproved(address operator, address owner) external view returns (bool) {
        return _operators[operator][owner];
    }

    /**
     * @notice Operator-initiated confidential transfer.
     *         Used by ConfidentialPayroll to pay salaries without the employer
     *         needing to sign each transaction.
     *
     * @param  from  Address whose encrypted balance is debited.
     * @param  to    Recipient.
     * @param  amount  Already-encrypted amount (euint64 handle from contract storage).
     */
    function operatorTransfer(address from, address to, euint64 amount) external {
        require(
            _operators[msg.sender][from],
            "ConfidentialERC20Wrapper: not approved operator"
        );
        require(to != address(0), "ConfidentialERC20Wrapper: zero address");
        require(FHE.isInitialized(_balances[from]), "ConfidentialERC20Wrapper: no balance");

        _balances[from] = FHE.sub(_balances[from], amount);
        _grantAccess(_balances[from], from);

        if (!FHE.isInitialized(_balances[to])) {
            _balances[to] = amount;
        } else {
            _balances[to] = FHE.add(_balances[to], amount);
        }
        _grantAccess(_balances[to], to);

        emit Transfer(from, to);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the encrypted balance handle for `account`.
     *         Use userDecrypt() in the front-end to reveal the value.
     */
    function balanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _grantAccess(euint64 val, address user) internal {
        FHE.allowThis(val);
        FHE.allow(val, user);
    }
}
