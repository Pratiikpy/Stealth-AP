"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { SkeletonTable } from "@/components/ui/skeleton";
import { vendors as mockVendors } from "@/lib/mock-data";
import { useData } from "@/lib/hooks/use-data";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { MoneyDisplay } from "@/components/ui/money-display";
import { SlidePanel } from "@/components/ui/slide-panel";
import { DataTable } from "@/components/ui/data-table";
import type { Column } from "@/components/ui/data-table";
import type { Vendor } from "@/lib/types";
import { shortHash } from "@/lib/utils";

const columns: Column<Vendor>[] = [
  {
    key: "name",
    label: "Name",
    sortable: true,
    render: (v: Vendor) => (
      <div>
        <div className="font-mono text-black font-bold">{v.name}</div>
        <div className="text-[11px] text-black/40 font-mono mt-0.5">{v.alias}</div>
      </div>
    ),
  },
  {
    key: "category",
    label: "Category",
    sortable: true,
    render: (v: Vendor) => <span className="font-mono text-black uppercase text-[12px]">{v.category}</span>,
  },
  {
    key: "address",
    label: "Wallet",
    render: (v: Vendor) => (
      <span className="font-mono text-black/50 text-[11px]">{shortHash(v.address)}</span>
    ),
  },
  {
    key: "invoiceCount",
    label: "Invoices",
    sortable: true,
    className: "text-right",
    render: (v: Vendor) => <span className="font-mono text-black font-bold tabular-nums">{v.invoiceCount}</span>,
  },
  {
    key: "totalPaid",
    label: "Total Paid",
    sortable: true,
    className: "text-right",
    render: (v: Vendor) => (
      <span className="font-mono text-black font-bold">
        <MoneyDisplay amount={v.totalPaid} token="ALEO" />
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    render: () => (
      <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[11px] font-bold px-2 py-0.5 inline-block">
        Active
      </span>
    ),
  },
];

const VENDOR_CATEGORIES = ["SaaS", "Infrastructure", "Security", "Legal", "Marketing", "Other"];

interface VendorForm {
  name: string;
  payment_address: string;
  category: string;
  contact_email: string;
  payment_terms: number;
}

const emptyForm: VendorForm = {
  name: "",
  payment_address: "",
  category: "SaaS",
  contact_email: "",
  payment_terms: 30,
};

export default function VendorsPage() {
  const { data: vendors, loading, isReal, refresh: refreshVendors } = useData<Vendor[]>("/api/vendors", mockVendors);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<VendorForm>(emptyForm);

  const updateField = useCallback(<K extends keyof VendorForm>(key: K, value: VendorForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveVendor = useCallback(async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          payment_address: form.payment_address,
          category: form.category,
          contact_email: form.contact_email,
          payment_terms: form.payment_terms,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save vendor");
      }
      refreshVendors();
      setShowAdd(false);
      setForm(emptyForm);
    } catch {
      // Panel stays open on error so user can retry
    } finally {
      setSaving(false);
    }
  }, [form, refreshVendors]);

  const handleClosePanel = useCallback(() => {
    setShowAdd(false);
    setForm(emptyForm);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <PageHeader
        title="Vendor Registry"
        action={
          <div className="flex items-center gap-2">
            {isReal && (
              <span className="bg-[#C6F15C] border-2 border-black text-black font-mono uppercase text-[10px] font-bold px-2 py-0.5">
                Live
              </span>
            )}
            <button
              className="bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-2 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all flex items-center gap-2"
              onClick={() => setShowAdd(true)}
            >
              <Plus className="w-3.5 h-3.5" />
              Add Vendor
            </button>
          </div>
        }
      />

      {loading ? (
        <SkeletonTable rows={5} cols={6} />
      ) : vendors.length === 0 ? (
        <p className="py-12 font-mono text-[13px] text-black/40 text-center uppercase">No vendors registered</p>
      ) : (
        <div className="bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-0 overflow-hidden">
          <DataTable
            columns={columns}
            data={vendors}
            getRowKey={(v) => v.id}
          />
        </div>
      )}

      {/* Add vendor slide panel */}
      <SlidePanel open={showAdd} onClose={handleClosePanel} title="Add Vendor">
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="Vendor name"
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
          />
          <Input
            label="Payment Address"
            placeholder="aleo1..."
            value={form.payment_address}
            onChange={(e) => updateField("payment_address", e.target.value)}
            hint="Aleo wallet address for payments"
          />
          <div className="space-y-1.5">
            <label className="block font-mono text-[11px] font-bold uppercase tracking-wider text-black">Category</label>
            <select
              value={form.category}
              onChange={(e) => updateField("category", e.target.value)}
              className="w-full border-2 border-black bg-white px-3 py-2.5 text-base font-mono text-black focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none transition-all"
            >
              {VENDOR_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Contact Email"
            type="email"
            placeholder="billing@vendor.com"
            value={form.contact_email}
            onChange={(e) => updateField("contact_email", e.target.value)}
          />
          <Input
            label="Payment Terms (days)"
            type="number"
            value={form.payment_terms.toString()}
            onChange={(e) => updateField("payment_terms", parseInt(e.target.value) || 30)}
            hint="Net payment days (default: 30)"
          />
          <div className="pt-2">
            <button
              className="w-full bg-[#C6F15C] text-black border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono uppercase font-bold tracking-wider px-4 py-3 text-sm hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50"
              onClick={handleSaveVendor}
              disabled={saving || !form.name.trim()}
            >
              {saving ? "Saving..." : "Save Vendor"}
            </button>
          </div>
        </div>
      </SlidePanel>
    </motion.div>
  );
}
