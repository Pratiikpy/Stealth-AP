import { cn } from "@/lib/utils";

const colorMap: Record<string, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  muted: "bg-text-3",
};

interface StatusDotProps {
  color?: keyof typeof colorMap;
  className?: string;
}

export function StatusDot({ color = "muted", className }: StatusDotProps) {
  return (
    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", colorMap[color], className)} />
  );
}