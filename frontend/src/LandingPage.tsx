import { useEffect, useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";

// ─── Shared easing ────────────────────────────────────────────────────────────
const ease = [0.16, 1, 0.3, 1] as const;

// ─── Fade-in-up wrapper ────────────────────────────────────────────────────────
function FadeUp({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.75, delay, ease }}
    >
      {children}
    </motion.div>
  );
}

// ─── Animated grid background ─────────────────────────────────────────────────
function GridBackground() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {/* Grid lines */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.07 }}>
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#6366f1" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
      {/* Floating orbs */}
      <motion.div
        style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: 700, height: 700, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={{
          position: "absolute", top: "10%", right: "-15%",
          width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(139,92,246,0.16) 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        style={{
          position: "absolute", bottom: "0%", left: "30%",
          width: 500, height: 500, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,210,8,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

// ─── Floating encrypted salary card ───────────────────────────────────────────
function EncryptedCard({
  label, value, token, delay, x, y, rotate
}: {
  label: string; value: string; token: string; delay: number;
  x: number; y: number; rotate: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, rotate: rotate - 5 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={{ duration: 0.9, delay, ease }}
      style={{
        position: "absolute",
        left: x, top: y,
        background: "rgba(15,15,25,0.7)",
        border: "1px solid rgba(99,102,241,0.3)",
        borderRadius: 14,
        padding: "14px 18px",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)",
        minWidth: 180,
        zIndex: 10,
      }}
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut" }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, color: "#6366f1", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>
          {label}
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#f0f0f0", fontFamily: "monospace", letterSpacing: 3, marginBottom: 8 }}>
          {value}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
            background: "rgba(99,102,241,0.15)", color: "#818cf8",
            border: "1px solid rgba(99,102,241,0.3)",
          }}>
            🔒 ENCRYPTED
          </span>
          <span style={{ fontSize: 10, color: "#6b7280" }}>{token}</span>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function AnimCounter({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = target / 60;
    const id = setInterval(() => {
      start += step;
      if (start >= target) { setVal(target); clearInterval(id); }
      else setVal(Math.floor(start));
    }, 16);
    return () => clearInterval(id);
  }, [inView, target]);

  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>;
}

// ─── Section header ────────────────────────────────────────────────────────────
function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.25)",
      borderRadius: 999, padding: "5px 14px", marginBottom: 20,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.1em", textTransform: "uppercase" }}>{text}</span>
    </div>
  );
}

// ─── Main LandingPage ─────────────────────────────────────────────────────────
export function LandingPage({ onConnect, loading, error }: {
  onConnect: () => void;
  loading: boolean;
  error?: string | null;
}) {
  const heroRef = useRef(null);

  // Typing effect for hero headline
  const words = ["Encrypted.", "Private.", "Confidential."];
  const [wordIdx, setWordIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setWordIdx(i => (i + 1) % words.length), 2800);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      background: "#050508",
      color: "#f0f0f0",
      fontFamily: "'Archivo', system-ui, sans-serif",
      overflowX: "hidden",
      minHeight: "100vh",
    }}>

      {/* ══ HERO ══ */}
      <section
        ref={heroRef}
        style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
      >
        <GridBackground />

        {/* Floating salary cards (desktop only) */}
        <EncryptedCard label="Monthly Salary" value="•••••• cUSDC" token="Sepolia" delay={1.2} x="calc(50% + 340px)" y="18%" rotate={4} />
        <EncryptedCard label="Last Payment" value="•••••• cUSDT" token="Sepolia" delay={1.5} x="calc(50% - 530px)" y="30%" rotate={-3} />
        <EncryptedCard label="Total Paid YTD" value="•••••• cUSDC" token="Sepolia" delay={1.8} x="calc(50% + 300px)" y="58%" rotate={2} />

        {/* Light streak */}
        <motion.div
          style={{
            position: "absolute", top: 0, left: "50%", width: 1, height: "45%",
            background: "linear-gradient(to bottom, transparent, rgba(99,102,241,0.6), transparent)",
            transformOrigin: "top",
          }}
          animate={{ scaleY: [0, 1, 0], opacity: [0, 0.7, 0] }}
          transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
        />

        <motion.div
          style={{ position: "relative", zIndex: 5, textAlign: "center", maxWidth: 780, padding: "0 28px" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease }}
            style={{ marginBottom: 24 }}
          >
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(255,210,8,0.08)", border: "1px solid rgba(255,210,8,0.2)",
              borderRadius: 999, padding: "6px 16px",
            }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: "#FFD208", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#FFD208", letterSpacing: "0.1em" }}>POWERED BY ZAMA FHEVM</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.15, ease }}
            style={{
              fontSize: "clamp(40px, 6.5vw, 72px)",
              fontFamily: "'Varela Round', system-ui, sans-serif",
              fontWeight: 400,
              lineHeight: 1.1,
              marginBottom: 12,
              letterSpacing: "-1px",
              color: "#ffffff",
            }}
          >
            Payroll, Fully{" "}
            <AnimatePresence mode="wait">
              <motion.span
                key={wordIdx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease }}
                style={{
                  background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {words[wordIdx]}
              </motion.span>
            </AnimatePresence>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            style={{
              fontSize: "clamp(15px, 1.8vw, 18px)",
              color: "#9ca3af",
              maxWidth: 560,
              margin: "0 auto 40px",
              lineHeight: 1.75,
            }}
          >
            ZecurePay uses Zama FHEVM to keep salaries encrypted during storage,
            transfer, and computation — directly onchain. No amounts ever exposed.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.45, ease }}
            style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}
          >
            <button
              onClick={onConnect}
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "14px 32px",
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 24px rgba(99,102,241,0.4)",
                transition: "all 0.2s ease",
                fontFamily: "'Archivo', system-ui, sans-serif",
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 32px rgba(99,102,241,0.6)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 24px rgba(99,102,241,0.4)"; }}
            >
              {loading ? "Initializing FHE engine…" : "Launch App →"}
            </button>
            <a
              href="#how-it-works"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10, padding: "14px 28px",
                fontSize: 15, fontWeight: 600, color: "#d1d5db",
                textDecoration: "none", backdropFilter: "blur(10px)",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(99,102,241,0.4)"; (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.12)"; (e.currentTarget as HTMLAnchorElement).style.color = "#d1d5db"; }}
            >
              How it works ↓
            </a>
          </motion.div>

          {loading && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ marginTop: 14, fontSize: 12, color: "#6b7280" }}
            >
              Loading WASM cryptography modules — takes ~10 s on first visit
            </motion.p>
          )}
          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ color: "#f87171", marginTop: 12, fontSize: 13 }}
            >
              {error}
            </motion.p>
          )}
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          style={{ position: "absolute", bottom: 36, left: "50%", transform: "translateX(-50%)" }}
          animate={{ y: [0, 8, 0], opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </motion.div>
      </section>

      {/* ══ HOW IT WORKS ══ */}
      <section id="how-it-works" style={{ padding: "100px 28px", maxWidth: 1040, margin: "0 auto" }}>
        <FadeUp>
          <SectionLabel text="How It Works" />
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontFamily: "'Varela Round', system-ui, sans-serif", fontWeight: 400, color: "#fff", marginBottom: 16, letterSpacing: "-0.5px", maxWidth: 500 }}>
            Three steps to confidential payroll
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 15, maxWidth: 480, lineHeight: 1.75, marginBottom: 60 }}>
            From encryption to final payment, salaries remain protected at every stage of the payroll pipeline.
          </p>
        </FadeUp>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
          {[
            {
              step: "01",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              ),
              title: "Encrypt Locally",
              body: "The employer encrypts each salary value client-side using Zama FHEVM before it ever touches the blockchain. The raw amount never leaves the browser.",
              color: "#6366f1",
            },
            {
              step: "02",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              ),
              title: "Process Onchain",
              body: "Zama FHEVM performs all payroll computations on fully encrypted ciphertexts. Salary values are processed confidentially — the contract never sees plaintext.",
              color: "#8b5cf6",
            },
            {
              step: "03",
              icon: (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              ),
              title: "Receive Privately",
              body: "Employees receive cUSDC or cUSDT directly to their wallet. Only the recipient can decrypt and view their own salary — nothing is visible on Etherscan.",
              color: "#a78bfa",
            },
          ].map((s, i) => (
            <FadeUp key={s.step} delay={i * 0.15}>
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: 20,
                  padding: "32px 28px",
                  height: "100%",
                  transition: "border-color 0.25s, background 0.25s, transform 0.25s",
                  cursor: "default",
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = `${s.color}44`;
                  el.style.background = `${s.color}08`;
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(255,255,255,0.07)";
                  el.style.background = "rgba(255,255,255,0.02)";
                  el.style.transform = "translateY(0)";
                }}
              >
                {/* Glow corner */}
                <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${s.color}20 0%, transparent 70%)` }} />
                <div style={{ fontSize: 11, fontWeight: 800, color: s.color, letterSpacing: "0.12em", marginBottom: 20, opacity: 0.7 }}>STEP {s.step}</div>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: `${s.color}15`, border: `1px solid ${s.color}30`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18 }}>
                  {s.icon}
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#f0f0f0", marginBottom: 12, fontFamily: "'Varela Round', system-ui, sans-serif" }}>{s.title}</div>
                <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.8 }}>{s.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ══ FHEVM TECHNOLOGY ══ */}
      <FHESection />

      {/* ══ PRIVACY SECTION ══ */}
      <PrivacySection />

      {/* ══ FINAL CTA ══ */}
      <FinalCTA onConnect={onConnect} loading={loading} />

      {/* ══ FOOTER ══ */}
      <footer style={{ borderTop: "1px solid rgba(255,255,255,0.06)", padding: "28px", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
          <div style={{ width: 22, height: 22, borderRadius: 6, background: "#FFD208", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <span style={{ fontFamily: "'Varela Round', system-ui, sans-serif", fontSize: 14, color: "#d1d5db" }}>ZecurePay</span>
        </div>
        <p style={{ fontSize: 12, color: "#4b5563" }}>
          Powered by{" "}
          <a href="https://zama.ai" target="_blank" rel="noreferrer" style={{ color: "#6b7280", borderBottom: "1px solid #374151" }}>
            Zama FHEVM
          </a>
          {" "}· Deployed on Sepolia testnet
        </p>
      </footer>
    </div>
  );
}

// ─── FHE Technology section ────────────────────────────────────────────────────
function FHESection() {
  const features = [
    { icon: "⚙", label: "Encrypted Computation", body: "Arithmetic operations execute directly on ciphertexts. The EVM never sees a salary amount." },
    { icon: "🔐", label: "Privacy-Preserving Contracts", body: "Smart contracts enforce payroll logic using encrypted inputs, outputs, and state variables." },
    { icon: "👁", label: "User-Controlled Decryption", body: "Employees hold the decryption keys. Only authorized holders can reveal their own salary data." },
    { icon: "⛓", label: "Onchain Confidentiality", body: "All encryption happens natively on Sepolia — no off-chain relayers, no trusted execution environments." },
  ];

  return (
    <section style={{ padding: "100px 28px", position: "relative", overflow: "hidden" }}>
      {/* Background accent */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 800, height: 800, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      <div style={{ maxWidth: 1040, margin: "0 auto", position: "relative" }}>
        <FadeUp>
          <SectionLabel text="Zama FHEVM" />
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontFamily: "'Varela Round', system-ui, sans-serif", fontWeight: 400, color: "#fff", marginBottom: 16, letterSpacing: "-0.5px", maxWidth: 560 }}>
            Computation on encrypted data, natively onchain
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 15, maxWidth: 500, lineHeight: 1.75, marginBottom: 60 }}>
            Fully Homomorphic Encryption (FHE) allows mathematical operations to run on ciphertext.
            Zama brings this to smart contracts — enabling payroll logic without ever decrypting salary values.
          </p>
        </FadeUp>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {features.map((f, i) => (
            <FadeUp key={f.label} delay={i * 0.1}>
              <div
                style={{
                  background: "rgba(139,92,246,0.04)",
                  border: "1px solid rgba(139,92,246,0.12)",
                  borderRadius: 16,
                  padding: "24px 22px",
                  transition: "border-color 0.25s, background 0.25s, transform 0.25s",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(139,92,246,0.3)";
                  el.style.background = "rgba(139,92,246,0.08)";
                  el.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(139,92,246,0.12)";
                  el.style.background = "rgba(139,92,246,0.04)";
                  el.style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 26, marginBottom: 14 }}>{f.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#e5e7eb", marginBottom: 8, fontFamily: "'Varela Round', system-ui, sans-serif" }}>{f.label}</div>
                <p style={{ fontSize: 12, color: "#9ca3af", lineHeight: 1.75 }}>{f.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* Animated cipher visual */}
        <FadeUp delay={0.3}>
          <CipherVisual />
        </FadeUp>
      </div>
    </section>
  );
}

// ─── Animated cipher display ───────────────────────────────────────────────────
function CipherVisual() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1200);
    return () => clearInterval(id);
  }, []);

  const chunks = ["0x4f2a", "c831", "7d9e", "a042", "1fc8", "b30d", "e6f1", "9a75"];
  const rotated = [...chunks.slice(tick % chunks.length), ...chunks.slice(0, tick % chunks.length)];

  return (
    <div style={{
      marginTop: 56,
      background: "rgba(0,0,0,0.4)",
      border: "1px solid rgba(99,102,241,0.18)",
      borderRadius: 20,
      padding: "28px 32px",
      fontFamily: "'SF Mono', 'Fira Code', Consolas, monospace",
      overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b" }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e" }} />
        <span style={{ marginLeft: 8, fontSize: 11, color: "#6b7280" }}>encrypted_payroll.fhe</span>
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>// Salary stored as FHE ciphertext — no plaintext on-chain</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {rotated.map((chunk, i) => (
          <motion.span
            key={`${chunk}-${i}`}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, delay: i * 0.06, repeat: Infinity }}
            style={{
              fontSize: 11, padding: "4px 8px", borderRadius: 6,
              background: "rgba(99,102,241,0.1)",
              color: i === 0 ? "#818cf8" : "#4b5563",
              border: `1px solid ${i === 0 ? "rgba(99,102,241,0.3)" : "transparent"}`,
            }}
          >
            {chunk}
          </motion.span>
        ))}
        <span style={{ fontSize: 11, color: "#374151" }}>... [8192 bytes]</span>
      </div>
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1" }}
        />
        <span style={{ fontSize: 11, color: "#6366f1" }}>FHE operations running on ciphertext</span>
      </div>
    </div>
  );
}

// ─── Privacy / Security section ────────────────────────────────────────────────
function PrivacySection() {
  const items = [
    { title: "Salary privacy by default", body: "Compensation is encrypted before it ever reaches the blockchain. No wallet, no explorer, no indexer can read salary amounts.", icon: "🔒" },
    { title: "Confidential onchain computation", body: "FHEVM evaluates payroll logic — additions, comparisons, transfers — entirely on encrypted state. The EVM sees only ciphertexts.", icon: "⚡" },
    { title: "Employee-controlled keys", body: "Each employee generates a keypair for decryption. Their salary is sealed with their public key. Only they can unseal it.", icon: "🗝" },
    { title: "Privacy-preserving infrastructure", body: "Smart contracts on Sepolia enforce payroll rules without exposing any confidential data. Privacy is a property of the protocol, not a UI toggle.", icon: "🛡" },
  ];

  return (
    <section style={{ padding: "100px 28px", background: "rgba(255,255,255,0.01)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <FadeUp>
          <SectionLabel text="Privacy Infrastructure" />
          <h2 style={{ fontSize: "clamp(28px, 4vw, 44px)", fontFamily: "'Varela Round', system-ui, sans-serif", fontWeight: 400, color: "#fff", marginBottom: 16, letterSpacing: "-0.5px", maxWidth: 500 }}>
            Privacy is the foundation, not a feature
          </h2>
          <p style={{ color: "#9ca3af", fontSize: 15, maxWidth: 500, lineHeight: 1.75, marginBottom: 60 }}>
            Unlike conventional payroll platforms that expose salary data to indexers and block explorers,
            ZecurePay is built on cryptographic guarantees.
          </p>
        </FadeUp>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {items.map((item, i) => (
            <FadeUp key={item.title} delay={i * 0.1}>
              <div
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 18,
                  padding: "28px 24px",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(99,102,241,0.25)";
                  el.style.background = "rgba(99,102,241,0.04)";
                  el.style.transform = "translateY(-4px)";
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.borderColor = "rgba(255,255,255,0.06)";
                  el.style.background = "rgba(255,255,255,0.02)";
                  el.style.transform = "translateY(0)";
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 16 }}>{item.icon}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#e5e7eb", marginBottom: 10, fontFamily: "'Varela Round', system-ui, sans-serif" }}>{item.title}</div>
                <p style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.8 }}>{item.body}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Final CTA section ────────────────────────────────────────────────────────
function FinalCTA({ onConnect, loading }: { onConnect: () => void; loading: boolean }) {
  return (
    <section style={{ padding: "120px 28px", position: "relative", overflow: "hidden" }}>
      {/* Glow background */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 700, height: 400, borderRadius: "50%",
        background: "radial-gradient(ellipse, rgba(99,102,241,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />
      {/* Grid */}
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none" }}>
        <defs>
          <pattern id="grid2" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#6366f1" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid2)" />
      </svg>

      <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center", position: "relative" }}>
        <FadeUp>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)",
            borderRadius: 999, padding: "5px 16px", marginBottom: 24,
          }}>
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }}
            />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", letterSpacing: "0.1em" }}>LIVE ON SEPOLIA TESTNET</span>
          </div>

          <h2 style={{
            fontSize: "clamp(32px, 5vw, 56px)",
            fontFamily: "'Varela Round', system-ui, sans-serif",
            fontWeight: 400, color: "#ffffff",
            lineHeight: 1.15, letterSpacing: "-0.5px", marginBottom: 20,
          }}>
            Modern payroll should be<br />
            <span style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              private by default.
            </span>
          </h2>

          <p style={{ color: "#9ca3af", fontSize: 16, lineHeight: 1.75, marginBottom: 44, maxWidth: 520, margin: "0 auto 44px" }}>
            Connect your wallet to deploy a confidential payroll contract and start paying salaries with full cryptographic privacy.
          </p>

          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={onConnect}
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                color: "#fff", border: "none", borderRadius: 12,
                padding: "16px 40px", fontSize: 16, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
                boxShadow: "0 4px 32px rgba(99,102,241,0.45)",
                transition: "all 0.2s ease",
                fontFamily: "'Archivo', system-ui, sans-serif",
              }}
              onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.04)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
            >
              {loading ? "Initializing…" : "Connect Wallet & Launch"}
            </button>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}
