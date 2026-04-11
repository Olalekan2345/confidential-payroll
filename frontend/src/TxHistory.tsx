import { useEffect, useState } from "react";
import { Contract, BrowserProvider, EventLog, ethers, Log } from "ethers";
import { PAYROLL_ABI } from "./contract";

// ─── Constants ───────────────────────────────────────────────────────────────

// Free-tier RPCs (including drpc.org / MetaMask's provider) cap eth_getLogs at
// 10,000 blocks per request. We chunk into 9,500-block slices and run them in
// parallel, then merge results.
const CHUNK_SIZE = 9_500;
// How far back to scan. ~20,000 blocks ≈ 2.7 days on Sepolia — covers any
// contract deployed in the current session. Adjust upward if needed.
const SCAN_DEPTH = 20_000;

async function queryChunked(
  contract: Contract,
  eventName: string,
  fromBlock: number,
  toBlock: number,
): Promise<(EventLog | Log)[]> {
  const ranges: Array<[number, number]> = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    ranges.push([start, Math.min(start + CHUNK_SIZE - 1, toBlock)]);
  }
  const chunks = await Promise.all(
    ranges.map(([from, to]) => contract.queryFilter(eventName, from, to)),
  );
  return chunks.flat();
}

// ─── Types ────────────────────────────────────────────────────────────────────

type TxRow = {
  id: string;
  label: string;
  detail: string;
  txHash: string;
  blockNumber: number;
  timestamp: number | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const BADGE: Record<string, { bg: string; color: string }> = {
  "Payroll Funded":     { bg: "#2a2200", color: "#FFD100" },
  "Employee Added":     { bg: "#1a2e0f", color: "#4ade80" },
  "Salary Updated":    { bg: "#1e1e2e", color: "#a5b4fc" },
  "Salary Paid":       { bg: "#2a2200", color: "#FFD100" },
  "Employee Removed":  { bg: "#2d0f0f", color: "#f87171" },
  "Payroll Withdrawn": { bg: "#2a1500", color: "#fb923c" },
  "Withdraw Requested":{ bg: "#1a2e0f", color: "#4ade80" },
  "Salary Withdrawn":  { bg: "#1a2e0f", color: "#4ade80" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TxHistory({ provider, contractAddress }: { provider: BrowserProvider; contractAddress: string }) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const c = new Contract(contractAddress, PAYROLL_ABI, provider);
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - SCAN_DEPTH);

      // Fetch all event types in parallel, each split into 9,500-block chunks
      const [funded, added, removed, updated, paid, withdrawn] = await Promise.all([
        queryChunked(c, "PayrollFunded",    fromBlock, currentBlock),
        queryChunked(c, "EmployeeAdded",    fromBlock, currentBlock),
        queryChunked(c, "EmployeeRemoved",  fromBlock, currentBlock),
        queryChunked(c, "SalaryUpdated",    fromBlock, currentBlock),
        queryChunked(c, "SalaryPaid",       fromBlock, currentBlock),
        queryChunked(c, "PayrollWithdrawn", fromBlock, currentBlock),
      ]);

      const toRow = (log: EventLog, label: string, detail: string): TxRow => ({
        id: `${log.transactionHash}-${log.index}`,
        label,
        detail,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
      });

      const all: TxRow[] = [
        ...funded.map(log => {
          const e = log as EventLog;
          return toRow(e, "Payroll Funded",
            `${parseFloat(ethers.formatEther(e.args[1] as bigint)).toFixed(4)} ETH deposited`);
        }),
        ...added.map(log => {
          const e = log as EventLog;
          return toRow(e, "Employee Added", short(e.args[0] as string));
        }),
        ...removed.map(log => {
          const e = log as EventLog;
          return toRow(e, "Employee Removed", short(e.args[0] as string));
        }),
        ...updated.map(log => {
          const e = log as EventLog;
          return toRow(e, "Salary Updated", short(e.args[0] as string));
        }),
        ...paid.map(log => {
          const e = log as EventLog;
          const amt = e.args[1] ? ` · ${parseFloat(ethers.formatEther(e.args[1] as bigint)).toFixed(4)} ETH` : "";
          return toRow(e, "Salary Paid", `${short(e.args[0] as string)}${amt}`);
        }),
        ...withdrawn.map(log => {
          const e = log as EventLog;
          return toRow(e, "Payroll Withdrawn",
            `${parseFloat(ethers.formatEther(e.args[1] as bigint)).toFixed(4)} ETH withdrawn`);
        }),
      ].sort((a, b) => b.blockNumber - a.blockNumber);

      // Resolve block timestamps (batched by unique block)
      const uniqueBlocks = [...new Set(all.map(r => r.blockNumber))];
      const blockTs: Record<number, number> = {};
      await Promise.all(
        uniqueBlocks.map(async bn => {
          const blk = await provider.getBlock(bn);
          if (blk) blockTs[bn] = blk.timestamp;
        })
      );

      setRows(all.map(r => ({ ...r, timestamp: blockTs[r.blockNumber] ?? null })));
    } catch (e) {
      console.error("TxHistory load error:", e);
      setError(e instanceof Error ? e.message : "Failed to load transaction history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Transaction History</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
            Last 100,000 blocks · {rows.length} event{rows.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button className="btn-ghost btn-sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          background: "var(--danger-dim)",
          border: "1px solid rgba(248,113,113,0.2)",
          borderRadius: "var(--radius-sm)",
          padding: "11px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "var(--danger)",
        }}>
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="card" style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 13 }}>
          Scanning on-chain events…
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 13 }}>
          No transactions found in the last 20,000 blocks.
          <p style={{ fontSize: 12, marginTop: 8, color: "var(--muted)" }}>
            Events appear here after funding, adding employees, and paying salaries.
          </p>
        </div>
      )}

      {/* Event list */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(row => {
            const badge = BADGE[row.label] ?? { bg: "#1e293b", color: "var(--muted)" };
            return (
              <div
                key={row.id}
                className="card"
                style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px" }}
              >
                {/* Event type badge */}
                <span style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: badge.bg,
                  color: badge.color,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  {row.label.toUpperCase()}
                </span>

                {/* Detail */}
                <span style={{ fontSize: 13, flex: 1, minWidth: 100 }}>
                  {row.detail}
                </span>

                {/* Timestamp or block number */}
                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {row.timestamp
                    ? new Date(row.timestamp * 1000).toLocaleString()
                    : `Block #${row.blockNumber}`}
                </span>

                {/* Etherscan link */}
                <a
                  href={`https://sepolia.etherscan.io/tx/${row.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 12,
                    color: "var(--accent)",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {row.txHash.slice(0, 8)}…{row.txHash.slice(-4)} ↗
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
