"use client";

import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export function SlidePanel({ open, onClose, title, children, className }: SlidePanelProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) {
      document.addEventListener("keydown", handleKey);
      return () => document.removeEventListener("keydown", handleKey);
    }
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? "slide-panel-title" : undefined}
            className={cn(
              "fixed top-0 right-0 h-full w-full max-w-md bg-white border-l-2 border-black shadow-[-4px_0px_0px_0px_rgba(0,0,0,1)] z-50 flex flex-col",
              className,
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b-2 border-black flex-shrink-0">
              {title && (
                <h2 id="slide-panel-title" className="font-mono text-sm font-bold uppercase tracking-wider text-text-1">{title}</h2>
              )}
              <button
                aria-label="Close panel"
                className="ml-auto p-1 border-2 border-black bg-white hover:bg-[#E5E5E5] text-black transition-colors"
                onClick={onClose}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {children}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
