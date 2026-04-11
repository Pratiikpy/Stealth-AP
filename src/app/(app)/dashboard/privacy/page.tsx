"use client";

import { motion } from "framer-motion";
import { Eye, EyeOff, Shield, Lock, Info } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

const chainFields = [
  { label: "invoice_id", value: "0x7f3a8b2c...d94e1f06" },
  { label: "status", value: "2" },
  { label: "commitment_root", value: "0xe7c4a9f3...52b1d806" },
  { label: "settlement_anchor", value: "0x9f8e7d6c...b1a2e3f4" },
  { label: "counter_key", value: "0x2c91bf4d...e8a03f17" },
  { label: "approval_count", value: "2" },
  { label: "epoch_id", value: "0xa3f2e8c1...b7d09a45" },
];

const privateFields = [
  { label: "Vendor", value: "Cipher Infrastructure" },
  { label: "Amount", value: "$15,750 ALEO" },
  { label: "Due", value: "Apr 18, 2026" },
  { label: "Category", value: "Infrastructure" },
  { label: "Approved by", value: "Marco Rivera, Priya Nair" },
  { label: "Settlement", value: "1m 47s \u00b7 TX confirmed" },
  { label: "Line items", value: "2 items" },
];

const neverOnChain = [
  "Vendor names",
  "Payment amounts",
  "Company identity",
  "Who approved",
  "Line item details",
  "Internal memos",
];

const onChainOpaque = [
  "invoice_id hash",
  "status code",
  "commitment root",
  "settlement anchor",
  "blinded counter key",
  "approval count",
];

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export default function PrivacyPage() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="How It Works"
        description="Every transaction generates a zero-knowledge proof. The blockchain verifies correctness without seeing your data."
      />

      {/* Illustration notice */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 border-2 border-black bg-[#B3A0FF]">
        <Info size={14} className="text-black flex-shrink-0" />
        <p className="text-[12px] font-mono text-black font-bold">
          This is an illustration of how StealthAP protects your data. The values shown below are examples, not real user data.
        </p>
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        {/* LEFT: Blockchain Observer */}
        <motion.div {...fadeUp} transition={{ delay: 0.1, duration: 0.4 }}>
          <div className="bg-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col">
            <div className="px-4 py-3 border-b-2 border-white/20 flex items-center gap-2">
              <Eye size={14} className="text-[#C6F15C]" />
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-white">Blockchain Observer</span>
              <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-white/30 text-white/50">Example</span>
            </div>
            <div className="px-4 pt-3 pb-1">
              <p className="font-mono text-[11px] text-[#C6F15C] uppercase tracking-wider font-bold mb-3">
                What anyone can read on-chain
              </p>
            </div>
            <div className="px-4 pb-4 flex-1">
              <div className="space-y-0">
                {chainFields.map((f) => (
                  <div key={f.label} className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
                    <span className="text-[12px] font-mono text-white/40">{f.label}</span>
                    <span className="text-[12px] font-mono text-white/70 tabular-nums">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-white/10">
              <p className="font-mono text-[11px] text-white/30 leading-relaxed uppercase tracking-wider">
                No addresses &middot; No amounts &middot; No vendor names &middot; No company identity
              </p>
            </div>
          </div>
        </motion.div>

        {/* RIGHT: Your Private View */}
        <motion.div {...fadeUp} transition={{ delay: 0.2, duration: 0.4 }}>
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] h-full flex flex-col">
            <div className="px-4 py-3 border-b-2 border-black flex items-center gap-2 bg-[#C6F15C]">
              <EyeOff size={14} className="text-black" />
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Your Private View</span>
              <span className="ml-auto font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 border-2 border-black text-black/60">Example</span>
            </div>
            <div className="px-4 pt-3 pb-1">
              <p className="font-mono text-[11px] text-black/50 uppercase tracking-wider font-bold mb-3">
                Decrypted with your wallet only
              </p>
            </div>
            <div className="px-4 pb-4 flex-1">
              <div className="space-y-0">
                {privateFields.map((f) => (
                  <div key={f.label} className="flex items-center justify-between py-2 border-b-2 border-black/10 last:border-0">
                    <span className="font-mono text-[12px] text-black/50 uppercase font-bold">{f.label}</span>
                    <span className="text-[12px] font-mono font-bold text-black">{f.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-4 py-3 border-t-2 border-black">
              <div className="flex items-center gap-1.5">
                <Shield size={12} className="text-black" />
                <p className="font-mono text-[11px] text-black/60 uppercase tracking-wider font-bold">
                  ZK proof verified &middot; 36/36 finalize functions private
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Privacy Architecture */}
      <motion.div {...fadeUp} transition={{ delay: 0.3, duration: 0.4 }}>
        <div className="mb-4">
          <h2 className="font-mono text-xl font-black uppercase tracking-wider text-black flex items-center gap-2">
            <Lock size={16} className="text-black" />
            Privacy Architecture
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#FF90E8]">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">Never on-chain</span>
            </div>
            <div className="p-4">
              <div className="space-y-2.5">
                {neverOnChain.map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 border-2 border-black bg-[#FF90E8] flex items-center justify-center flex-shrink-0">
                      <EyeOff size={11} className="text-black" />
                    </div>
                    <span className="text-[13px] font-mono text-black">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="px-4 py-3 border-b-2 border-black bg-[#C6F15C]">
              <span className="font-mono text-[13px] font-bold uppercase tracking-wider text-black">On-chain (opaque hashes only)</span>
            </div>
            <div className="p-4">
              <div className="space-y-2.5">
                {onChainOpaque.map((item) => (
                  <div key={item} className="flex items-center gap-2.5">
                    <div className="w-5 h-5 border-2 border-black bg-[#C6F15C] flex items-center justify-center flex-shrink-0">
                      <Eye size={11} className="text-black" />
                    </div>
                    <span className="text-[13px] font-mono text-black">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
