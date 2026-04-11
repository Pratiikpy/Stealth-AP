"use client";

import { useState, useCallback } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadZoneProps {
  onFileSelected: (file: File) => void;
  loading?: boolean;
  accept?: string;
}

export function FileUploadZone({
  onFileSelected,
  loading = false,
  accept = ".pdf,.png,.jpg,.jpeg,.webp",
}: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        setSelectedFile(file);
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        onFileSelected(file);
      }
    },
    [onFileSelected]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-accent/20 bg-accent-muted px-6 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-accent mb-3" />
        <p className="text-sm font-medium text-accent">
          Extracting invoice data...
        </p>
        <p className="text-xs text-text-4 mt-1">
          AI is reading your invoice. This takes a few seconds.
        </p>
      </div>
    );
  }

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-1px-4 py-3">
        <FileText className="h-8 w-8 text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-1 truncate">
            {selectedFile.name}
          </p>
          <p className="text-xs text-text-4">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <button
          onClick={clearFile}
          className="shrink-0 rounded-md p-1 text-text-4 hover:bg-surface-2 hover:text-text-2 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 cursor-pointer transition-all duration-150",
        dragActive
          ? "border-accent bg-accent-muted"
          : "border-border hover:border-border-hover hover:bg-surface-2"
      )}
    >
      <input
        type="file"
        accept={accept}
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <Upload
        className={cn(
          "h-8 w-8 mb-3",
          dragActive ? "text-accent" : "text-text-4"
        )}
      />
      <p className="text-sm font-medium text-text-1">
        Drop invoice here or click to upload
      </p>
      <p className="text-xs text-text-4 mt-1">
        PDF, PNG, JPG up to 10MB
      </p>
    </div>
  );
}
