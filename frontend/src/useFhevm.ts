import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserProvider, ethers } from "ethers";
import { initSDK, createInstance, SepoliaConfig, type FhevmInstance } from "@zama-fhe/relayer-sdk/web";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

// Module-level cache — one instance per page load, per chain
let cachedInstance: FhevmInstance | null = null;
let sdkInitialized = false;

async function ensureSDK() {
  if (sdkInitialized) return;
  try {
    await initSDK({
      tfheParams: "/tfhe_bg.wasm",
      kmsParams: "/kms_lib_bg.wasm",
    });
    sdkInitialized = true;
  } catch (e) {
    console.warn("initSDK failed, retrying without explicit paths:", e);
    await initSDK();
    sdkInitialized = true;
  }
}

// Switches MetaMask to Sepolia. Throws a user-friendly error if the user rejects.
async function switchToSepolia() {
  if (!window.ethereum) throw new Error("MetaMask not found — please install it.");
  const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
  if (chainId === SEPOLIA_CHAIN_ID) return; // already on Sepolia

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
  } catch (switchError: unknown) {
    // Error code 4902 = chain not added to MetaMask yet
    const code = (switchError as { code?: number })?.code;
    if (code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: SEPOLIA_CHAIN_ID,
          chainName: "Sepolia Testnet",
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://rpc.sepolia.org"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    } else {
      throw new Error("Please switch MetaMask to the Sepolia testnet to use this app.");
    }
  }
}

// Creates (or returns cached) FHEVM instance.
// Always safe to call multiple times — downloads public key only once.
async function ensureInstance(): Promise<FhevmInstance> {
  if (cachedInstance) return cachedInstance;
  if (!window.ethereum) throw new Error("MetaMask not found — please install it.");
  await ensureSDK();
  cachedInstance = await createInstance({
    ...SepoliaConfig,
    network: window.ethereum,
  });
  return cachedInstance;
}

// Pre-warm WASM on import so it's ready before the user clicks Connect
ensureSDK().catch(console.error);

// ─────────────────────────────────────────────────────────────────────────────

export type FhevmState = {
  provider: BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  address: string;
  instance: FhevmInstance | null;
  isEmployer: boolean;
  loading: boolean;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
};

export function useFhevm(employerAddress: string): FhevmState {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [address, setAddress] = useState("");
  const [instance, setInstance] = useState<FhevmInstance | null>(cachedInstance);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const connectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setLoading(true);
    setError("");

    try {
      if (!window.ethereum) throw new Error("MetaMask not found — please install it.");

      // Ensure user is on Sepolia before anything else
      await switchToSepolia();

      const _provider = new BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const _signer = await _provider.getSigner();
      const _address = await _signer.getAddress();

      // Always ensure instance exists (cached after first call)
      const inst = await ensureInstance();

      setProvider(_provider);
      setSigner(_signer);
      setAddress(_address);
      setInstance(inst);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      console.error("connect error:", e);
      setError(msg);
    } finally {
      setLoading(false);
      connectingRef.current = false;
    }
  }, []);

  // Auto-connect on page load if MetaMask already has authorized accounts
  // (uses eth_accounts which never prompts — only returns if already approved)
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum
      .request({ method: "eth_accounts" })
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0) {
          connect();
        }
      })
      .catch(() => {/* ignore */});
  }, [connect]);

  // Re-sync signer/address AND instance on MetaMask account switch
  useEffect(() => {
    const handler = async () => {
      if (!window.ethereum) return;
      try {
        const _provider = new BrowserProvider(window.ethereum);
        const _signer = await _provider.getSigner();
        const _address = await _signer.getAddress();
        const inst = await ensureInstance();
        setProvider(_provider);
        setSigner(_signer);
        setAddress(_address);
        setInstance(inst);
      } catch {/* ignore */}
    };
    window.ethereum?.on("accountsChanged", handler);
    return () => window.ethereum?.removeListener("accountsChanged", handler);
  }, []);

  // When the user switches chains, clear the cached instance and re-connect
  useEffect(() => {
    const handler = () => {
      cachedInstance = null;
      setInstance(null);
      connect();
    };
    window.ethereum?.on("chainChanged", handler);
    return () => window.ethereum?.removeListener("chainChanged", handler);
  }, [connect]);

  const disconnect = useCallback(() => {
    setAddress("");
    setProvider(null);
    setSigner(null);
    setInstance(null);
  }, []);

  return {
    provider,
    signer,
    address,
    instance,
    isEmployer: address.toLowerCase() === employerAddress.toLowerCase(),
    loading,
    error,
    connect,
    disconnect,
  };
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, cb: () => void) => void;
      removeListener: (event: string, cb: () => void) => void;
      [key: string]: unknown;
    };
  }
}
