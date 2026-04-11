"use client";

import { useState, useEffect } from "react";
import { Wallet, ChevronDown, Copy, LogOut, Check } from "lucide-react";
import { truncateAddress } from "@/lib/format";
import { useWalletStore } from "@/stores/wallet-store";
import { detectAvailableWallets, WALLET_INFO, type WalletName } from "@/lib/aleo/wallet-adapter";
import { getTotalBalance } from "@/lib/aleo/records";
import { formatMicro } from "@/lib/format";

export function ConnectButton() {
  const { address, connected, walletName, balance, setConnected, setDisconnected, setBalance } = useWalletStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [showWalletPicker, setShowWalletPicker] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Close dropdowns on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setShowDropdown(false);
        setShowWalletPicker(false);
      }
    }
    if (showDropdown || showWalletPicker) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [showDropdown, showWalletPicker]);

  async function handleConnect(wallet: WalletName) {
    setConnecting(true);

    try {
      const w = window as unknown as Record<string, unknown>;
      let walletAPI: Record<string, Function> | null = null;

      if (wallet === "shield" && w.shield) walletAPI = w.shield as Record<string, Function>;
      else if (wallet === "leo" && w.leoWallet) walletAPI = w.leoWallet as Record<string, Function>;
      else if (wallet === "puzzle" && w.puzzle) walletAPI = w.puzzle as Record<string, Function>;
      else if (wallet === "fox" && w.foxwallet) walletAPI = w.foxwallet as Record<string, Function>;

      if (!walletAPI) {
        window.open(WALLET_INFO[wallet].installUrl, "_blank");
        setConnecting(false);
        return;
      }

      const programs = [
        process.env.NEXT_PUBLIC_INVOICE_PROGRAM_ID || "stealthap_inv_v2.aleo",
        process.env.NEXT_PUBLIC_PAYMENT_PROGRAM_ID || "stealthap_pay_v2.aleo",
        "credits.aleo",
      ];

      let result: unknown;
      if (wallet === "shield") {
        // Shield: connect(network, decryptPermission, programs)
        result = await walletAPI.connect("testnet", "AUTO_DECRYPT", programs);
      } else if (wallet === "leo") {
        // Leo: connect(decryptPermission, network, programs)
        result = await walletAPI.connect("AUTO_DECRYPT", "testnet", programs);
      } else {
        // Puzzle, Fox: standard connect
        result = await walletAPI.connect("AUTO_DECRYPT", "testnet", programs);
      }
      const addr = typeof result === "string" ? result : (result as Record<string, string>)?.address ?? "";

      if (addr) {
        setConnected(addr, WALLET_INFO[wallet].displayName);
        setShowWalletPicker(false);

        getTotalBalance().then(({ aleo }) => {
          setBalance({ aleo: Number(aleo) });
        }).catch(() => {});
      }
    } catch {
      // Connection rejected or failed
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      const w = window as unknown as Record<string, unknown>;
      const walletAPIs = [w.shield, w.leoWallet, w.puzzle, w.foxwallet].filter(Boolean);
      if (walletAPIs[0]) {
        await (walletAPIs[0] as Record<string, Function>).disconnect?.();
      }
    } catch {}
    setDisconnected();
    setShowDropdown(false);
  }

  function handleCopyAddress() {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!connected) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowWalletPicker(!showWalletPicker)}
          aria-expanded={showWalletPicker}
          aria-haspopup="true"
          className="flex items-center gap-2 bg-[#C6F15C] text-black border-2 border-black px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
        >
          <Wallet className="h-3.5 w-3.5" />
          Connect Wallet
        </button>

        {showWalletPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowWalletPicker(false)} />
            <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-64 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2">
              <p className="px-3 py-2 font-mono text-[11px] font-bold text-text-4 uppercase tracking-wider">
                Select Wallet
              </p>
              {(["shield", "leo", "puzzle", "fox"] as WalletName[]).map((w) => {
                const available = typeof window !== "undefined" && detectAvailableWallets().includes(w);
                return (
                  <button
                    key={w}
                    role="menuitem"
                    onClick={() => handleConnect(w)}
                    disabled={connecting}
                    className="w-full flex items-center gap-3 px-3 py-2.5 font-mono text-sm font-bold uppercase text-black hover:bg-[#C6F15C]/20 transition-colors disabled:opacity-50"
                  >
                    <Wallet className="h-4 w-4 text-black" />
                    <span className="flex-1 text-left">{WALLET_INFO[w].displayName}</span>
                    {available ? (
                      <span className="font-mono text-[10px] font-bold text-black uppercase">Detected</span>
                    ) : (
                      <span className="font-mono text-[10px] font-bold text-text-4 uppercase">Install</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        aria-expanded={showDropdown}
        aria-haspopup="true"
        className="flex items-center gap-2 bg-black text-[#C6F15C] border-2 border-black px-4 py-2 font-mono text-[12px] font-bold uppercase tracking-wider transition-all"
      >
        <span className="h-2 w-2 bg-[#C6F15C]" />
        <span className="hidden sm:inline font-mono text-[11px]">
          {truncateAddress(address!, 6)}
        </span>
        {balance?.aleo ? (
          <span className="text-[#C6F15C]/70 text-[11px]">{formatMicro(balance.aleo)}</span>
        ) : null}
        <ChevronDown className="h-3 w-3" />
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-64 border-2 border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-2">
            <div className="px-3 py-2 border-b-2 border-black mb-1">
              <p className="font-mono text-[11px] font-bold uppercase text-text-4">{walletName}</p>
              <p className="font-mono text-[11px] font-bold text-text-3 mt-0.5 break-all">
                {address}
              </p>
            </div>

            <button
              role="menuitem"
              onClick={handleCopyAddress}
              className="w-full flex items-center gap-3 px-3 py-2 font-mono text-sm font-bold uppercase text-black hover:bg-[#C6F15C]/20 transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-black" />
              ) : (
                <Copy className="h-4 w-4 text-black" />
              )}
              {copied ? "Copied!" : "Copy Address"}
            </button>

            <button
              role="menuitem"
              onClick={handleDisconnect}
              className="w-full flex items-center gap-3 px-3 py-2 font-mono text-sm font-bold uppercase text-[#EF4444] hover:bg-[#FF90E8]/20 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
