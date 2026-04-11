interface ApprovalRequestData {
  approverName: string;
  invoiceNumber: string;
  vendorName: string;
  amount: string;
  dueDate: string;
  submittedBy: string;
  approveUrl: string;
  viewUrl: string;
}

export function approvalRequestTemplate(data: ApprovalRequestData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 20px;">

    <!-- Logo -->
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:20px;font-weight:700;color:#f1f5f9;">
        Stealth<span style="color:#2dd4bf;">AP</span>
      </span>
    </div>

    <!-- Card -->
    <div style="background-color:#0f172a;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:32px;">

      <p style="color:#94a3b8;font-size:14px;margin:0 0 8px;">
        Hi ${data.approverName},
      </p>

      <h1 style="color:#f1f5f9;font-size:20px;font-weight:600;margin:0 0 24px;">
        Invoice Needs Your Approval
      </h1>

      <!-- Invoice details -->
      <div style="background-color:#020617;border-radius:8px;padding:16px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Invoice</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;font-weight:500;">${data.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Vendor</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;font-weight:500;">${data.vendorName}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Amount</td>
            <td style="color:#f1f5f9;font-size:18px;padding:4px 0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${data.amount}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Due Date</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;">${data.dueDate}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Submitted by</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;">${data.submittedBy}</td>
          </tr>
        </table>
      </div>

      <!-- Approve button — one primary CTA (Garry Tan) -->
      <a href="${data.approveUrl}" style="display:block;text-align:center;background-color:#0d9488;color:white;font-size:16px;font-weight:600;padding:14px 24px;border-radius:6px;text-decoration:none;margin-bottom:12px;">
        Approve
      </a>

      <!-- View details — secondary as text link (Garry Tan) -->
      <p style="text-align:center;margin:0;">
        <a href="${data.viewUrl}" style="color:#94a3b8;font-size:13px;text-decoration:underline;">
          View Details
        </a>
      </p>
    </div>

    <!-- Footer -->
    <p style="text-align:center;color:#475569;font-size:11px;margin-top:24px;">
      StealthAP — Private Invoice Payments on Aleo
    </p>
  </div>
</body>
</html>`;
}
