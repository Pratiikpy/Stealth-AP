"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Search, Command } from "lucide-react";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/wallet/connect-button";
import { toast } from "sonner";

const pathLabels: Record<string, string> = {
  "/dashboard": "Overview",
  "/payables": "Payables",
  "/approvals": "Approvals",
  "/settlements": "Settlements",
  "/dashboard/analytics": "Analytics",
  "/dashboard/vendors": "Vendors",
  "/dashboard/privacy": "Privacy",
  "/dashboard/audit": "Audit",
  "/dashboard/settings": "Settings",
};

interface TopbarProps {
  breadcrumb?: string[];
}

export function Topbar({ breadcrumb }: TopbarProps) {
  const pathname = usePathname();
  const pageLabel = pathLabels[pathname] ?? "Overview";
  const crumbs = breadcrumb ?? ["StealthAP", pageLabel];

  function handleSearch() {
    toast("Search coming soon", {
      description: "Full-text search across invoices, vendors, and payments.",
    });
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="h-12 border-b-2 border-black bg-surface-1 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2 font-mono text-xs uppercase font-bold tracking-wider">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && <span className="text-text-3">/</span>}
            <span className={cn(i === crumbs.length - 1 ? "text-text-1" : "text-text-3")}>
              {crumb}
            </span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSearch}
          className="flex items-center gap-2 px-3 py-1.5 border-2 border-black font-mono uppercase text-[11px] font-bold tracking-wider bg-surface-2 text-text-1 retro-shadow retro-shadow-active"
        >
          <Search className="w-3.5 h-3.5" />
          <span>SEARCH</span>
          <kbd className="ml-1 flex items-center gap-0.5 text-[10px] text-text-3 bg-surface-0 px-1.5 py-0.5 border border-black font-mono">
            <Command className="w-2.5 h-2.5" />K
          </kbd>
        </button>
        <ConnectButton />
      </div>
    </header>
  );
}
