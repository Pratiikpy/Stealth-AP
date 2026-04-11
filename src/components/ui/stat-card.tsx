import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  className?: string;
}

export function StatCard({ label, value, sub, icon: Icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] p-4",
        className
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="font-mono text-xs uppercase font-bold tracking-wider text-text-3">
          {label}
        </span>
        {Icon && <Icon size={14} className="text-black" strokeWidth={2.5} />}
      </div>
      <div className="font-mono text-3xl font-black text-text-1 tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="font-mono text-xs uppercase font-bold text-text-4 mt-1">{sub}</div>
      )}
    </div>
  );
}
