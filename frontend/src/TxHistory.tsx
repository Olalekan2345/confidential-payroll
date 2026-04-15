import { useEffect, useState } from "react";
import { Contract, BrowserProvider, EventLog, Log } from "ethers";
import { PAYROLL_ABI } from "./contract";

// ─── Constants ───────────────────────────────────────────────────────────────

const CHUNK_SIZE = 9_500;
const SCAN_DEPTH = 20_000;

async function queryChunked(
  contract: Contract,
  filter: Parameters<Contract["queryFilter"]>[0],
  fromBlock: number,
  toBlock: number,
): Promise<(EventLog | Log)[]> {
  const ranges: Array<[number, number]> = [];
  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    ranges.push([start, Math.min(start + CHUNK_SIZE - 1, toBlock)]);
  }
  const chunks = await Promise.all(
    ranges.map(([from, to]) => contract.queryFilter(filter, from, to)),
  );
  return chunks.flat();
}

// ─── Types ───────────────────────────────────────────────────────────────────

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

const BADGE: Record<string, { bg: string; color: string; border: string }> = {
  "Employee Added":    { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
  "Salary Updated":    { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe" },
  "Salary Paid":       { bg: "#fffbe6", color: "#92400e", border: "rgba(255,210,8,0.4)" },
  "Employee Removed":  { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
  "Payroll Closed":    { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function TxHistory({
  provider,
  contractAddress,
  filterAddress,   // if set → employee view: only show this address's events
}: {
  provider: BrowserProvider;
  contractAddress: string;
  filterAddress?: string;
}) {
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

      const toRow = (log: EventLog, label: string, detail: string): TxRow => ({
        id: `${log.transactionHash}-${log.index}`,
        label,
        detail,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: null,
      });

      let all: TxRow[];

      if (filterAddress) {
        // ── Employee view: only events involving this address ──────────────
        // Use topic filters so only matching logs are fetched (no client-side scan).
        const addr = filterAddress;
        const [added, removed, updated, paid] = await Promise.all([
          queryChunked(c, c.filters.EmployeeAdded(addr),   fromBlock, currentBlock),
          queryChunked(c, c.filters.EmployeeRemoved(addr), fromBlock, currentBlock),
          queryChunked(c, c.filters.SalaryUpdated(addr),   fromBlock, currentBlock),
          queryChunked(c, c.filters.SalaryPaid(addr),      fromBlock, currentBlock),
        ]);

        all = [
          ...added.map(log => toRow(log as EventLog, "Employee Added", "You were added to payroll")),
          ...removed.map(log => toRow(log as EventLog, "Employee Removed", "You were removed from payroll")),
          ...updated.map(log => toRow(log as EventLog, "Salary Updated", "Your salary was updated")),
          ...paid.map(log => toRow(log as EventLog, "Salary Paid", "Confidential salary received")),
        ].sort((a, b) => b.blockNumber - a.blockNumber);

      } else {
        // ── Employer view: all events ──────────────────────────────────────
        const [added, removed, updated, paid, closed] = await Promise.all([
          queryChunked(c, c.filters.EmployeeAdded(),   fromBlock, currentBlock),
          queryChunked(c, c.filters.EmployeeRemoved(), fromBlock, currentBlock),
          queryChunked(c, c.filters.SalaryUpdated(),   fromBlock, currentBlock),
          queryChunked(c, c.filters.SalaryPaid(),      fromBlock, currentBlock),
          queryChunked(c, c.filters.PayrollClosed(),   fromBlock, currentBlock),
        ]);

        all = [
          ...added.map(log => toRow(log as EventLog, "Employee Added", short((log as EventLog).args[0] as string))),
          ...removed.map(log => toRow(log as EventLog, "Employee Removed", short((log as EventLog).args[0] as string))),
          ...updated.map(log => toRow(log as EventLog, "Salary Updated", short((log as EventLog).args[0] as string))),
          ...paid.map(log => toRow(log as EventLog, "Salary Paid", `${short((log as EventLog).args[0] as string)} · confidential amount`)),
          ...closed.map(log => toRow(log as EventLog, "Payroll Closed", "Contract closed by employer")),
        ].sort((a, b) => b.blockNumber - a.blockNumber);
      }

      // Resolve block timestamps
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
  }, [contractAddress, filterAddress]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const subtitle = filterAddress
    ? `Your transactions · ${rows.length} event${rows.length !== 1 ? "s" : ""}`
    : `All payroll events · ${rows.length} event${rows.length !== 1 ? "s" : ""}`;

  const emptyText = filterAddress
    ? "No transactions found for your wallet in the last 20,000 blocks."
    : "No transactions found in the last 20,000 blocks.";

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Transaction History</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>{subtitle}</p>
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

      {/* Loading */}
      {loading && (
        <div className="card" style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 13 }}>
          Scanning on-chain events…
        </div>
      )}

      {/* Empty state */}
      {!loading && rows.length === 0 && !error && (
        <div className="card" style={{ textAlign: "center", padding: "48px 0", color: "var(--muted)", fontSize: 13 }}>
          {emptyText}
          <p style={{ fontSize: 12, marginTop: 8, color: "var(--muted)" }}>
            {filterAddress
              ? "Salary payments and status changes appear here."
              : "Events appear here after funding, adding employees, and paying salaries."}
          </p>
        </div>
      )}

      {/* Event list */}
      {!loading && rows.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map(row => {
            const badge = BADGE[row.label] ?? { bg: "var(--bg-alt)", color: "var(--muted)", border: "var(--border)" };
            return (
              <div
                key={row.id}
                className="card"
                style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 18px" }}
              >
                <span style={{
                  padding: "3px 10px",
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}>
                  {row.label.toUpperCase()}
                </span>

                <span style={{ fontSize: 13, flex: 1, minWidth: 100 }}>
                  {row.detail}
                </span>

                <span style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {row.timestamp
                    ? new Date(row.timestamp * 1000).toLocaleString()
                    : `Block #${row.blockNumber}`}
                </span>

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
