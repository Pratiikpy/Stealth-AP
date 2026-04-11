"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  success?: boolean;
}

/**
 * Input with Stripe-grade validation UX:
 * - Never shows errors while user is actively typing
 * - Only validates on blur (when user leaves the field)
 * - Shows subtle success checkmark when field is valid
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, icon, id, success, onBlur, onFocus, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const [focused, setFocused] = useState(false);
    const [touched, setTouched] = useState(false);

    const showError = error && touched && !focused;
    const showSuccess = success && touched && !focused && !error;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block font-mono text-xs font-bold uppercase tracking-wider text-text-3"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-4">
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              setTouched(true);
              onBlur?.(e);
            }}
            className={cn(
              "w-full border-2 border-black bg-white font-mono text-sm p-3 text-text-1 placeholder:text-text-4",
              "transition-all duration-150",
              "focus:border-black focus:ring-0 focus:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:outline-none",
              showError
                ? "border-[#EF4444] shadow-[2px_2px_0px_0px_rgba(239,68,68,1)]"
                : showSuccess
                  ? "border-black"
                  : "border-black",
              icon && "pl-10",
              showSuccess && "pr-10",
              className
            )}
            {...props}
          />
          {showSuccess && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              <Check className="h-4 w-4 text-black" />
            </span>
          )}
        </div>
        {showError && <p className="font-mono text-xs font-bold text-[#EF4444]">{error}</p>}
        {hint && !showError && (
          <p className="font-mono text-xs text-text-4">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
