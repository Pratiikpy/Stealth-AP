import { create } from "zustand";
import type { InvoiceRow as Invoice, InvoiceStatusDb as InvoiceStatus } from "@/types";

interface InvoiceState {
  invoices: Invoice[];
  selectedIds: string[];
  filter: {
    status: InvoiceStatus | "all";
    search: string;
    dateFrom: string | null;
    dateTo: string | null;
  };
  loading: boolean;
  setInvoices: (invoices: Invoice[]) => void;
  addInvoice: (invoice: Invoice) => void;
  updateInvoice: (id: string, updates: Partial<Invoice>) => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  setFilter: (filter: Partial<InvoiceState["filter"]>) => void;
  setLoading: (loading: boolean) => void;
}

export const useInvoiceStore = create<InvoiceState>((set) => ({
  invoices: [],
  selectedIds: [],
  filter: {
    status: "all",
    search: "",
    dateFrom: null,
    dateTo: null,
  },
  loading: false,
  setInvoices: (invoices) => set({ invoices }),
  addInvoice: (invoice) =>
    set((s) => ({ invoices: [invoice, ...s.invoices] })),
  updateInvoice: (id, updates) =>
    set((s) => ({
      invoices: s.invoices.map((inv) =>
        inv.id === id ? { ...inv, ...updates } : inv
      ),
    })),
  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((i) => i !== id)
        : [...s.selectedIds, id],
    })),
  selectAll: (ids) => set({ selectedIds: ids }),
  clearSelection: () => set({ selectedIds: [] }),
  setFilter: (filter) =>
    set((s) => ({ filter: { ...s.filter, ...filter } })),
  setLoading: (loading) => set({ loading }),
}));
