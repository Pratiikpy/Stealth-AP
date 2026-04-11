"use client";

import {
  Calendar,
  Hash,
  FileText,
  Tag,
  Clock,
  CheckCircle,
  XCircle,
  Banknote,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PrivacyIndicator } from "@/components/ui/privacy-indicator";
import { formatMicro, formatDate, relativeTime } from "@/lib/format";
import type { InvoiceRow as Invoice } from "@/types";

interface InvoiceDetailProps {
  invoice: Invoice;
}

export function InvoiceDetail({ invoice }: InvoiceDetailProps) {
  const isPayable = invoice.status === "approved";
  const isApprovable = invoice.status === "pending";
  const isCancellable =
    invoice.status === "draft" || invoice.status === "pending";

  return (
    <div className="space-y-6">
      {/* Amount + Status */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-3xl font-bold tabular-nums text-text-1">
            {formatMicro(invoice.total_micro)}
          </p>
          <p className="text-sm text-text-4 mt-1">
            {invoice.currency} · {invoice.amount_micro !== invoice.total_micro &&
              `${formatMicro(invoice.amount_micro)} + ${formatMicro(invoice.tax_micro)} tax`}
          </p>
        </div>
        <Badge status={invoice.status} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {isPayable && (
          <Button icon={<Banknote className="h-4 w-4" />} className="flex-1" onClick={() => {}}>
            Pay Now
          </Button>
        )}
        {isApprovable && (
          <>
            <Button
              icon={<CheckCircle className="h-4 w-4" />}
              className="flex-1"
              onClick={() => {}}
            >
              Approve
            </Button>
            <Button variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => {}}>
              Reject
            </Button>
          </>
        )}
        {isCancellable && (
          <Button variant="secondary" size="sm" onClick={() => {}}>
            Cancel Invoice
          </Button>
        )}
      </div>

      {/* On-chain privacy indicator */}
      {invoice.invoice_hash && (
        <PrivacyIndicator message="Invoice anchored on Aleo" />
      )}

      {/* Details grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-4">
          Details
        </h3>

        <DetailRow icon={Hash} label="Invoice #" value={invoice.invoice_number} />
        <DetailRow icon={Calendar} label="Issue Date" value={formatDate(invoice.issue_date)} />
        <DetailRow icon={Calendar} label="Due Date" value={formatDate(invoice.due_date)} />
        {invoice.po_number && (
          <DetailRow icon={FileText} label="PO Number" value={invoice.po_number} />
        )}
        {invoice.gl_code && (
          <DetailRow icon={Tag} label="GL Code" value={invoice.gl_code} />
        )}
        <DetailRow icon={Clock} label="Created" value={relativeTime(invoice.created_at)} />
      </div>

      {/* Approval timeline */}
      {(invoice.approved_by || invoice.status === "pending") && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-4">
            Approval Chain
          </h3>

          <div className="space-y-2">
            <TimelineItem
              icon={<FileText className="h-3.5 w-3.5" />}
              label="Invoice submitted"
              time={relativeTime(invoice.created_at)}
              done
            />
            {invoice.approved_at ? (
              <TimelineItem
                icon={<CheckCircle className="h-3.5 w-3.5 text-success" />}
                label="Approved"
                time={relativeTime(invoice.approved_at)}
                done
              />
            ) : invoice.status === "rejected" ? (
              <TimelineItem
                icon={<XCircle className="h-3.5 w-3.5 text-danger" />}
                label="Rejected"
                time={relativeTime(invoice.updated_at)}
                done
              />
            ) : (
              <TimelineItem
                icon={<Clock className="h-3.5 w-3.5 text-warning" />}
                label="Awaiting approval"
                time=""
                done={false}
              />
            )}
            {invoice.paid_at && (
              <TimelineItem
                icon={<Shield className="h-3.5 w-3.5 text-accent" />}
                label="Paid privately"
                time={relativeTime(invoice.paid_at)}
                done
              />
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {invoice.notes && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-4">
            Notes
          </h3>
          <p className="text-sm text-text-2">{invoice.notes}</p>
        </div>
      )}

      {/* On-chain data */}
      {invoice.aleo_record_id && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-4">
            On-Chain
          </h3>
          <div className="rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-text-4 break-all">
            Record: {invoice.aleo_record_id}
          </div>
          {invoice.invoice_hash && (
            <div className="rounded-md bg-surface-2 px-3 py-2 font-mono text-xs text-text-4 break-all">
              Hash: {invoice.invoice_hash}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 text-text-4 shrink-0" />
      <span className="text-sm text-text-4 w-24 shrink-0">{label}</span>
      <span className="text-sm text-text-1">{value}</span>
    </div>
  );
}

function TimelineItem({
  icon,
  label,
  time,
  done,
}: {
  icon: React.ReactNode;
  label: string;
  time: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? "text-text-1" : "text-text-4"}`}>
          {label}
        </p>
      </div>
      {time && <span className="text-xs text-text-4 shrink-0">{time}</span>}
    </div>
  );
}
