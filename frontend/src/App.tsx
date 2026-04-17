import { useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import {
  FACTORY_ADDRESS, FACTORY_ABI, PAYROLL_ABI,
  CONF_ERC20_ABI, CONF_USDC_ADDRESS, CONF_USDT_ADDRESS,
  SALARY_TOKEN_LABEL, SUPPORTED_TOKENS,
} from "./contract";
import { useFhevm } from "./useFhevm";
import { TxHistory } from "./TxHistory";
import { SwapTab } from "./SwapTab";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeRow = { address: string; active: boolean; lastPaidAt: number; salaryToken: number };
type StatusMsg   = { text: string; ok: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const short   = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtDate = (ts: number) => ts === 0 ? "Never" : new Date(ts * 1000).toLocaleString();

// ─── Icons ────────────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0110 0v4"/>
    </svg>
  );
}

function EyeIcon({ off }: { off?: boolean }) {
  return off ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

// ─── Dark mode hook ───────────────────────────────────────────────────────────

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("zp-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.body.classList.toggle("dark", dark);
    localStorage.setItem("zp-theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, () => setDark(d => !d)] as const;
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [dark, toggleDark] = useDarkMode();
  const [employerAddr, setEmployerAddr] = useState("");
  const fhevm = useFhevm(employerAddr);

  // Factory flow
  const [payrollAddress, setPayrollAddress] = useState("");
  const [setupPhase,     setSetupPhase]     = useState<"checking" | "setup" | "ready">("checking");
  const [contractInput,  setContractInput]  = useState("");
  const [deploying,      setDeploying]      = useState(false);

  // Role view — employers can toggle to see the employee panel
  const [viewAs, setViewAs] = useState<"employer" | "employee">("employer");

  const [employees,         setEmployees]         = useState<EmployeeRow[]>([]);
  const [status,            setStatus]            = useState<StatusMsg | null>(null);
  const [busy,              setBusy]              = useState(false);
  const [tab,               setTab]               = useState<"overview" | "history" | "swap">("overview");
  const [walletBalance,     setWalletBalance]     = useState<string | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());

  // employee names stored in localStorage (payrollAddress:employeeAddress → name)
  const [empNames, setEmpNames] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("empNames") || "{}"); } catch { return {}; }
  });

  const saveEmpName = (payroll: string, addr: string, name: string) => {
    const key = `${payroll.toLowerCase()}:${addr.toLowerCase()}`;
    const next = { ...empNames, [key]: name };
    setEmpNames(next);
    localStorage.setItem("empNames", JSON.stringify(next));
  };

  const getEmpName = (addr: string) =>
    empNames[`${payrollAddress.toLowerCase()}:${addr.toLowerCase()}`] ?? "";

  // form fields
  const [newEmployee,    setNewEmployee]    = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newSalary,      setNewSalary]      = useState("");
  const [newSalaryToken, setNewSalaryToken] = useState<number>(1); // 1=cUSDC,2=cUSDT


  // inline per-row update form
  const [inlineUpdateAddr,   setInlineUpdateAddr]   = useState<string | null>(null);
  const [inlineUpdateSalary, setInlineUpdateSalary] = useState("");
  const [inlineUpdateToken,  setInlineUpdateToken]  = useState<number>(1);

  const [linkCopied, setLinkCopied] = useState(false);

  // operator approval state
  const [operatorApproved, setOperatorApproved] = useState<Record<string, boolean>>({});
  const [approvingOp,      setApprovingOp]      = useState<Record<string, boolean>>({});

  // decrypted salary values + visibility toggles (employee self-view)
  const [mySalaryDecrypted,    setMySalaryDecrypted]    = useState<string | null>(null);
  const [myTotalPaidDecrypted, setMyTotalPaidDecrypted] = useState<string | null>(null);
  const [showSalary,           setShowSalary]           = useState(false);
  const [showTotalPaid,        setShowTotalPaid]        = useState(false);

  // per-employee salary decrypt state (employer view)
  const [empSalaries,     setEmpSalaries]     = useState<Record<string, string>>({});
  const [empSalaryShown,  setEmpSalaryShown]  = useState<Record<string, boolean>>({});
  const [empDecrypting,   setEmpDecrypting]   = useState<Record<string, boolean>>({});

  // ETH/USD price
  const [ethPrice, setEthPrice] = useState<number | null>(null);

  const ok   = (text: string) => setStatus({ text, ok: true });
  const fail = (text: string) => setStatus({ text, ok: false });

  const factory = () => {
    if (!fhevm.provider) throw new Error("Not connected");
    return new Contract(FACTORY_ADDRESS, FACTORY_ABI, fhevm.provider);
  };

  const contract = (write = false) => {
    if (!fhevm.signer || !fhevm.provider) throw new Error("Not connected");
    if (!payrollAddress) throw new Error("No payroll contract selected");
    return new Contract(payrollAddress, PAYROLL_ABI, write ? fhevm.signer : fhevm.provider);
  };

  // ─── ETH price ────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
          { headers: { Accept: "application/json" } }
        );
        const data = await res.json();
        setEthPrice(data?.ethereum?.usd ?? null);
      } catch { /* silently ignore — price is display-only */ }
    };
    fetchPrice();
    const id = setInterval(fetchPrice, 60_000); // refresh every minute
    return () => clearInterval(id);
  }, []);

  // Convert ETH amount string → formatted USD string (returns null if price unavailable)
  const toUsd = (ethAmt: string | number | null): string | null => {
    if (!ethPrice || ethAmt === null) return null;
    const n = typeof ethAmt === "string" ? parseFloat(ethAmt) : ethAmt;
    if (isNaN(n)) return null;
    return `$${(n * ethPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // ─── Factory check ─────────────────────────────────────────────────────────

  // When wallet connects, look up whether this address already has a deployed
  // payroll via the factory. If yes → go straight to the app. If no → setup.
  useEffect(() => {
    if (!fhevm.address || !fhevm.provider) return;
    setSetupPhase("checking");
    setPayrollAddress("");
    setEmployees([]);
    setWalletBalance(null);
    setMySalaryDecrypted(null);
    setMyTotalPaidDecrypted(null);
    setShowSalary(false);
    setShowTotalPaid(false);
    setViewAs("employer");

    (async () => {
      try {
        const addr = await factory().userPayroll(fhevm.address) as string;
        if (addr && addr !== ethers.ZeroAddress) {
          setPayrollAddress(addr);
          setSetupPhase("ready");
        } else {
          setSetupPhase("setup");
        }
      } catch {
        setSetupPhase("setup");
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fhevm.address]);

  // When a payroll address is set (after deploy or manual entry), load data
  useEffect(() => {
    if (!payrollAddress) return;
    loadEmployerAddr();
    loadEmployees();
    loadBalances();
    checkOperatorApprovals();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payrollAddress]);

  const loadBalances = async () => {
    if (!fhevm.provider || !fhevm.address) return;
    try {
      const wWei = await fhevm.provider.getBalance(fhevm.address);
      setWalletBalance(parseFloat(ethers.formatEther(wWei)).toFixed(4));
    } catch { /* ignore */ }
  };

  // ─── Deploy / connect handlers ─────────────────────────────────────────────

  const handleDeploy = async () => {
    if (!fhevm.signer || !fhevm.provider) return;
    setDeploying(true);
    setStatus(null);
    try {
      const factoryWithSigner = new Contract(FACTORY_ADDRESS, FACTORY_ABI, fhevm.signer);
      const tx = await factoryWithSigner.create();
      const receipt = await tx.wait();
      // Pull the deployed address from the PayrollCreated event
      const iface = new ethers.Interface(FACTORY_ABI as unknown as string[]);
      let deployed = "";
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "PayrollCreated") {
            deployed = parsed.args[1] as string;
            break;
          }
        } catch { /* skip unrelated logs */ }
      }
      if (!deployed) throw new Error("Could not find deployed contract address in receipt");
      setPayrollAddress(deployed);
      setSetupPhase("ready");
      ok("Payroll contract deployed!");
    } catch (e: unknown) {
      setStatus({ text: e instanceof Error ? e.message : "Deploy failed", ok: false });
    } finally {
      setDeploying(false);
    }
  };

  const handleConnectContract = (addrOverride?: string) => {
    const addr = (addrOverride ?? contractInput).trim();
    if (!ethers.isAddress(addr)) {
      setStatus({ text: "Invalid address — please enter a valid 0x… address", ok: false });
      return;
    }
    setPayrollAddress(addr);
    setSetupPhase("ready");
  };

  // Auto-fill contract address from ?payroll= URL param (shareable employee link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payroll");
    if (p && ethers.isAddress(p)) setContractInput(p);
  }, []);

  // Once wallet is connected + setup screen shown, auto-connect if URL had a valid payroll param
  useEffect(() => {
    if (setupPhase !== "setup") return;
    const params = new URLSearchParams(window.location.search);
    const p = params.get("payroll");
    if (p && ethers.isAddress(p)) handleConnectContract(p);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupPhase]);

  const loadEmployerAddr = async () => {
    try {
      const addr = await contract().employer();
      setEmployerAddr(addr as string);
    } catch { /* ignore */ }
  };

  const loadEmployees = async () => {
    try {
      const list: string[] = await contract().getEmployeeList();
      const rows = await Promise.all(
        list.map(async (addr) => {
          const [active, lastPaidAt, salaryToken] = await contract().getEmployeeInfo(addr);
          return { address: addr, active: active as boolean, lastPaidAt: Number(lastPaidAt), salaryToken: Number(salaryToken) };
        })
      );
      setEmployees(rows.filter(r => r.active));
    } catch (e) {
      console.error("loadEmployees failed:", e);
      setEmployees([]);
    }
  };

  // Check if employer has approved this payroll as operator for cUSDC/cUSDT
  const checkOperatorApprovals = async () => {
    if (!fhevm.provider || !fhevm.address || !payrollAddress) return;
    try {
      const cUsdc = new Contract(CONF_USDC_ADDRESS, CONF_ERC20_ABI, fhevm.provider);
      const cUsdt = new Contract(CONF_USDT_ADDRESS, CONF_ERC20_ABI, fhevm.provider);
      const [approvedUsdc, approvedUsdt] = await Promise.all([
        cUsdc.isOperatorApproved(payrollAddress, fhevm.address),
        cUsdt.isOperatorApproved(payrollAddress, fhevm.address),
      ]);
      setOperatorApproved({ cUSDC: approvedUsdc as boolean, cUSDT: approvedUsdt as boolean });
    } catch { /* ignore */ }
  };

  const handleApproveOperator = async (tokenSymbol: "cUSDC" | "cUSDT") => {
    if (!fhevm.signer) return;
    setApprovingOp(prev => ({ ...prev, [tokenSymbol]: true }));
    try {
      const addr = tokenSymbol === "cUSDC" ? CONF_USDC_ADDRESS : CONF_USDT_ADDRESS;
      const cToken = new Contract(addr, CONF_ERC20_ABI, fhevm.signer);
      const tx = await cToken.approveOperator(payrollAddress, true);
      await tx.wait();
      setOperatorApproved(prev => ({ ...prev, [tokenSymbol]: true }));
      ok(`Payroll contract approved to pay salaries in ${tokenSymbol}.`);
    } catch (e) {
      fail(e instanceof Error ? e.message : "Approval failed");
    } finally {
      setApprovingOp(prev => ({ ...prev, [tokenSymbol]: false }));
    }
  };

  // ─── Actions ───────────────────────────────────────────────────────────────

  const wrap = async (label: string, fn: () => Promise<void>) => {
    setBusy(true);
    setStatus(null);
    try {
      await fn();
      ok(`${label} succeeded.`);
      await Promise.all([loadEmployees(), loadBalances()]);
    } catch (e: unknown) {
      fail(e instanceof Error ? e.message : `${label} failed`);
    } finally {
      setBusy(false);
    }
  };


  // Fully disconnect this wallet from the app (client-side only)
  const handleLogout = () => {
    setPayrollAddress("");
    setSetupPhase("checking");
    setEmployerAddr("");
    setEmployees([]);
    setWalletBalance(null);
    setStatus(null);
    setViewAs("employer");
    fhevm.disconnect();
  };

  // Convert salary input to token units (cUSDC/cUSDT use 6 decimals)
  const parseSalaryAmount = (amount: string): bigint => ethers.parseUnits(amount, 6);

  const handleAddEmployee = () =>
    wrap("Add employee", async () => {
      if (!fhevm.instance) throw new Error("FHEVM instance not ready");
      const salaryWei = parseSalaryAmount(newSalary);
      const input = fhevm.instance.createEncryptedInput(payrollAddress, fhevm.address);
      const zkProof = input.add64(salaryWei).generateZKProof();
      const { handles, inputProof } = await fhevm.instance.requestZKProofVerification(zkProof);
      const tx = await contract(true).addEmployee(newEmployee, newSalaryToken, 0n, handles[0], inputProof);
      await tx.wait();
      if (newEmployeeName.trim()) saveEmpName(payrollAddress, newEmployee, newEmployeeName.trim());
      setNewEmployee(""); setNewSalary(""); setNewEmployeeName("");
    });

  const handleInlineUpdate = (addr: string) =>
    wrap("Update salary", async () => {
      if (!fhevm.instance) throw new Error("FHEVM instance not ready");
      const salaryWei = parseSalaryAmount(inlineUpdateSalary);
      const input = fhevm.instance.createEncryptedInput(payrollAddress, fhevm.address);
      const zkProof = input.add64(salaryWei).generateZKProof();
      const { handles, inputProof } = await fhevm.instance.requestZKProofVerification(zkProof);
      const tx = await contract(true).updateSalary(addr, inlineUpdateToken, 0n, handles[0], inputProof);
      await tx.wait();
      setInlineUpdateAddr(null); setInlineUpdateSalary("");
    });

  const handleRemove = (addr: string) =>
    wrap("Remove employee", async () => {
      const [active] = await contract().getEmployeeInfo(addr);
      if (!active) throw new Error("Employee is not active on this contract — re-add them first.");
      const tx = await contract(true).removeEmployee(addr);
      await tx.wait();
    });

  const handlePay = (addr: string) =>
    wrap("Pay salary", async () => {
      const [active] = await contract().getEmployeeInfo(addr);
      if (!active) throw new Error("Employee is not active on this contract.");
      const tx = await contract(true).paySalary(addr);
      await tx.wait();
    });

  const handlePayAll = () =>
    wrap("Pay all", async () => {
      const tx = await contract(true).payAll();
      await tx.wait();
    });

  const handlePaySelected = () =>
    wrap(`Pay selected (${selectedEmployees.size})`, async () => {
      for (const addr of selectedEmployees) {
        const tx = await contract(true).paySalary(addr);
        await tx.wait();
      }
      setSelectedEmployees(new Set());
    });

  const toggleSelect = (addr: string) =>
    setSelectedEmployees(prev => {
      const next = new Set(prev);
      next.has(addr) ? next.delete(addr) : next.add(addr);
      return next;
    });

  // ─── Decrypt ───────────────────────────────────────────────────────────────

  const userDecryptHandle = async (handle: string): Promise<bigint> => {
    if (!fhevm.instance || !fhevm.signer) throw new Error("FHEVM instance not ready");
    const { publicKey, privateKey } = fhevm.instance.generateKeypair();
    const startTimestamp = Math.floor(Date.now() / 1000);
    const durationDays = 100;
    const eip712 = fhevm.instance.createEIP712(publicKey, [payrollAddress], startTimestamp, durationDays);
    const signature = await fhevm.signer.signTypedData(
      eip712.domain,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification as any },
      eip712.message,
    );
    const results = await fhevm.instance.userDecrypt(
      [{ handle, contractAddress: payrollAddress }],
      privateKey, publicKey, signature,
      [payrollAddress], fhevm.address, startTimestamp, durationDays,
    );
    return Object.values(results)[0] as bigint;
  };

  // Confirm the connected wallet is an active employee before attempting decrypt.
  // Returns true if registered, false + sets error if not.
  const assertEmployeeRegistered = async (): Promise<boolean> => {
    try {
      const [active] = await contract().getEmployeeInfo(fhevm.address);
      if (!active) {
        fail(
          "Your wallet is not registered on this payroll contract. " +
          "Make sure you are using the correct contract address and that your employer has added you."
        );
        return false;
      }
      return true;
    } catch {
      fail("Could not verify your registration status. Check the contract address and try again.");
      return false;
    }
  };

  // Format a decrypted salary value — cUSDC/cUSDT use 6 decimals
  const formatTokenAmount = (val: bigint, salaryToken: number): string => {
    const sym = SALARY_TOKEN_LABEL[salaryToken] ?? "cUSDC";
    const amt = ethers.formatUnits(val, 6);
    return `${parseFloat(amt).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
  };

  const handleDecryptMySalary = async () => {
    if (!fhevm.instance) return fail("FHEVM instance not ready");
    setBusy(true); setStatus(null);
    try {
      if (!await assertEmployeeRegistered()) return;
      const [, , salaryToken] = await contract().getEmployeeInfo(fhevm.address);
      const handle = await contract(true).getMySalary();
      const val = await userDecryptHandle(handle);
      setMySalaryDecrypted(formatTokenAmount(val, Number(salaryToken)));
      setShowSalary(true);
    } catch (e: unknown) {
      fail(e instanceof Error ? e.message : "Decryption failed");
    } finally { setBusy(false); }
  };

  const handleDecryptMyTotalPaid = async () => {
    if (!fhevm.instance) return fail("FHEVM instance not ready");
    setBusy(true); setStatus(null);
    try {
      if (!await assertEmployeeRegistered()) return;
      const [, , salaryToken] = await contract().getEmployeeInfo(fhevm.address);
      const handle = await contract(true).getMyTotalPaid();
      const val = await userDecryptHandle(handle);
      setMyTotalPaidDecrypted(formatTokenAmount(val, Number(salaryToken)));
      setShowTotalPaid(true);
    } catch (e: unknown) {
      fail(e instanceof Error ? e.message : "Decryption failed");
    } finally { setBusy(false); }
  };

  // Employer: decrypt a specific employee's salary.
  // Must use contract(true) (signer) so eth_call sets from=employer,
  // satisfying the onlyEmployer modifier on getEmployeeSalary.
  const handleDecryptEmpSalary = async (addr: string) => {
    if (!fhevm.instance) return fail("FHEVM instance not ready");
    setEmpDecrypting(prev => ({ ...prev, [addr]: true }));
    try {
      const emp = employees.find(e => e.address === addr);
      const handle = await contract(true).getEmployeeSalary(addr);
      const val = await userDecryptHandle(handle);
      setEmpSalaries(prev => ({ ...prev, [addr]: formatTokenAmount(val, emp?.salaryToken ?? 1) }));
      setEmpSalaryShown(prev => ({ ...prev, [addr]: true }));
    } catch (e: unknown) {
      fail(e instanceof Error ? e.message : "Decryption failed");
    } finally {
      setEmpDecrypting(prev => ({ ...prev, [addr]: false }));
    }
  };

  const toggleEmpSalaryVisibility = (addr: string) =>
    setEmpSalaryShown(prev => ({ ...prev, [addr]: !prev[addr] }));

  const activeCount = employees.filter(e => e.active).length;
  // showEmployerView drives all panel visibility — employers can toggle via viewAs
  const showEmployerView = fhevm.isEmployer && viewAs === "employer";

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>

      {/* ── Top nav bar ── */}
      <header style={{
        borderBottom: "1.5px solid var(--border)",
        background: dark ? "rgba(20,20,20,0.85)" : "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        position: "sticky", top: 0, zIndex: 50,
        boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* ZecurePay logo mark */}
            <div style={{ width: 32, height: 32, borderRadius: 10, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(255,210,8,0.4)", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 18, letterSpacing: "-0.3px", color: "var(--text)" }}>ZecurePay</span>
            <span className="pill-accent">FHEVM</span>
          </div>
          {fhevm.address ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-alt)", border: "1.5px solid var(--border)", borderRadius: 9999, padding: "5px 14px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#16a34a", flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: "var(--text-2)", fontFamily: "monospace" }}>{short(fhevm.address)}</span>
                {walletBalance && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                    {walletBalance} ETH{toUsd(walletBalance) ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {toUsd(walletBalance)}</span> : ""}
                  </span>
                )}
              </div>
              <span className={`tag ${fhevm.isEmployer ? "tag-active" : "tag-encrypted"}`}>
                {fhevm.isEmployer ? "Employer" : "Employee"}
              </span>
              {fhevm.isEmployer && setupPhase === "ready" && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setViewAs(v => v === "employer" ? "employee" : "employer")}
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  title="Switch view"
                >
                  {viewAs === "employer" ? "View as Employee" : "View as Employer"}
                </button>
              )}
              {fhevm.isEmployer && setupPhase === "ready" && payrollAddress && (
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?payroll=${payrollAddress}`;
                    navigator.clipboard.writeText(url);
                    ok("Employee link copied to clipboard!");
                    setLinkCopied(true);
                    setTimeout(() => setLinkCopied(false), 2000);
                  }}
                  style={{ fontSize: 11, padding: "4px 10px" }}
                >
                  {linkCopied ? "Copied!" : "Share Employee Link"}
                </button>
              )}
              {setupPhase === "ready" && (
                <button
                  className="btn-danger btn-sm"
                  onClick={handleLogout}
                  style={{ fontSize: 11, padding: "4px 10px" }}
                  title="Disconnect from this payroll"
                >
                  Disconnect
                </button>
              )}
            </div>
          ) : (
            <button className="btn-primary" onClick={fhevm.connect} disabled={fhevm.loading}>
              {fhevm.loading ? "Connecting…" : "Connect Wallet"}
            </button>
          )}

          {/* Dark / Light toggle */}
          <button
            onClick={toggleDark}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              background: "var(--surface-2)",
              border: "1.5px solid var(--border)",
              borderRadius: 8,
              padding: "6px 9px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.2s, border-color 0.2s",
            }}
          >
            {dark ? (
              /* Sun icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
            ) : (
              /* Moon icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "40px 28px 80px" }}>

        {/* ── Main render switch ── */}
        {!fhevm.address ? (
          /* Not connected — hero */
          <div style={{ textAlign: "center", padding: "72px 0 80px" }}>
            {/* Logo mark */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 32 }}>
              <div style={{ width: 80, height: 80, borderRadius: 22, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(255,210,8,0.35)" }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <span className="pill-accent" style={{ marginBottom: 16, display: "inline-flex" }}>Powered by Zama FHEVM</span>
            </div>

            <h1 style={{ fontSize: 48, marginBottom: 16, lineHeight: 1.15 }}>
              <span className="gradient-text">ZecurePay</span>
            </h1>
            <p style={{ color: "var(--text-2)", maxWidth: 480, margin: "0 auto 16px", lineHeight: 1.8, fontSize: 15 }}>
              The first fully confidential on-chain payroll. Salary rates are encrypted using
              homomorphic encryption — no one can see what your employees earn.
            </p>

            {/* Feature pills */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 40 }}>
              {["🔒 FHE-encrypted salaries", "⛓ Sepolia testnet", "💸 Real ETH transfers", "👁 Only you can decrypt"].map(f => (
                <span key={f} style={{ fontSize: 12, fontWeight: 500, color: "var(--text-2)", background: "var(--surface)", border: "1.5px solid var(--border)", padding: "5px 14px", borderRadius: 9999, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>{f}</span>
              ))}
            </div>

            <button className="btn-primary" onClick={fhevm.connect} disabled={fhevm.loading} style={{ padding: "14px 36px", fontSize: 15, borderRadius: 10 }}>
              {fhevm.loading ? "Initializing FHE engine…" : "Connect MetaMask to Get Started"}
            </button>
            {fhevm.loading && <p style={{ marginTop: 14, fontSize: 12, color: "var(--muted)" }}>Loading WASM cryptography modules — takes ~10 s on first visit</p>}
            {fhevm.error && <p style={{ color: "var(--danger)", marginTop: 12, fontSize: 13 }}>{fhevm.error}</p>}

            {/* How it works strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, maxWidth: 700, margin: "56px auto 0", textAlign: "left" }}>
              {[
                { icon: "🏗", title: "Deploy", body: "Employer deploys a private payroll contract owned by their wallet." },
                { icon: "🔐", title: "Add & Encrypt", body: "Add employees with salaries encrypted client-side before hitting the chain." },
                { icon: "💰", title: "Pay", body: "ETH is transferred directly. Only the employee can reveal their own salary rate." },
              ].map(s => (
                <div key={s.title} className="card" style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>{s.icon}</div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: 15, marginBottom: 6 }}>{s.title}</div>
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        ) : setupPhase === "checking" ? (
          /* Checking factory */
          <div style={{ textAlign: "center", padding: "80px 0", color: "var(--muted)", fontSize: 13 }}>
            Checking your account…
          </div>
        ) : setupPhase === "setup" ? (
          /* Setup screen */
          <div style={{ maxWidth: 480, margin: "60px auto 0", display: "flex", flexDirection: "column", gap: 16 }}>
            {status && (
              <div style={{
                background: status.ok ? "var(--success-dim)" : "var(--danger-dim)",
                border: `1px solid ${status.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                borderRadius: "var(--radius-sm)", padding: "11px 16px", fontSize: 13,
                color: status.ok ? "var(--success)" : "var(--danger)",
              }}>
                {status.text}
              </div>
            )}
            {/* Deploy card */}
            <div className="card" style={{ borderColor: "rgba(255,209,0,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--accent-dim)", border: "1px solid rgba(255,209,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <LockIcon />
                </div>
                <div>
                  <h2 style={{ marginBottom: 2 }}>I'm an Employer</h2>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Deploy your own private payroll contract</p>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 16 }}>
                Creates a fresh <strong style={{ color: "var(--text)" }}>ZecurePay</strong> contract
                owned by your wallet. One-time gas fee (~0.001 ETH). Salary data stays private forever.
              </p>
              <button className="btn-primary" onClick={handleDeploy} disabled={deploying} style={{ justifyContent: "center", width: "100%" }}>
                {deploying ? "Deploying…" : "Deploy My Payroll Contract"}
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)" }}>— or —</div>
            {/* Employee card */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--success-dim)", border: "1px solid rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div>
                  <h2 style={{ marginBottom: 2 }}>I'm an Employee</h2>
                  <p style={{ fontSize: 12, color: "var(--muted)" }}>Enter your employer's contract address</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  placeholder="0x… employer's payroll contract"
                  value={contractInput}
                  onChange={e => setContractInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && contractInput && handleConnectContract()}
                  style={{ flex: 1 }}
                />
                <button className="btn-ghost" onClick={() => handleConnectContract()} disabled={!contractInput} style={{ whiteSpace: "nowrap" }}>
                  Connect
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Ready — full app */
          <>
            {/* ── Closed contract banner ── */}
            {/* ── Status banner ── */}
            {status && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                background: status.ok ? "var(--success-dim)" : "var(--danger-dim)",
                border: `1px solid ${status.ok ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`,
                borderRadius: "var(--radius-sm)", padding: "11px 16px", marginBottom: 24,
                fontSize: 13, color: status.ok ? "var(--success)" : "var(--danger)",
              }}>
                <span>{status.ok ? "✓" : "✕"}</span>
                {status.text}
              </div>
            )}

            {/* ── Stat row (employer) ── */}
            {showEmployerView && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
                <div className="card" style={{ padding: "16px 20px" }}>
                  <div className="stat-label">Active Employees</div>
                  <div className="stat-value" style={{ marginTop: 6 }}>{activeCount}</div>
                </div>
                <div className="card" style={{ padding: "16px 20px" }}>
                  <div className="stat-label">Your Wallet (ETH)</div>
                  <div className="stat-value" style={{ marginTop: 6 }}>{walletBalance ?? "—"}</div>
                  {walletBalance && toUsd(walletBalance) && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>≈ {toUsd(walletBalance)}</div>}
                </div>
                {(["cUSDC", "cUSDT"] as const).map(sym => (
                  <div key={sym} className="card" style={{ padding: "16px 20px" }}>
                    <div className="stat-label">{sym} Operator</div>
                    <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999,
                        background: operatorApproved[sym] ? "var(--success-dim)" : "var(--danger-dim)",
                        color: operatorApproved[sym] ? "var(--success)" : "var(--danger)",
                      }}>
                        {operatorApproved[sym] ? "✓ Approved" : "Not approved"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab bar ── */}
            <div style={{ display: "flex", gap: 4, background: "var(--bg-alt)", border: "1.5px solid var(--border)", borderRadius: 10, padding: 4, marginBottom: 28, width: "fit-content" }}>
              {([
                { key: "overview", label: "Overview" },
                { key: "history",  label: "Tx History" },
                { key: "swap",     label: "⇄ Swap" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setTab(key)} style={{
                  background: tab === key ? (key === "swap" ? "var(--accent)" : "var(--surface)") : "transparent",
                  border: "none",
                  borderRadius: 7,
                  color: tab === key ? (key === "swap" ? "#000" : "var(--text)") : "var(--muted)",
                  padding: "7px 20px", fontSize: 13,
                  fontWeight: tab === key ? 700 : 500,
                  boxShadow: tab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 0.15s ease",
                  transform: "none",
                }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "swap" ? (
              fhevm.provider && fhevm.signer && fhevm.instance ? (
                <SwapTab
                  provider={fhevm.provider}
                  signer={fhevm.signer}
                  address={fhevm.address}
                  instance={fhevm.instance}
                  isEmployer={fhevm.isEmployer}
                />
              ) : (
                <div className="card" style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: 13 }}>
                  Connect your wallet to use the swap.
                </div>
              )
            ) : tab === "history" ? (
              fhevm.provider && payrollAddress && (
                <TxHistory
                  provider={fhevm.provider}
                  contractAddress={payrollAddress}
                  filterAddress={showEmployerView ? undefined : fhevm.address}
                />
              )
            ) : (
              <>
                {/* ══ EMPLOYER PANEL ══ */}
                {showEmployerView && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>

                    {/* Token Payroll Info */}
                    <div className="card" style={{ gridColumn: "1 / -1" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <div>
                          <h3 style={{ marginBottom: 4 }}>Confidential Token Payroll</h3>
                          <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
                            Salaries are paid from your <strong style={{ color: "var(--text)" }}>cUSDC</strong> or <strong style={{ color: "var(--text)" }}>cUSDT</strong> wallet balance directly to each employee.
                            All transfers are fully encrypted — no amounts visible on Etherscan.
                          </p>
                        </div>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--accent-dim)", border: "1px solid rgba(255,209,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16 }}>
                          <LockIcon />
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 220, background: "var(--bg-alt)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>How it works</div>
                          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "var(--text-2)", lineHeight: 2 }}>
                            <li>Use the <strong style={{ color: "var(--text)" }}>⇄ Swap</strong> tab to wrap USDC/USDT into cUSDC/cUSDT</li>
                            <li>Approve this payroll contract as operator in <strong style={{ color: "var(--text)" }}>Token Approvals</strong> below</li>
                            <li>Add employees with a cUSDC or cUSDT salary, then click <strong style={{ color: "var(--text)" }}>Pay</strong></li>
                          </ol>
                        </div>
                      </div>

                    </div>

                    {/* Add Employee */}
                    <div className="card">
                      <h3 style={{ marginBottom: 16 }}>Add Employee</h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div>
                          <label>Name <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
                          <input placeholder="e.g. John Doe" value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} />
                        </div>
                        <div>
                          <label>Wallet address</label>
                          <input placeholder="0x…" value={newEmployee} onChange={e => setNewEmployee(e.target.value)} />
                        </div>
                        {/* Token selector */}
                        <div>
                          <label>Salary token</label>
                          <div style={{ display: "flex", gap: 6 }}>
                            {SUPPORTED_TOKENS.map(t => ({ label: t.confSymbol, idx: t.tokenIndex, color: t.color })).map(opt => (
                              <button
                                key={opt.idx}
                                type="button"
                                onClick={() => setNewSalaryToken(opt.idx)}
                                style={{
                                  flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 700,
                                  background: newSalaryToken === opt.idx ? opt.color : "var(--surface-2)",
                                  color: newSalaryToken === opt.idx ? "#fff" : "var(--text-2)",
                                  border: `1.5px solid ${newSalaryToken === opt.idx ? opt.color : "var(--border)"}`,
                                  borderRadius: "var(--radius-sm)", transform: "none",
                                }}
                              >{opt.label}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label>Monthly salary ({newSalaryToken === 1 ? "cUSDC" : "cUSDT"})</label>
                          <input type="number" placeholder="500" value={newSalary} onChange={e => setNewSalary(e.target.value)} />
                        </div>
                        <button className="btn-primary" onClick={handleAddEmployee} disabled={busy || !newEmployee || !newSalary} style={{ justifyContent: "center", marginTop: 4 }}>
                          Add Employee
                        </button>
                      </div>
                      <p style={{ marginTop: 12, fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                        <LockIcon /> Salary encrypted client-side — rate is never readable on-chain
                      </p>
                    </div>

                    {/* Operator approvals */}
                    <div className="card">
                      <h3 style={{ marginBottom: 10 }}>Token Salary Approvals</h3>
                      <p style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
                        One-time approval required before paying cUSDC or cUSDT salaries.
                        Make sure you have wrapped USDC/USDT first via the Swap tab.
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {(["cUSDC", "cUSDT"] as const).map(sym => (
                          <div key={sym} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--bg-alt)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>{sym}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                                background: operatorApproved[sym] ? "var(--success-dim)" : "var(--danger-dim)",
                                color: operatorApproved[sym] ? "var(--success)" : "var(--danger)",
                              }}>
                                {operatorApproved[sym] ? "✓ Approved" : "Not approved"}
                              </span>
                            </div>
                            {!operatorApproved[sym] && (
                              <button
                                className="btn-primary btn-sm"
                                onClick={() => handleApproveOperator(sym)}
                                disabled={approvingOp[sym] || busy}
                              >
                                {approvingOp[sym] ? "Approving…" : `Approve ${sym}`}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ EMPLOYEE LIST (employer only) ══ */}
                {showEmployerView && <div style={{ marginBottom: 28 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <h2>Employees</h2>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "2px 8px", borderRadius: 9999 }}>
                        {employees.length}
                      </span>
                    </div>
                    {showEmployerView && (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-ghost btn-sm" onClick={handlePaySelected} disabled={busy || selectedEmployees.size === 0}>
                          Pay Selected ({selectedEmployees.size})
                        </button>
                        <button className="btn-primary btn-sm" onClick={handlePayAll} disabled={busy || activeCount === 0}>
                          Pay All ({activeCount})
                        </button>
                      </div>
                    )}
                  </div>

                  {employees.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)" }}>
                      <div style={{ fontSize: 28, marginBottom: 10 }}>👤</div>
                      <p style={{ fontSize: 13 }}>No employees registered yet.</p>
                      {showEmployerView && <p style={{ fontSize: 12, marginTop: 6 }}>Use the form above to add your first employee.</p>}
                    </div>
                  ) : (
                    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                      {/* Table header */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: showEmployerView ? "28px 1fr 90px 72px 150px 160px 190px" : "1fr 90px 72px 150px 160px",
                        gap: "0 12px", padding: "10px 16px",
                        borderBottom: "1px solid var(--border)", background: "var(--surface-2)",
                      }}>
                        {showEmployerView && <div />}
                        {["Address", "Status", "Token", "Last Paid", "Salary"].map(h => (
                          <div key={h} style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</div>
                        ))}
                        {showEmployerView && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Actions</div>}
                      </div>

                      {employees.map((emp, i) => {
                        const decrypted  = empSalaries[emp.address];
                        const shown      = empSalaryShown[emp.address];
                        const decrypting = empDecrypting[emp.address];
                        const isEditing  = inlineUpdateAddr === emp.address;
                        const tokenLabel = SALARY_TOKEN_LABEL[emp.salaryToken] ?? "ETH";
                        const tokenColor = emp.salaryToken === 1 ? "#2775ca" : emp.salaryToken === 2 ? "#26a17b" : "#627eea";
                        return (
                          <div key={emp.address} style={{
                            borderBottom: i < employees.length - 1 ? "1px solid var(--border)" : "none",
                          }}>
                            {/* Main row */}
                            <div style={{
                              display: "grid",
                              gridTemplateColumns: showEmployerView ? "28px 1fr 90px 72px 150px 160px 190px" : "1fr 90px 72px 150px 160px",
                              gap: "0 12px", padding: "12px 16px", alignItems: "center",
                              background: selectedEmployees.has(emp.address) ? "rgba(255,209,0,0.03)" : isEditing ? "var(--bg-alt)" : "transparent",
                              transition: "background 0.1s",
                            }}>
                              {showEmployerView && (
                                <input type="checkbox" checked={selectedEmployees.has(emp.address)} onChange={() => toggleSelect(emp.address)} />
                              )}
                              <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                                {getEmpName(emp.address) && (
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {getEmpName(emp.address)}
                                  </span>
                                )}
                                <code style={{ fontSize: 11, color: "var(--text-2)" }}>{emp.address}</code>
                              </div>
                              <span className={`tag ${emp.active ? "tag-active" : "tag-inactive"}`}>{emp.active ? "Active" : "Inactive"}</span>

                              {/* Token badge */}
                              <span style={{
                                fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999,
                                background: `${tokenColor}22`, color: tokenColor,
                                border: `1px solid ${tokenColor}44`, whiteSpace: "nowrap",
                              }}>{tokenLabel}</span>

                              <span style={{ fontSize: 12, color: "var(--text-2)" }}>{fmtDate(emp.lastPaidAt)}</span>

                              {/* Salary cell — decrypt/reveal/hide */}
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {!decrypted ? (
                                  showEmployerView ? (
                                    <button
                                      className="btn-ghost btn-sm"
                                      onClick={() => handleDecryptEmpSalary(emp.address)}
                                      disabled={decrypting || busy}
                                      style={{ fontSize: 11, padding: "4px 10px" }}
                                    >
                                      {decrypting ? "…" : <><LockIcon /> Reveal</>}
                                    </button>
                                  ) : (
                                    <span className="tag tag-encrypted"><LockIcon /> Hidden</span>
                                  )
                                ) : shown ? (
                                  <>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>{decrypted}</span>
                                    <button
                                      onClick={() => toggleEmpSalaryVisibility(emp.address)}
                                      style={{ background: "none", border: "none", padding: "3px", color: "var(--muted)", cursor: "pointer", display: "flex", borderRadius: 4 }}
                                      title="Hide"
                                    >
                                      <EyeIcon off />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span style={{ color: "var(--muted)", letterSpacing: 4, fontSize: 14 }}>••••••</span>
                                    <button
                                      onClick={() => toggleEmpSalaryVisibility(emp.address)}
                                      style={{ background: "none", border: "none", padding: "3px", color: "var(--muted)", cursor: "pointer", display: "flex", borderRadius: 4 }}
                                      title="Reveal"
                                    >
                                      <EyeIcon />
                                    </button>
                                  </>
                                )}
                              </div>

                              {showEmployerView && (
                                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                                  {(() => {
                                    const tokenKey = emp.salaryToken === 1 ? "cUSDC" : "cUSDT";
                                    const approved = operatorApproved[tokenKey];
                                    return (
                                      <button
                                        className="btn-primary btn-sm"
                                        onClick={() => approved ? handlePay(emp.address) : handleApproveOperator(tokenKey)}
                                        disabled={busy}
                                        style={{ fontSize: 11, background: approved ? undefined : "var(--warning, #f59e0b)" }}
                                        title={approved ? undefined : `Approve ${tokenKey} operator first`}
                                      >
                                        {approved ? "Pay" : `Approve ${tokenKey}`}
                                      </button>
                                    );
                                  })()}
                                  <button
                                    className="btn-ghost btn-sm"
                                    onClick={() => {
                                      if (isEditing) {
                                        setInlineUpdateAddr(null);
                                        setInlineUpdateSalary("");
                                      } else {
                                        setInlineUpdateAddr(emp.address);
                                        setInlineUpdateToken(emp.salaryToken === 0 ? 1 : emp.salaryToken);
                                        setInlineUpdateSalary("");
                                      }
                                    }}
                                    disabled={busy}
                                    style={{ fontSize: 11 }}
                                  >
                                    {isEditing ? "Cancel" : "Edit"}
                                  </button>
                                  <button className="btn-danger btn-sm" onClick={() => handleRemove(emp.address)} disabled={busy} style={{ fontSize: 11 }}>Remove</button>
                                </div>
                              )}
                            </div>

                            {/* Inline update form — shown when this row is being edited */}
                            {isEditing && showEmployerView && (
                              <div style={{
                                padding: "14px 16px 16px",
                                background: "var(--bg-alt)",
                                borderTop: "1px solid var(--border)",
                              }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                                  Update salary for {short(emp.address)}
                                </div>
                                <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                                  {/* Token selector */}
                                  <div style={{ display: "flex", gap: 5 }}>
                                    {SUPPORTED_TOKENS.map(t => ({ label: t.confSymbol, idx: t.tokenIndex, color: t.color })).map(opt => (
                                      <button
                                        key={opt.idx}
                                        type="button"
                                        onClick={() => setInlineUpdateToken(opt.idx)}
                                        style={{
                                          padding: "5px 12px", fontSize: 11, fontWeight: 700,
                                          background: inlineUpdateToken === opt.idx ? opt.color : "var(--surface-2)",
                                          color: inlineUpdateToken === opt.idx ? "#fff" : "var(--text-2)",
                                          border: `1.5px solid ${inlineUpdateToken === opt.idx ? opt.color : "var(--border)"}`,
                                          borderRadius: "var(--radius-sm)", transform: "none",
                                        }}
                                      >{opt.label}</button>
                                    ))}
                                  </div>
                                  {/* Amount input */}
                                  <div style={{ flex: 1, minWidth: 120 }}>
                                    <input
                                      type="number"
                                      placeholder="e.g. 500"
                                      value={inlineUpdateSalary}
                                      onChange={e => setInlineUpdateSalary(e.target.value)}
                                      onKeyDown={e => e.key === "Enter" && inlineUpdateSalary && handleInlineUpdate(emp.address)}
                                      style={{ width: "100%" }}
                                    />
                                  </div>
                                  <button
                                    className="btn-primary btn-sm"
                                    onClick={() => handleInlineUpdate(emp.address)}
                                    disabled={busy || !inlineUpdateSalary}
                                    style={{ fontSize: 11, whiteSpace: "nowrap" }}
                                  >
                                    Confirm Update
                                  </button>
                                  <button
                                    className="btn-ghost btn-sm"
                                    onClick={() => { setInlineUpdateAddr(null); setInlineUpdateSalary(""); }}
                                    disabled={busy}
                                    style={{ fontSize: 11 }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                                <p style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", display: "flex", alignItems: "center", gap: 5 }}>
                                  <LockIcon /> New salary is encrypted client-side before being sent to the chain.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>}

                {/* ══ EMPLOYEE SELF-SERVICE ══ */}
                {!showEmployerView && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* How you receive salary */}
                  <div className="card" style={{ borderColor: "rgba(255,209,0,0.15)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--success-dim)", border: "1px solid rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <h2 style={{ marginBottom: 6 }}>How you receive your salary</h2>
                        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.7, marginBottom: 12 }}>
                          When the employer runs <strong style={{ color: "var(--text)" }}>Pay Salary</strong>, encrypted cUSDC or cUSDT
                          is transferred confidentially to your wallet — no amount is visible on-chain.
                          Use the <strong style={{ color: "var(--text)" }}>⇄ Swap</strong> tab to unwrap your cUSDC/cUSDT back to USDC/USDT.
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" }}>
                          <div>
                            <div className="stat-label">Your wallet balance</div>
                            <div className="stat-value success" style={{ fontSize: 20, marginTop: 4 }}>
                              {walletBalance ?? "—"} ETH
                            </div>
                            {walletBalance && toUsd(walletBalance) && (
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>≈ {toUsd(walletBalance)}</div>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", maxWidth: 280 }}>
                            Once paid, use the <strong style={{ color: "var(--text)" }}>⇄ Swap</strong> tab above to
                            unwrap your cUSDC or cUSDT back to spendable USDC/USDT.
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Encrypted salary cards */}
                  <div className="card">
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-dim)", border: "1px solid rgba(255,209,0,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <LockIcon />
                      </div>
                      <div>
                        <h2>My Encrypted Salary</h2>
                        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                          Stored as an FHE ciphertext — only you can decrypt it (cUSDC / cUSDT)
                        </p>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

                      {/* Monthly salary card */}
                      <div className="card-inner">
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                          Monthly Salary
                        </div>

                        {/* Value display */}
                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14, minHeight: 34, display: "flex", alignItems: "center", gap: 10 }}>
                          {mySalaryDecrypted && showSalary ? (
                            <span style={{ color: "var(--accent)" }}>{mySalaryDecrypted}</span>
                          ) : mySalaryDecrypted && !showSalary ? (
                            <span style={{ color: "var(--muted)", letterSpacing: 5, fontSize: 18 }}>••••••</span>
                          ) : (
                            <span style={{ color: "var(--muted)", letterSpacing: 5, fontSize: 18 }}>••••••</span>
                          )}
                          {/* Reveal / hide toggle — only shown after decryption */}
                          {mySalaryDecrypted && (
                            <button
                              onClick={() => setShowSalary(v => !v)}
                              style={{ background: "none", border: "none", padding: "4px", color: "var(--muted)", cursor: "pointer", borderRadius: 4, display: "flex" }}
                              title={showSalary ? "Hide" : "Reveal"}
                            >
                              <EyeIcon off={showSalary} />
                            </button>
                          )}
                        </div>

                        {/* Action button */}
                        {!mySalaryDecrypted ? (
                          <button className="btn-ghost btn-sm" onClick={handleDecryptMySalary} disabled={busy}>
                            <LockIcon /> Decrypt & Reveal
                          </button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>per pay period</span>
                            <button className="btn-ghost btn-sm" onClick={handleDecryptMySalary} disabled={busy} style={{ fontSize: 11, padding: "4px 10px" }}>
                              Refresh
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Total paid card */}
                      <div className="card-inner">
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                          Total Paid to Date
                        </div>

                        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 14, minHeight: 34, display: "flex", alignItems: "center", gap: 10 }}>
                          {myTotalPaidDecrypted && showTotalPaid ? (
                            <span style={{ color: "var(--success)" }}>{myTotalPaidDecrypted}</span>
                          ) : (
                            <span style={{ color: "var(--muted)", letterSpacing: 5, fontSize: 18 }}>••••••</span>
                          )}
                          {myTotalPaidDecrypted && (
                            <button
                              onClick={() => setShowTotalPaid(v => !v)}
                              style={{ background: "none", border: "none", padding: "4px", color: "var(--muted)", cursor: "pointer", borderRadius: 4, display: "flex" }}
                              title={showTotalPaid ? "Hide" : "Reveal"}
                            >
                              <EyeIcon off={showTotalPaid} />
                            </button>
                          )}
                        </div>

                        {!myTotalPaidDecrypted ? (
                          <button className="btn-ghost btn-sm" onClick={handleDecryptMyTotalPaid} disabled={busy}>
                            <LockIcon /> Decrypt & Reveal
                          </button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>total earned</span>
                            <button className="btn-ghost btn-sm" onClick={handleDecryptMyTotalPaid} disabled={busy} style={{ fontSize: 11, padding: "4px 10px" }}>
                              Refresh
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1.5px solid var(--border)", background: "var(--bg-alt)", padding: "20px 28px" }}>
        <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <span style={{ fontFamily: "var(--font-heading)", fontSize: 14, color: "var(--text)" }}>ZecurePay</span>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>· Powered by <a href="https://zama.ai" target="_blank" rel="noreferrer" style={{ color: "var(--text-2)", borderBottomColor: "var(--border)" }}>Zama FHEVM</a></span>
          </div>
          {payrollAddress && (
            <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 12, color: "var(--muted)" }}>
              <span>Contract: <code>{short(payrollAddress)}</code></span>
              <a href={`https://sepolia.etherscan.io/address/${payrollAddress}`} target="_blank" rel="noreferrer" style={{ color: "var(--text-2)", borderBottomColor: "var(--border)" }}>Etherscan ↗</a>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
