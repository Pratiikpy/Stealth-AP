import { cn } from "@/lib/utils";
import { formatMicro } from "@/lib/utils";

interface MoneyDisplayProps {
  amount: number;
  token?: string;
  decimals?: number;
  className?: string;
}

export function MoneyDisplay({ amount, token = "ALEO", decimals = 2, className }: MoneyDisplayProps) {
  return (
    <span className={cn("tabular-nums font-mono font-black", className)}>
      {formatMicro(amount, decimals)}{" "}
      <span className="font-mono text-text-3 uppercase">{token}</span>
    </span>
  );
}
