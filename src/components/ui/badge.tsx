import { cn } from "@/lib/utils";
type BadgeStatus = string;

const statusConfig: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-white border-2 border-black", text: "text-black" },
  pending: { bg: "bg-[#B3A0FF] border-2 border-black", text: "text-black" },
  approved: { bg: "bg-[#C6F15C] border-2 border-black", text: "text-black" },
  rejected: { bg: "bg-[#FF90E8] border-2 border-black", text: "text-black" },
  paid: { bg: "bg-black border-2 border-black", text: "text-[#C6F15C]" },
  settled: { bg: "bg-black border-2 border-black", text: "text-[#C6F15C]" },
  queued: { bg: "bg-[#B3A0FF] border-2 border-black", text: "text-black" },
  processing: { bg: "bg-[#FF90E8] border-2 border-black", text: "text-black" },
  failed: { bg: "bg-[#EF4444] border-2 border-black", text: "text-white" },
};

interface BadgeProps {
  status: BadgeStatus;
  className?: string;
}

export function Badge({ status, className }: BadgeProps) {
  const config = statusConfig[status] ?? statusConfig.draft;
  return (
    <span
      className={cn(
        "inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1",
        config.bg,
        config.text,
        className,
      )}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
