"use client";

import { Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrivacyIndicatorProps {
  message?: string;
  compact?: boolean;
  className?: string;
}

export function PrivacyIndicator({
  message = "Encrypted on Aleo",
  compact = false,
  className,
}: PrivacyIndicatorProps) {
  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 text-xs text-accent",
          className
        )}
      >
        <Shield className="h-3 w-3" />
        Private
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-accent/20 bg-accent-muted px-4 py-3",
        className
      )}
    >
      <Shield className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <div>
        <p className="text-sm font-medium text-accent">{message}</p>
        <p className="text-xs text-accent/70">
          This data is stored as a private Aleo record
        </p>
      </div>
    </div>
  );
}
