"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Settings, Wallet, Users, ShieldCheck, Save, Plus, Trash2, Link2 } from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";
import { truncateAddress, explorerTxUrl } from "@/lib/format";
import { formatMicro } from "@/lib/format";
import { setThreshold, setSpendingLimit } from "@/lib/aleo/programs/workflow";
import { setVendorAllowlist } from "@/lib/aleo/programs/invoice";
import { generateNonce, hashToField } from "@/lib/crypto";
import { toastSuccess, toastError } from "@/lib/utils";

const tabs = [
  { id: "company", label: "Company", icon: Settings, color: "bg-[#C6F15C]" },
  { id: "wallet", label: "Wallet", icon: Wallet, color: "bg-black" },
  { id: "team", label: "Team", icon: Users, color: "bg-[#B3A0FF]" },
  { id: "rules", label: "Approval Rules", icon: ShieldCheck, color: "bg-[#FF90E8]" },
] as const;

type TabId = (typeof tabs)[number]["id"];

interface CompanyData {
  id: string;
  name: string;
  legal_name: string | null;
  default_currency: string;
  timezone: string;
  fiscal_year_start_month: number;
  auto_approve_threshold_micro: number;
}

interface TeamMember {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/**
 * Approval threshold rule — user-facing shape. Persisted per-address in
 * localStorage; committed on-chain via wf_v2::set_threshold on Save.
 * The contract is the source of truth; localStorage is just the UI's
 * memory so the table persists across refreshes.
 */
type ThresholdRule = {
  id: string;
  tier: number;
  minMicro: number;
  maxMicro: number;
  approver: string;
  autoApprove: boolean;
  txHash?: string;
};

type SpendingLimit = {
  id: string;
  category: string;
  limitMicro: number;
  txHash?: string;
};

const THRESHOLDS_KEY = "stealthap.thresholds";
const LIMITS_KEY = "stealthap.limits";
const ALLOWLIST_KEY = "stealthap.vendor_allowlist";

type AllowlistEntry = {
  id: string;
  name: string;
  vendorHash: string; // field value as string
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("company");
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const wallet = useWalletStore();

  // Threshold rules + spending limits — local state, hydrated from
  // localStorage on mount, committed on-chain per row when user clicks Save.
  const [thresholds, setThresholds] = useState<ThresholdRule[]>([]);
  const [limits, setLimits] = useState<SpendingLimit[]>([]);
  const [newThreshold, setNewThreshold] = useState<Omit<ThresholdRule, "id" | "txHash">>({
    tier: 1,
    minMicro: 0,
    maxMicro: 5_000_000,
    approver: "",
    autoApprove: false,
  });
  const [newLimit, setNewLimit] = useState<Omit<SpendingLimit, "id" | "txHash">>({
    category: "",
    limitMicro: 50_000_000,
  });
  const [committing, setCommitting] = useState<string | null>(null);

  // Vendor allowlist — approved-vendor registry with on-chain root commitment.
  // Each entry hashes the vendor name (+ optional domain) to a field value.
  // The aggregate root is a deterministic sort-then-hash of the list; the
  // contract stores only the root, leaking nothing about the list.
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>([]);
  const [allowlistRoot, setAllowlistRoot] = useState<string>("");
  const [allowlistTx, setAllowlistTx] = useState<string>("");
  const [newAllowlistName, setNewAllowlistName] = useState("");

  useEffect(() => {
    try {
      const t = JSON.parse(localStorage.getItem(THRESHOLDS_KEY) || "[]") as ThresholdRule[];
      const l = JSON.parse(localStorage.getItem(LIMITS_KEY) || "[]") as SpendingLimit[];
      const a = JSON.parse(localStorage.getItem(ALLOWLIST_KEY) || '{"entries":[]}') as {
        entries: AllowlistEntry[];
        root?: string;
        tx?: string;
        tree?: string[][];
      };
      if (Array.isArray(t)) setThresholds(t);
      if (Array.isArray(l)) setLimits(l);
      if (Array.isArray(a.entries)) setAllowlist(a.entries);
      if (a.root) setAllowlistRoot(a.root);
      if (a.tx) setAllowlistTx(a.tx);
    } catch {
      /* empty / corrupt — fall back to [] */
    }
  }, []);

  function persistAllowlist(entries: AllowlistEntry[], root: string, tx: string, tree: string[][]) {
    setAllowlist(entries);
    setAllowlistRoot(root);
    setAllowlistTx(tx);
    try {
      // Store the FULL tree so the payables page can extract single-vendor
      // proofs without re-invoking the BHP256 merkle endpoint on every
      // invoice creation. Tree is <= 511 fields × ~78 chars = ~40KB, well
      // under localStorage 5MB quota.
      localStorage.setItem(ALLOWLIST_KEY, JSON.stringify({ entries, root, tx, tree }));
    } catch {}
  }

  /**
   * Build the BHP256 Merkle tree for the current vendor list via the
   * server-side /api/aleo/merkle endpoint. The returned root matches what
   * the on-chain `verify_vendor_allowlist` function will compute when a
   * client later presents a proof of membership. Returns { root, tree }
   * where tree is [leaves, level_1, …, level_8 = [root]].
   */
  async function computeAllowlistRoot(entries: AllowlistEntry[]): Promise<{ root: string; tree: string[][] }> {
    if (entries.length === 0) return { root: "0", tree: [["0"]] };
    const sorted = [...entries].sort((a, b) => (a.vendorHash > b.vendorHash ? 1 : -1));
    const leaves = sorted.map((e) => e.vendorHash);
    const res = await fetch("/api/aleo/merkle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ leaves }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "merkle computation failed");
    return await res.json();
  }

  async function addAllowlistEntry() {
    const name = newAllowlistName.trim();
    if (!name) return;
    const vendorHash = await hashToField(`vendor:${name.toLowerCase()}`);
    if (allowlist.some((e) => e.vendorHash === vendorHash)) {
      toastError("Vendor already on allowlist");
      return;
    }
    const entries = [...allowlist, { id: crypto.randomUUID(), name, vendorHash }];
    try {
      const { root, tree } = await computeAllowlistRoot(entries);
      persistAllowlist(entries, root, "", tree); // root changed → previous tx is stale
    } catch (err) {
      toastError("Merkle tree build failed", err instanceof Error ? err.message : String(err));
      return;
    }
    setNewAllowlistName("");
  }

  async function removeAllowlistEntry(id: string) {
    const entries = allowlist.filter((e) => e.id !== id);
    try {
      const { root, tree } = await computeAllowlistRoot(entries);
      persistAllowlist(entries, root, "", tree);
    } catch (err) {
      toastError("Merkle tree build failed", err instanceof Error ? err.message : String(err));
    }
  }

  async function commitAllowlist() {
    if (!wallet.connected || !wallet.address) {
      toastError("Connect your wallet first");
      return;
    }
    if (allowlist.length === 0) {
      toastError("Add at least one vendor before committing");
      return;
    }
    setCommitting("allowlist");
    try {
      const companyHash = await hashToField(wallet.address);
      const result = await setVendorAllowlist({
        companyHash,
        merkleRoot: allowlistRoot,
        nonce: generateNonce(),
      });
      if (result.transactionId) {
        // Re-read the cached tree so persistAllowlist keeps it attached to
        // the new tx hash. Without this, the tree would be wiped on commit.
        const cached = JSON.parse(localStorage.getItem(ALLOWLIST_KEY) || '{"tree":[]}') as { tree?: string[][] };
        persistAllowlist(allowlist, allowlistRoot, result.transactionId, cached.tree ?? []);
        toastSuccess("Allowlist committed on-chain", `TX: ${result.transactionId.slice(0, 16)}…`);
      } else {
        toastError("On-chain commitment returned no tx id");
      }
    } catch (err) {
      toastError("Commit failed", err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(null);
    }
  }

  function persistThresholds(next: ThresholdRule[]) {
    setThresholds(next);
    try { localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(next)); } catch {}
  }
  function persistLimits(next: SpendingLimit[]) {
    setLimits(next);
    try { localStorage.setItem(LIMITS_KEY, JSON.stringify(next)); } catch {}
  }

  async function commitThreshold(rule: ThresholdRule) {
    if (!wallet.connected || !wallet.address) {
      toastError("Connect your wallet first");
      return;
    }
    setCommitting(rule.id);
    try {
      const companyHash = await hashToField(wallet.address);
      const result = await setThreshold({
        companyHash,
        tier: rule.tier,
        minAmount: BigInt(rule.minMicro),
        maxAmount: BigInt(rule.maxMicro),
        approver: rule.approver || wallet.address,
        autoApprove: rule.autoApprove,
      });
      if (result.transactionId) {
        const updated = thresholds.map((r) => (r.id === rule.id ? { ...r, txHash: result.transactionId ?? undefined } : r));
        persistThresholds(updated);
        toastSuccess("Threshold committed on-chain", `TX: ${result.transactionId.slice(0, 16)}…`);
      } else {
        toastError("On-chain commitment returned no tx id");
      }
    } catch (err) {
      toastError("Commit failed", err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(null);
    }
  }

  async function commitLimit(limit: SpendingLimit) {
    if (!wallet.connected || !wallet.address) {
      toastError("Connect your wallet first");
      return;
    }
    setCommitting(limit.id);
    try {
      const companyHash = await hashToField(wallet.address);
      const categoryHash = await hashToField(limit.category);
      const result = await setSpendingLimit({
        companyHash,
        categoryHash,
        limitAmount: BigInt(limit.limitMicro),
        nonce: generateNonce(),
      });
      if (result.transactionId) {
        const updated = limits.map((l) => (l.id === limit.id ? { ...l, txHash: result.transactionId ?? undefined } : l));
        persistLimits(updated);
        toastSuccess("Spending limit committed on-chain", `TX: ${result.transactionId.slice(0, 16)}…`);
      } else {
        toastError("On-chain commitment returned no tx id");
      }
    } catch (err) {
      toastError("Commit failed", err instanceof Error ? err.message : String(err));
    } finally {
      setCommitting(null);
    }
  }

  function addThreshold() {
    if (!newThreshold.approver || newThreshold.minMicro < 0 || newThreshold.maxMicro <= newThreshold.minMicro) {
      toastError("Check approver address and min < max range");
      return;
    }
    const rule: ThresholdRule = {
      ...newThreshold,
      id: crypto.randomUUID(),
    };
    persistThresholds([...thresholds, rule]);
    setNewThreshold({ tier: 1, minMicro: 0, maxMicro: 5_000_000, approver: "", autoApprove: false });
  }

  function addLimit() {
    if (!newLimit.category.trim() || newLimit.limitMicro <= 0) {
      toastError("Category name and positive limit required");
      return;
    }
    const entry: SpendingLimit = {
      ...newLimit,
      id: crypto.randomUUID(),
    };
    persistLimits([...limits, entry]);
    setNewLimit({ category: "", limitMicro: 50_000_000 });
  }

  function removeThreshold(id: string) {
    persistThresholds(thresholds.filter((r) => r.id !== id));
  }
  function removeLimit(id: string) {
    persistLimits(limits.filter((l) => l.id !== id));
  }

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setCompany(data.company);
        setTeam(data.team ?? []);
      }
    } catch {
      // API unavailable — show defaults
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function handleSave() {
    if (!company) return;
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "company", data: company }),
      });
      setDirty(false);
    } catch {}
    setSaving(false);
  }

  function updateCompany(key: keyof CompanyData, value: string | number) {
    if (!company) return;
    setCompany({ ...company, [key]: value });
    setDirty(true);
  }

  const activeTabConfig = tabs.find((t) => t.id === activeTab)!;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader title="Settings" />

      <div className="flex gap-0 mb-6 border-b-2 border-black">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 font-mono text-[13px] font-bold uppercase tracking-wider transition-colors relative border-2 border-black -mb-[2px] -mr-[2px] ${
                active ? `${tab.color} text-${tab.id === "wallet" ? "white" : "black"}` : "bg-white text-black/50 hover:bg-[#E5E5E5]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "company" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#C6F15C] flex items-center justify-between">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Company Details</span>
              {dirty && (
                <button
                  className="bg-black text-[#C6F15C] border-2 border-black font-mono uppercase font-bold tracking-wider px-3 py-1 text-[11px] hover:bg-black/80 transition-all flex items-center gap-1.5 disabled:opacity-50"
                  disabled={saving}
                  onClick={handleSave}
                >
                  <Save className="w-3 h-3" />
                  {saving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
            <div className="px-4 py-2 space-y-0">
              <SettingInput label="Company name" value={company?.name ?? ""} onChange={(v) => updateCompany("name", v)} />
              <SettingInput label="Legal name" value={company?.legal_name ?? ""} onChange={(v) => updateCompany("legal_name", v)} />
              <SettingSelect
                label="Default currency"
                value={company?.default_currency ?? "ALEO"}
                options={["ALEO", "USDCx", "USAD"]}
                onChange={(v) => updateCompany("default_currency", v)}
              />
              <SettingSelect
                label="Fiscal year start"
                value={MONTHS[(company?.fiscal_year_start_month ?? 1) - 1]}
                options={MONTHS}
                onChange={(v) => updateCompany("fiscal_year_start_month", MONTHS.indexOf(v) + 1)}
              />
              <SettingInput label="Timezone" value={company?.timezone ?? "America/New_York"} onChange={(v) => updateCompany("timezone", v)} />
              <SettingInput
                label="Auto-approve threshold"
                value={company?.auto_approve_threshold_micro ? formatMicro(company.auto_approve_threshold_micro) : "0"}
                onChange={(v) => updateCompany("auto_approve_threshold_micro", parseInt(v.replace(/[^0-9]/g, "")) * 1_000_000 || 0)}
              />
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "wallet" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-black">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-[#C6F15C]">Wallet Configuration</span>
            </div>
            <div className="px-4">
              <SettingRow label="Connected wallet" value={wallet.address ? truncateAddress(wallet.address, 8) : "Not connected"} />
              <SettingRow label="Network" value={process.env.NEXT_PUBLIC_ALEO_NETWORK === "mainnet" ? "Aleo Mainnet" : "Aleo Testnet"} />
              <SettingRow label="Balance" value={wallet.balance?.aleo ? formatMicro(wallet.balance.aleo) + " ALEO" : "---"} />
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "team" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#B3A0FF]">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Team Members</span>
            </div>
            <div className="px-4">
              {team.length > 0 ? team.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-3 border-b-2 border-black last:border-0">
                  <div>
                    <div className="text-[13px] font-mono text-black font-bold">
                      {m.first_name || m.last_name ? `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() : m.email}
                    </div>
                    <div className="text-[11px] font-mono text-black/40">{m.email}</div>
                  </div>
                  <span className="border-2 border-black bg-[#E5E5E5] px-2 py-0.5 text-[11px] font-mono font-bold text-black uppercase">{m.role}</span>
                </div>
              )) : (
                <p className="py-6 text-[12px] font-mono text-black/40 text-center uppercase">No team members yet. Invite via email.</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {activeTab === "rules" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="space-y-6">
          {/* Threshold rules */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#FF90E8] flex items-center justify-between">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Approval Thresholds</span>
              <span className="font-mono text-[10px] text-black/60 uppercase tracking-wider">wf_v2::set_threshold</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="font-mono text-[11px] text-black/60">
                Amount-based routing. Each tier specifies which approver handles invoices in a given range.
                Auto-approve tiers skip human review. Rules commit on-chain and enforce privately.
              </p>

              {/* Existing rules table */}
              {thresholds.length > 0 && (
                <div className="border-2 border-black divide-y-2 divide-black/20">
                  {thresholds.map((r) => (
                    <div key={r.id} className="px-3 py-2 flex items-center gap-3 font-mono text-[11px]">
                      <span className="bg-black text-[#C6F15C] px-2 py-0.5 uppercase font-bold">T{r.tier}</span>
                      <span className="text-black tabular-nums shrink-0">
                        {formatMicro(r.minMicro)} – {formatMicro(r.maxMicro)}
                      </span>
                      <span className="text-black/60 flex-1 truncate">
                        {r.autoApprove ? "auto-approve" : truncateAddress(r.approver, 8)}
                      </span>
                      {r.txHash ? (
                        <a
                          href={explorerTxUrl(r.txHash)}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[#A259FF] underline"
                        >
                          <Link2 size={10} />
                          {r.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <button
                          onClick={() => commitThreshold(r)}
                          disabled={committing === r.id}
                          className="bg-[#C6F15C] text-black border-2 border-black px-2 py-1 uppercase font-bold text-[10px] tracking-wider hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50"
                        >
                          {committing === r.id ? "Signing…" : "Commit on-chain"}
                        </button>
                      )}
                      <button
                        onClick={() => removeThreshold(r.id)}
                        className="text-black/40 hover:text-[#EF4444]"
                        title="Remove rule"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add rule form */}
              <div className="border-2 border-dashed border-black/40 p-3 grid grid-cols-5 gap-2 items-end">
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Tier</span>
                  <input
                    type="number" min="0" max="10"
                    value={newThreshold.tier}
                    onChange={(e) => setNewThreshold({ ...newThreshold, tier: parseInt(e.target.value || "0") })}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Min (ALEO)</span>
                  <input
                    type="number" min="0"
                    value={newThreshold.minMicro / 1_000_000}
                    onChange={(e) => setNewThreshold({ ...newThreshold, minMicro: Math.round(parseFloat(e.target.value || "0") * 1_000_000) })}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Max (ALEO)</span>
                  <input
                    type="number" min="0"
                    value={newThreshold.maxMicro / 1_000_000}
                    onChange={(e) => setNewThreshold({ ...newThreshold, maxMicro: Math.round(parseFloat(e.target.value || "0") * 1_000_000) })}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 col-span-1">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Approver (aleo1…)</span>
                  <input
                    type="text"
                    placeholder="aleo1… or leave empty for self"
                    value={newThreshold.approver}
                    onChange={(e) => setNewThreshold({ ...newThreshold, approver: e.target.value })}
                    className="border-2 border-black bg-white font-mono text-[10px] p-1.5"
                  />
                </label>
                <button
                  onClick={addThreshold}
                  className="bg-black text-[#C6F15C] border-2 border-black font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>

              <label className="flex items-center gap-2 font-mono text-[11px] text-black">
                <input
                  type="checkbox"
                  checked={newThreshold.autoApprove}
                  onChange={(e) => setNewThreshold({ ...newThreshold, autoApprove: e.target.checked })}
                />
                <span>Auto-approve (skip human review for this tier)</span>
              </label>
            </div>
          </div>

          {/* Spending limits */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#B3A0FF] flex items-center justify-between">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Spending Limits</span>
              <span className="font-mono text-[10px] text-black/60 uppercase tracking-wider">wf_v2::set_spending_limit</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="font-mono text-[11px] text-black/60">
                Monthly caps per GL category, enforced on-chain. Payments that exceed the limit are blocked
                at settlement time without revealing totals to anyone outside your org.
              </p>

              {limits.length > 0 && (
                <div className="border-2 border-black divide-y-2 divide-black/20">
                  {limits.map((l) => (
                    <div key={l.id} className="px-3 py-2 flex items-center gap-3 font-mono text-[11px]">
                      <span className="bg-black text-[#B3A0FF] px-2 py-0.5 uppercase font-bold flex-1">{l.category}</span>
                      <span className="text-black tabular-nums shrink-0">{formatMicro(l.limitMicro)} / month</span>
                      {l.txHash ? (
                        <a
                          href={explorerTxUrl(l.txHash)}
                          target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[#A259FF] underline"
                        >
                          <Link2 size={10} />
                          {l.txHash.slice(0, 10)}…
                        </a>
                      ) : (
                        <button
                          onClick={() => commitLimit(l)}
                          disabled={committing === l.id}
                          className="bg-[#C6F15C] text-black border-2 border-black px-2 py-1 uppercase font-bold text-[10px] tracking-wider hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-50"
                        >
                          {committing === l.id ? "Signing…" : "Commit on-chain"}
                        </button>
                      )}
                      <button
                        onClick={() => removeLimit(l.id)}
                        className="text-black/40 hover:text-[#EF4444]"
                        title="Remove limit"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-2 border-dashed border-black/40 p-3 grid grid-cols-5 gap-2 items-end">
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Category</span>
                  <input
                    type="text"
                    placeholder="Marketing, Infra, Legal…"
                    value={newLimit.category}
                    onChange={(e) => setNewLimit({ ...newLimit, category: e.target.value })}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <label className="flex flex-col gap-1 col-span-2">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Limit (ALEO/month)</span>
                  <input
                    type="number" min="0"
                    value={newLimit.limitMicro / 1_000_000}
                    onChange={(e) => setNewLimit({ ...newLimit, limitMicro: Math.round(parseFloat(e.target.value || "0") * 1_000_000) })}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <button
                  onClick={addLimit}
                  className="bg-black text-[#B3A0FF] border-2 border-black font-mono text-[10px] font-bold uppercase tracking-wider py-1.5 flex items-center justify-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <Plus size={12} />
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Vendor Allowlist */}
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#C6F15C] flex items-center justify-between">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Vendor Allowlist</span>
              <span className="font-mono text-[10px] text-black/60 uppercase tracking-wider">inv_v2::set_vendor_allowlist</span>
            </div>
            <div className="p-4 space-y-3">
              <p className="font-mono text-[11px] text-black/60">
                Approved-vendor registry for sanctions screening / AP compliance. Only the aggregate root
                is committed on-chain — the list, individual names, and which vendor was paid stay private.
                Invoice creation gates on a ZK proof of membership.
              </p>

              {/* Current root status */}
              <div className="border-2 border-black bg-[#C6F15C]/20 p-3 font-mono text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-black/60 uppercase tracking-wider text-[9px]">Current root</span>
                  {allowlistTx ? (
                    <a
                      href={explorerTxUrl(allowlistTx)}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-[#A259FF] underline text-[10px]"
                    >
                      <Link2 size={10} />
                      committed · {allowlistTx.slice(0, 10)}…
                    </a>
                  ) : (
                    <span className="text-black/40 text-[10px] italic">uncommitted</span>
                  )}
                </div>
                <p className="break-all text-black">
                  {allowlistRoot || <span className="text-black/30 italic">empty — add vendors below</span>}
                </p>
              </div>

              {/* Entries */}
              {allowlist.length > 0 && (
                <div className="border-2 border-black divide-y-2 divide-black/20">
                  {allowlist.map((e) => (
                    <div key={e.id} className="px-3 py-2 flex items-center gap-3 font-mono text-[11px]">
                      <span className="bg-black text-[#C6F15C] px-2 py-0.5 uppercase font-bold">vendor</span>
                      <span className="text-black flex-1 truncate">{e.name}</span>
                      <span className="text-black/40 text-[9px] tabular-nums">
                        {e.vendorHash.slice(0, 10)}…
                      </span>
                      <button
                        onClick={() => removeAllowlistEntry(e.id)}
                        className="text-black/40 hover:text-[#EF4444]"
                        title="Remove vendor"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add vendor */}
              <div className="border-2 border-dashed border-black/40 p-3 flex gap-2 items-end">
                <label className="flex flex-col gap-1 flex-1">
                  <span className="font-mono text-[9px] uppercase font-bold text-black/60">Vendor name</span>
                  <input
                    type="text"
                    placeholder="Cipher Infrastructure"
                    value={newAllowlistName}
                    onChange={(e) => setNewAllowlistName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addAllowlistEntry(); }}
                    className="border-2 border-black bg-white font-mono text-[12px] p-1.5"
                  />
                </label>
                <button
                  onClick={addAllowlistEntry}
                  disabled={!newAllowlistName.trim()}
                  className="bg-black text-[#C6F15C] border-2 border-black font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-40"
                >
                  <Plus size={12} />
                  Add vendor
                </button>
              </div>

              {/* Commit */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="font-mono text-[10px] text-black/60">
                  {allowlist.length} vendor{allowlist.length === 1 ? "" : "s"} · root changes on every add/remove · commit after each change
                </p>
                <button
                  onClick={commitAllowlist}
                  disabled={committing === "allowlist" || allowlist.length === 0}
                  className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50"
                >
                  {committing === "allowlist" ? "Signing…" : "Commit Allowlist on-chain"}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b-2 border-black last:border-0">
      <span className="font-mono text-[13px] text-black/50 uppercase font-bold tracking-wider">{label}</span>
      <span className="font-mono text-[13px] text-black font-bold">{value}</span>
    </div>
  );
}

function SettingInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b-2 border-black last:border-0">
      <span className="font-mono text-[13px] text-black/50 uppercase font-bold tracking-wider">{label}</span>
      <input
        className="font-mono text-[13px] text-black font-bold bg-transparent text-right outline-none border-b-2 border-transparent focus:border-black transition-colors w-48"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function SettingSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b-2 border-black last:border-0">
      <span className="font-mono text-[13px] text-black/50 uppercase font-bold tracking-wider">{label}</span>
      <select
        className="font-mono text-[13px] text-black font-bold bg-transparent text-right outline-none cursor-pointer appearance-none border-b-2 border-transparent focus:border-black"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-white text-black font-mono">{opt}</option>
        ))}
      </select>
    </div>
  );
}
