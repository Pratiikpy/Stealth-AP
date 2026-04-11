"use client";

import { Shield, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingStateProps {
  message?: string;
  submessage?: string;
  variant?: "default" | "privacy" | "inline";
  className?: string;
}

/**
 * Contextual loading states — never a bare spinner.
 *
 * Katie Dill: "Design should bring joy to utility."
 * A loading state is an opportunity to build trust,
 * not a moment where trust erodes from silence.
 */
export function LoadingState({
  message = "Loading...",
  submessage,
  variant = "default",
  className,
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <span className={cn("inline-flex items-center gap-2 text-sm text-text-4", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {message}
      </span>
    );
  }

  if (variant === "privacy") {
    return (
      <div className={cn("flex flex-col items-center justify-center py-16", className)}>
        <div className="relative">
          <Shield className="h-12 w-12 text-accent" />
          <div className="absolute inset-0 h-12 w-12 rounded-full bg-accent/10 animate-ping" />
        </div>
        <p className="mt-4 text-sm font-medium text-text-1">{message}</p>
        {submessage && (
          <p className="mt-1 text-xs text-text-4">{submessage}</p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      <Loader2 className="h-8 w-8 text-accent animate-spin" />
      <p className="mt-3 text-sm text-text-2">{message}</p>
      {submessage && (
        <p className="mt-1 text-xs text-text-4">{submessage}</p>
      )}
    </div>
  );
}
