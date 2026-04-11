import { toast } from "sonner";

/**
 * StealthAP toast system — every notification is intentional.
 *
 * Katie Dill: "A big part of design is just intentionality.
 * Are you being thoughtful about how this thing is perceived?"
 *
 * Rules:
 * - Success toasts are specific ("Settled in 1m 47s") not generic ("Success!")
 * - Error toasts explain what to do next
 * - Privacy toasts reinforce the security model
 * - Never show raw error codes to users
 */

export function toastSuccess(title: string, description?: string) {
  toast.success(title, { description });
}

export function toastError(title: string, description?: string) {
  toast.error(title, {
    description: description || "Please try again or contact support.",
  });
}

export function toastPrivacy(title: string, description?: string) {
  toast(title, {
    description,
    icon: "🔒",
  });
}

export function toastPayment(amount: string, settlementTime: string) {
  toast.success(`Payment Confirmed — ${amount}`, {
    description: `Settled in ${settlementTime}. Vendors notified.`,
  });
}

export function toastApproval(invoiceNumber: string, action: "approved" | "rejected") {
  if (action === "approved") {
    toast.success(`${invoiceNumber} Approved`, {
      description: "Invoice is ready for payment.",
    });
  } else {
    toast(`${invoiceNumber} Rejected`, {
      description: "The submitter has been notified.",
    });
  }
}

export function toastInvoiceCreated(invoiceNumber: string) {
  toast.success(`Invoice ${invoiceNumber} Created`, {
    description: "Added to your vault. Submit for approval when ready.",
  });
}
