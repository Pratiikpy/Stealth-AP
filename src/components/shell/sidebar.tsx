"use client";

import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  CheckSquare,
  ArrowRightLeft,
  Users,
  BarChart3,
  Shield,
  ScrollText,
  Zap,
  Menu,
  X,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useWalletStore } from "@/stores/wallet-store";
import { truncateAddress } from "@/lib/format";

const iconMap: Record<string, React.ElementType> = {
  LayoutDashboard,
  FileText,
  CheckSquare,
  ArrowRightLeft,
  Users,
  BarChart3,
  Shield,
  ScrollText,
  Zap,
};

const navSections = [
  {
    title: "WORKSPACE",
    items: [
      { label: "Overview", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Payables", href: "/payables", icon: "FileText" },
      { label: "Approvals", href: "/approvals", icon: "CheckSquare" },
      { label: "Settlements", href: "/settlements", icon: "ArrowRightLeft" },
    ],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Vendors", href: "/dashboard/vendors", icon: "Users" },
      { label: "Analytics", href: "/dashboard/analytics", icon: "BarChart3" },
      { label: "Privacy", href: "/dashboard/privacy", icon: "Shield" },
      { label: "Audit", href: "/dashboard/audit", icon: "ScrollText" },
      { label: "Protocol", href: "/dashboard/protocol", icon: "Zap" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { address, connected } = useWalletStore();

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-1.5 bg-surface-1 border-2 border-black text-text-1 font-mono uppercase retro-shadow"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full bg-surface-1 border-r-2 border-black z-40 flex flex-col",
          "w-[240px] lg:w-[240px] md:w-[56px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Logo area */}
        <div className="h-12 flex items-center px-4 border-b-2 border-black flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent border-2 border-black retro-shadow flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="font-mono text-[14px] font-black uppercase tracking-tight md:hidden lg:inline">
              STEALTH<span className="bg-accent text-black px-1 ml-0.5 border border-black text-[11px]">AP</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-4">
              <span className="text-[10px] uppercase tracking-[0.1em] text-text-3 font-bold font-mono px-2 mb-1.5 block md:hidden lg:block">
                {section.title}
              </span>
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-2 py-1.5 text-[12px] font-mono font-bold uppercase tracking-wider relative",
                      active
                        ? "bg-accent text-black border-2 border-black retro-shadow"
                        : "text-text-3 hover:text-text-1 hover:bg-surface-2",
                    )}
                  >
                    {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                    <span className="md:hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Wallet card */}
        <div className="p-3 border-t-2 border-black flex-shrink-0">
          <div className="bg-surface-2 border-2 border-black p-3 md:p-1.5 lg:p-3">
            <div className="flex items-center gap-2 md:justify-center lg:justify-start">
              <Wallet className="w-3.5 h-3.5 text-text-1 flex-shrink-0" />
              <span className="text-[10px] text-text-3 font-mono uppercase tracking-wider font-bold md:hidden lg:inline">
                {connected ? "CONNECTED" : "NOT CONNECTED"}
              </span>
              {connected && (
                <span className="w-2 h-2 bg-accent border border-black ml-auto md:hidden lg:inline flex-shrink-0" />
              )}
            </div>
            <p className="text-[10px] text-text-3 font-mono mt-1.5 md:hidden lg:block truncate uppercase">
              {address ? truncateAddress(address) : "NO WALLET"}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
