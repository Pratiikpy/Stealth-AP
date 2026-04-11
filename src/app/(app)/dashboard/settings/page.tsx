"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/ui/page-header";
import { Settings, Wallet, Users, ShieldCheck, Save } from "lucide-react";
import { useWalletStore } from "@/stores/wallet-store";
import { truncateAddress } from "@/lib/format";
import { formatMicro } from "@/lib/format";

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

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("company");
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const wallet = useWalletStore();

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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#FF90E8]">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Approval Rules</span>
            </div>
            <div className="px-4 py-6 text-center">
              <p className="text-[12px] font-mono text-black/60">
                Approval rules are enforced on-chain via stealthap_wf_v2.aleo.
                Set thresholds using the wallet connection.
              </p>
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
