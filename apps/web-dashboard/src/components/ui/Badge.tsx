"use client";

import type { DocumentStatus } from "@memory-platform/shared-schemas";

const statusConfig: Record<DocumentStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-surface-100 text-surface-600" },
  ingesting: { label: "Ingesting", className: "bg-info-100 text-info-700" },
  extracting: { label: "Extracting", className: "bg-warning-100 text-warning-700" },
  chunking: { label: "Chunking", className: "bg-warning-100 text-warning-700" },
  indexing: { label: "Indexing", className: "bg-info-100 text-info-700" },
  ready: { label: "Ready", className: "bg-success-100 text-success-700" },
  error: { label: "Error", className: "bg-error-100 text-error-700" },
};

const connectorStatusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-surface-100 text-surface-600" },
  scanning: { label: "Scanning", className: "bg-info-100 text-info-700" },
  processing: { label: "Processing", className: "bg-warning-100 text-warning-700" },
  completed: { label: "Completed", className: "bg-success-100 text-success-700" },
  failed: { label: "Failed", className: "bg-error-100 text-error-700" },
  cancelled: { label: "Cancelled", className: "bg-surface-100 text-surface-600" },
};

interface BadgeProps {
  variant?: "default" | "success" | "warning" | "error" | "info";
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<string, string> = {
  default: "bg-surface-100 text-surface-700",
  success: "bg-success-100 text-success-700",
  warning: "bg-warning-100 text-warning-700",
  error: "bg-error-100 text-error-700",
  info: "bg-info-100 text-info-700",
};

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "ready" ? "bg-success-600" : status === "error" ? "bg-error-600" : "bg-current opacity-60"}`} />
      {config.label}
    </span>
  );
}

export function ConnectorStatusBadge({ status }: { status: string }) {
  const config = connectorStatusConfig[status] ?? { label: status, className: "bg-surface-100 text-surface-600" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "completed" ? "bg-success-600" : status === "failed" ? "bg-error-600" : status === "processing" ? "animate-pulse bg-warning-600" : "bg-current opacity-60"}`} />
      {config.label}
    </span>
  );
}
