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
 * Unwrap flow (two-step async, per Zama protocol):
 *   1. requestUnwrap(from, to, encAmount, inputProof)
 *         — Burns the encrypted amount from `from`'s balance (capped at actual
 *           balance via FHE.min to prevent underflow exploits).
 *         — Marks the capped amount for public KMS decryption.
 *         — Emits UnwrapRequested(receiver, requestId, encHandle).
 *   2. Off-chain: call instance.publicDecrypt([encHandle]) via the relayer SDK
 *         — May need a few retries if decryption is not yet ready.
 *   3. finalizeUnwrap(requestId, handles, abiEncodedCleartexts, decryptionProof)
 *         — Verifies the KMS decryption proof via FHE.checkSignatures.
 *         — Transfers the decrypted amount of underlying ERC20 to the receiver.
 *         — Emits UnwrapFinalized(receiver, requestId, amount).
 *
 * Authorised operators (e.g. a ConfidentialPayroll contract) may call
 * operatorTransfer() to move encrypted funds on behalf of the `from` address,
 * provided they have been approved first via approveOperator().
 */
contract ConfidentialERC20Wrapper is ZamaEthereumConfig {

    IERC20  public immutable underlying;
    string  public name;
    string  public symbol;
    uint8   public decimals;

    /// @dev Encrypted balance per holder.
    mapping(address => euint64) private _balances;

    /// @dev operator → (owner → approved)
    mapping(address => mapping(address => bool)) private _operators;

    // ─── Unwrap request tracking ──────────────────────────────────────────────

    struct UnwrapRequest {
        address receiver;  // who receives the underlying tokens
        bytes32 encHandle; // ciphertext handle of the (capped) unwrap amount
        bool    finalized;
    }

    mapping(bytes32 => UnwrapRequest) public unwrapRequests;

    // ─── Events ───────────────────────────────────────────────────────────────

    event Wrap(address indexed account, uint256 amount);
    /// @dev Step 1 — initiated by the user.
    event UnwrapRequested(address indexed receiver, bytes32 indexed requestId, bytes32 encHandle);
    /// @dev Step 3 — completed after KMS decryption proof is verified.
    event UnwrapFinalized(address indexed receiver, bytes32 indexed requestId, uint64 amount);
    /// @dev Intentionally contains NO amount — confidential.
    event Transfer(address indexed from, address indexed to);

    // ─── Constructor ─────────────────────────────────────────────────────────

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
     * @notice Deposit `amount` underlying tokens and credit your encrypted balance.
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

    // ─── Unwrap — Step 1 ─────────────────────────────────────────────────────

    /**
     * @notice Initiate an unwrap. Burns the encrypted amount from `from`'s balance
     *         and marks it for public KMS decryption.
     *
     * @param from        Address whose balance is debited (msg.sender or approved operator).
     * @param to          Address that will receive the underlying ERC20.
     * @param encAmount   Amount to unwrap, encrypted client-side via the FHEVM SDK.
     * @param inputProof  ZK proof from the relayer.
     * @return requestId  Unique id for this unwrap request (emitted in UnwrapRequested).
     *
     * @dev  The actual transfer amount is capped at the caller's real balance using
     *       FHE.min, preventing underflow attacks. The true cleartext is revealed
     *       only during finalizeUnwrap after the KMS decryption proof is presented.
     */
    function requestUnwrap(
        address         from,
        address         to,
        externalEuint64 encAmount,
        bytes calldata  inputProof
    ) external returns (bytes32 requestId) {
        require(
            msg.sender == from || _operators[msg.sender][from],
            "ConfidentialERC20Wrapper: not authorized"
        );
        require(to   != address(0), "ConfidentialERC20Wrapper: zero to address");
        require(from != address(0), "ConfidentialERC20Wrapper: zero from address");
        require(FHE.isInitialized(_balances[from]), "ConfidentialERC20Wrapper: no balance");

        euint64 amount = FHE.fromExternal(encAmount, inputProof);

        // Cap at actual balance — prevents exploit where attacker passes amount > balance
        // and drains underlying tokens while FHE sub wraps around.
        euint64 cappedAmount = FHE.min(amount, _balances[from]);

        // Deduct from encrypted balance
        _balances[from] = FHE.sub(_balances[from], cappedAmount);
        _grantAccess(_balances[from], from);

        // Mark the capped amount for public decryption by the KMS.
        // The handle is what the frontend passes to instance.publicDecrypt().
        euint64 publicAmount = FHE.makePubliclyDecryptable(cappedAmount);
        bytes32 encHandle    = euint64.unwrap(publicAmount);

        requestId = keccak256(abi.encode(from, to, block.number, encHandle));
        unwrapRequests[requestId] = UnwrapRequest({
            receiver:  to,
            encHandle: encHandle,
            finalized: false
        });

        emit UnwrapRequested(to, requestId, encHandle);
    }

    // ─── Unwrap — Step 3 (finalize after KMS decryption) ─────────────────────

    /**
     * @notice Complete an unwrap by presenting the KMS decryption proof.
     *
     * @param requestId             From the UnwrapRequested event.
     * @param handles               Array of ciphertext handles that were decrypted
     *                              (should be [encHandle] from UnwrapRequested).
     * @param abiEncodedCleartexts  ABI-encoded cleartext values from instance.publicDecrypt().
     * @param decryptionProof       KMS signatures proof from instance.publicDecrypt().
     */
    function finalizeUnwrap(
        bytes32          requestId,
        bytes32[] calldata handles,
        bytes     calldata abiEncodedCleartexts,
        bytes     calldata decryptionProof
    ) external {
        UnwrapRequest storage req = unwrapRequests[requestId];
        require(req.receiver != address(0), "ConfidentialERC20Wrapper: unknown request");
        require(!req.finalized,             "ConfidentialERC20Wrapper: already finalized");

        // Verify KMS signatures — reverts if invalid
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        uint64 clearAmount = abi.decode(abiEncodedCleartexts, (uint64));
        req.finalized = true;

        if (clearAmount > 0) {
            require(
                underlying.transfer(req.receiver, clearAmount),
                "ConfidentialERC20Wrapper: transfer failed"
            );
        }

        emit UnwrapFinalized(req.receiver, requestId, clearAmount);
    }

    // ─── Confidential transfer ────────────────────────────────────────────────

    /**
     * @notice Transfer an encrypted amount to `to`.
     */
    function transfer(
        address         to,
        externalEuint64 encAmount,
        bytes calldata  inputProof
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

    function approveOperator(address operator, bool approved) external {
        _operators[operator][msg.sender] = approved;
    }

    function isOperatorApproved(address operator, address owner) external view returns (bool) {
        return _operators[operator][owner];
    }

    /**
     * @notice Operator-initiated confidential transfer.
     *         Used by ConfidentialPayroll to pay salaries.
     *         The calling contract must have ACL permission on `amount`
     *         (granted by the payroll contract via FHE.allow before calling this).
     */
    function operatorTransfer(address from, address to, euint64 amount) external {
        require(
            _operators[msg.sender][from],
            "ConfidentialERC20Wrapper: not approved operator"
        );
        require(to   != address(0), "ConfidentialERC20Wrapper: zero address");
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

    function balanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _grantAccess(euint64 val, address user) internal {
        FHE.allowThis(val);
        FHE.allow(val, user);
    }
}
