"use client";

import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  getRowKey: (row: T) => string;
  emptyMessage?: string;
}

export function DataTable<T>({ columns, data, onRowClick, getRowKey, emptyMessage = "No data" }: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      if (av == null || bv == null) return 0;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  if (data.length === 0) {
    return <p className="font-mono text-text-3 text-sm font-bold uppercase py-8 text-center">{emptyMessage}</p>;
  }

  return (
    <div className="w-full overflow-x-auto bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr className="border-b-2 border-black bg-[#E5E5E5]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "text-left font-mono text-xs font-black uppercase tracking-wider p-4",
                  col.sortable && "cursor-pointer select-none hover:text-text-2 transition-colors",
                  col.className,
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
                aria-sort={
                  col.sortable
                    ? sortKey === col.key
                      ? sortDir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {col.sortable && sortKey === col.key && (
                    sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={getRowKey(row)}
              className={cn(
                "border-b-2 border-black last:border-0 hover:bg-[#C6F15C]/20 transition-colors duration-150",
                onRowClick && "cursor-pointer",
              )}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              {...(onRowClick
                ? {
                    tabIndex: 0,
                    role: "button" as const,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    },
                  }
                : {})}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn("font-mono text-sm font-bold p-4", col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
