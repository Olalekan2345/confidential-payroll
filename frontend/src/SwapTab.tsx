import { useState } from "react";
import { BrowserProvider, Contract, ethers } from "ethers";
import { type FhevmInstance } from "@zama-fhe/relayer-sdk/web";
import {
  ERC20_ABI, CONF_ERC20_ABI, SUPPORTED_TOKENS, type TokenInfo,
} from "./contract";

// ─── Types ────────────────────────────────────────────────────────────────────

type Direction = "wrap" | "unwrap";

type TokenState = {
  plainBalance:  string | null;  // regular ERC20 balance
  confBalance:   string | null;  // decrypted confidential balance (off-chain)
  confHandle:    string | null;  // raw ciphertext handle (for userDecrypt)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt6(n: bigint) {
  return parseFloat(ethers.formatUnits(n, 6)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SwapTab({
  provider,
  signer,
  address,
  instance,
  isEmployer,
}: {
  provider:   BrowserProvider;
  signer:     ethers.JsonRpcSigner;
  address:    string;
  instance:   FhevmInstance;
  isEmployer: boolean;
}) {
  const [selectedToken, setSelectedToken] = useState<TokenInfo>(SUPPORTED_TOKENS[0]);
  const [direction,     setDirection]     = useState<Direction>("wrap");
  const [amount,        setAmount]        = useState("");
  const [busy,          setBusy]          = useState(false);
  const [status,        setStatus]        = useState<{ text: string; ok: boolean } | null>(null);
  const [tokenStates,   setTokenStates]   = useState<Record<string, TokenState>>({});
  const [decrypting,    setDecrypting]    = useState<Record<string, boolean>>({});

  const state = (t: TokenInfo): TokenState =>
    tokenStates[t.symbol] ?? { plainBalance: null, confBalance: null, confHandle: null };

  const ok   = (text: string) => setStatus({ text, ok: true });
  const fail = (text: string) => setStatus({ text, ok: false });

  // ── Fetch plain ERC20 balance ───────────────────────────────────────────────
  const loadPlainBalance = async (t: TokenInfo) => {
    try {
      const erc20 = new Contract(t.address, ERC20_ABI, provider);
      const bal: bigint = await erc20.balanceOf(address);
      setTokenStates(prev => ({
        ...prev,
        [t.symbol]: { ...state(t), plainBalance: fmt6(bal) },
      }));
    } catch { /* ignore */ }
  };

  // ── Decrypt confidential balance ────────────────────────────────────────────
  const decryptConfBalance = async (t: TokenInfo) => {
    setDecrypting(prev => ({ ...prev, [t.symbol]: true }));
    try {
      const cToken = new Contract(t.confAddress, CONF_ERC20_ABI, provider);
      const handle: string = await cToken.balanceOf(address);

      if (!handle || handle === "0x" + "0".repeat(64)) {
        setTokenStates(prev => ({
          ...prev,
          [t.symbol]: { ...state(t), confBalance: "0.00", confHandle: handle },
        }));
        return;
      }

      const { publicKey, privateKey } = instance.generateKeypair();
      const startTimestamp = Math.floor(Date.now() / 1000);
      const durationDays = 100;
      const eip712 = instance.createEIP712(publicKey, [t.confAddress], startTimestamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification as any },
        eip712.message,
      );
      const results = await instance.userDecrypt(
        [{ handle, contractAddress: t.confAddress }],
        privateKey, publicKey, signature,
        [t.confAddress], address, startTimestamp, durationDays,
      );
      const val = Object.values(results)[0] as bigint;

      setTokenStates(prev => ({
        ...prev,
        [t.symbol]: {
          ...state(t),
          confBalance: fmt6(val),
          confHandle:  handle,
        },
      }));
    } catch (e) {
      fail(e instanceof Error ? e.message : "Decrypt failed");
    } finally {
      setDecrypting(prev => ({ ...prev, [t.symbol]: false }));
    }
  };

  // ── Free mint test tokens ───────────────────────────────────────────────────
  const handleMint = async (t: TokenInfo) => {
    setBusy(true); setStatus(null);
    try {
      const erc20 = new Contract(t.address, ERC20_ABI, signer);
      const amt = ethers.parseUnits("1000", t.decimals); // mint 1,000
      const tx = await erc20.mint(address, amt);
      await tx.wait();
      ok(`Minted 1,000 ${t.symbol} to your wallet.`);
      await loadPlainBalance(t);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Mint failed");
    } finally { setBusy(false); }
  };

  // ── Wrap ───────────────────────────────────────────────────────────────────
  const handleWrap = async () => {
    if (!amount || parseFloat(amount) <= 0) return fail("Enter an amount.");
    setBusy(true); setStatus(null);
    try {
      const parsed = ethers.parseUnits(amount, selectedToken.decimals);
      const erc20  = new Contract(selectedToken.address,     ERC20_ABI,     signer);
      const cToken = new Contract(selectedToken.confAddress, CONF_ERC20_ABI, signer);

      // Check and set allowance
      const allowance: bigint = await erc20.allowance(address, selectedToken.confAddress);
      if (allowance < parsed) {
        const tx = await erc20.approve(selectedToken.confAddress, parsed);
        await tx.wait();
      }

      // Wrap — amount fits in uint64 (max ~18.4M tokens at 6 decimals)
      const tx = await cToken.wrap(BigInt(parsed.toString()));
      await tx.wait();

      ok(`Wrapped ${amount} ${selectedToken.symbol} → ${selectedToken.confSymbol}`);
      setAmount("");
      await loadPlainBalance(selectedToken);
      await decryptConfBalance(selectedToken);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Wrap failed");
    } finally { setBusy(false); }
  };

  // ── Unwrap (two-step async, per Zama protocol) ─────────────────────────────
  const handleUnwrap = async () => {
    if (!amount || parseFloat(amount) <= 0) return fail("Enter an amount.");
    setBusy(true); setStatus(null);

    try {
      const parsed = ethers.parseUnits(amount, selectedToken.decimals);
      const cToken = new Contract(selectedToken.confAddress, CONF_ERC20_ABI, signer);

      // ── Step 1: Encrypt the amount and submit the unwrap request ─────────────
      setStatus({ text: "Step 1/2 — Encrypting and submitting unwrap request…", ok: true });

      const input    = instance.createEncryptedInput(selectedToken.confAddress, address);
      const zkProof  = input.add64(parsed).generateZKProof();
      const { handles, inputProof } = await instance.requestZKProofVerification(zkProof);

      const tx1     = await cToken.requestUnwrap(address, address, handles[0], inputProof);
      const receipt = await tx1.wait();

      // Parse UnwrapRequested event to get requestId + encHandle
      const iface = new ethers.Interface(CONF_ERC20_ABI as unknown as string[]);
      let requestId = "";
      let encHandle = "";
      for (const log of receipt.logs) {
        try {
          const parsed_log = iface.parseLog(log);
          if (parsed_log?.name === "UnwrapRequested") {
            requestId = parsed_log.args[1] as string;
            encHandle = parsed_log.args[2] as string;
            break;
          }
        } catch { /* skip unrelated logs */ }
      }
      if (!requestId || !encHandle) throw new Error("UnwrapRequested event not found in receipt");

      // ── Step 2: Poll KMS for the public decryption result ────────────────────
      setStatus({ text: "Step 2/2 — Waiting for KMS decryption (may take ~30 s, please wait)…", ok: true });

      let decryptResult = null;
      const MAX_ATTEMPTS = 24; // 24 × 5 s = 2 min max
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          decryptResult = await instance.publicDecrypt([encHandle]);
          break; // success — exit polling loop
        } catch (e: unknown) {
          const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
          if (msg.includes("not_ready") || msg.includes("not ready")) {
            // KMS not yet ready — wait and retry
            await new Promise(r => setTimeout(r, 5000));
          } else {
            throw e; // unexpected error — bubble up
          }
        }
      }
      if (!decryptResult) throw new Error("KMS decryption timed out. Try finalizing later.");

      // ── Step 3: Finalize the unwrap with the KMS proof ───────────────────────
      setStatus({ text: "Step 2/2 — Finalizing unwrap on-chain…", ok: true });

      const tx2 = await cToken.finalizeUnwrap(
        requestId,
        [encHandle],
        decryptResult.abiEncodedClearValues,
        decryptResult.decryptionProof,
      );
      await tx2.wait();

      ok(`✓ Unwrapped ${amount} ${selectedToken.confSymbol} → ${selectedToken.symbol}. Check your USDC/USDT balance.`);
      setAmount("");
      await loadPlainBalance(selectedToken);
      await decryptConfBalance(selectedToken);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Unwrap failed");
    } finally { setBusy(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const s = state(selectedToken);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Token Swap</h2>
        <p style={{ fontSize: 13, color: "var(--muted)" }}>
          Convert regular USDC / USDT into their confidential versions (cUSDC / cUSDT) using Zama FHEVM.
          Confidential tokens have fully encrypted balances — no amounts are visible on-chain.
        </p>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          background: status.ok ? "var(--success-dim)" : "var(--danger-dim)",
          border: `1px solid ${status.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
          borderRadius: "var(--radius-sm)", padding: "11px 16px", fontSize: 13,
          color: status.ok ? "var(--success)" : "var(--danger)",
        }}>
          {status.ok ? "✓" : "✕"} {status.text}
        </div>
      )}

      {/* Token selector */}
      <div style={{ display: "flex", gap: 10 }}>
        {SUPPORTED_TOKENS.map(t => (
          <button
            key={t.symbol}
            onClick={() => { setSelectedToken(t); setStatus(null); }}
            style={{
              background: selectedToken.symbol === t.symbol ? t.color : "var(--surface)",
              color: selectedToken.symbol === t.symbol ? "#fff" : "var(--text)",
              border: `1.5px solid ${selectedToken.symbol === t.symbol ? t.color : "var(--border)"}`,
              borderRadius: "var(--radius-sm)",
              padding: "8px 22px",
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {t.symbol}
          </button>
        ))}
      </div>

      {/* Balance cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

        {/* Plain balance */}
        <div className="card" style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {selectedToken.symbol} Balance
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>
            {s.plainBalance ?? "—"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost btn-sm" onClick={() => loadPlainBalance(selectedToken)} disabled={busy}>
              ↻ Refresh
            </button>
            {isEmployer && (
              <button className="btn-ghost btn-sm" onClick={() => handleMint(selectedToken)} disabled={busy} title="Get free test tokens">
                + Free Mint
              </button>
            )}
          </div>
        </div>

        {/* Confidential balance */}
        <div className="card" style={{ padding: "18px 20px", borderColor: "rgba(255,209,0,0.2)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {selectedToken.confSymbol} Balance (encrypted)
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            {s.confBalance !== null ? (
              <span style={{ color: "var(--accent)" }}>{s.confBalance}</span>
            ) : (
              <span style={{ color: "var(--muted)", letterSpacing: 4, fontSize: 18 }}>••••••</span>
            )}
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => decryptConfBalance(selectedToken)}
            disabled={decrypting[selectedToken.symbol] || busy}
          >
            <LockIcon /> {decrypting[selectedToken.symbol] ? "Decrypting…" : s.confBalance !== null ? "↻ Refresh" : "Reveal Balance"}
          </button>
        </div>
      </div>

      {/* Swap card */}
      <div className="card" style={{ borderColor: "rgba(255,209,0,0.2)" }}>
        <h3 style={{ marginBottom: 16 }}>
          {direction === "wrap"
            ? `Wrap ${selectedToken.symbol} → ${selectedToken.confSymbol}`
            : `Unwrap ${selectedToken.confSymbol} → ${selectedToken.symbol}`}
        </h3>

        {/* Direction toggle */}
        <div style={{ display: "flex", gap: 4, background: "var(--bg-alt)", border: "1.5px solid var(--border)", borderRadius: 10, padding: 4, marginBottom: 18, width: "fit-content" }}>
          {(["wrap", "unwrap"] as Direction[]).map(d => (
            <button
              key={d}
              onClick={() => { setDirection(d); setStatus(null); setAmount(""); }}
              style={{
                background: direction === d ? "var(--surface)" : "transparent",
                border: "none", borderRadius: 7,
                color: direction === d ? "var(--text)" : "var(--muted)",
                padding: "7px 22px", fontSize: 13,
                fontWeight: direction === d ? 700 : 500,
                boxShadow: direction === d ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transform: "none",
              }}
            >
              {d === "wrap" ? `Wrap → ${selectedToken.confSymbol}` : `Unwrap → ${selectedToken.symbol}`}
            </button>
          ))}
        </div>

        {/* Amount input */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label>
              Amount ({direction === "wrap" ? selectedToken.symbol : selectedToken.confSymbol})
            </label>
            <input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => e.key === "Enter" && (direction === "wrap" ? handleWrap() : handleUnwrap())}
            />
          </div>
          <button
            className="btn-primary"
            onClick={direction === "wrap" ? handleWrap : handleUnwrap}
            disabled={busy || !amount}
            style={{ marginBottom: 1, whiteSpace: "nowrap" }}
          >
            {busy ? "Processing…" : direction === "wrap" ? `Wrap to ${selectedToken.confSymbol}` : `Unwrap to ${selectedToken.symbol}`}
          </button>
        </div>

        {/* Info note */}
        <div style={{ marginTop: 16, padding: "10px 14px", background: "var(--accent-dim)", borderRadius: "var(--radius-sm)", border: "1px solid rgba(255,209,0,0.2)", fontSize: 12, color: "var(--text-2)", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <LockIcon />
          {direction === "wrap" ? (
            <span>
              <strong>Wrap</strong> deposits your {selectedToken.symbol} into the {selectedToken.confSymbol} contract.
              Your balance becomes an FHE ciphertext — no one can see your holdings on-chain.
              You need to approve the contract to spend your {selectedToken.symbol} first (one-time).
            </span>
          ) : (
            <span>
              <strong>Unwrap</strong> is a two-step process: (1) your encrypted {selectedToken.confSymbol} is burned and the
              amount is sent to the KMS for decryption, (2) once decrypted (~30 s) the equivalent {selectedToken.symbol}
              is returned to your wallet. First reveal your balance above, then enter the amount to unwrap.
            </span>
          )}
        </div>
      </div>

      {/* Contract addresses */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <h3 style={{ marginBottom: 12 }}>Contract Addresses — Sepolia</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SUPPORTED_TOKENS.map(t => (
            <div key={t.symbol} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", width: 50 }}>{t.symbol}</span>
                <code style={{ flex: 1, fontSize: 11 }}>{t.address}</code>
                <a href={`https://sepolia.etherscan.io/address/${t.address}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--muted)", border: "none" }}>↗</a>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", width: 50 }}>{t.confSymbol}</span>
                <code style={{ flex: 1, fontSize: 11 }}>{t.confAddress}</code>
                <a href={`https://sepolia.etherscan.io/address/${t.confAddress}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--muted)", border: "none" }}>↗</a>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
