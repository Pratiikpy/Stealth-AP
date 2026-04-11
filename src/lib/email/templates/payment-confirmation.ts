interface PaymentConfirmationData {
  vendorName: string;
  invoiceNumber: string;
  amount: string;
  token: string;
  settlementTime: string;
  transactionHash: string;
  portalUrl: string;
}

export function paymentConfirmationTemplate(
  data: PaymentConfirmationData
): string {
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

      <!-- Success icon -->
      <div style="text-align:center;margin-bottom:20px;">
        <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:50%;background-color:#064e3b;color:#34d399;font-size:24px;text-align:center;">
          ✓
        </div>
      </div>

      <h1 style="color:#f1f5f9;font-size:20px;font-weight:600;margin:0 0 4px;text-align:center;">
        Payment Received
      </h1>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;text-align:center;">
        Settled in ${data.settlementTime}
      </p>

      <!-- Payment details -->
      <div style="background-color:#020617;border-radius:8px;padding:16px;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">From</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;font-weight:500;">Via StealthAP</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Invoice</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;">${data.invoiceNumber}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Amount</td>
            <td style="color:#f1f5f9;font-size:18px;padding:4px 0;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;">${data.amount}</td>
          </tr>
          <tr>
            <td style="color:#94a3b8;font-size:13px;padding:4px 0;">Token</td>
            <td style="color:#f1f5f9;font-size:13px;padding:4px 0;text-align:right;">${data.token}</td>
          </tr>
        </table>
      </div>

      <!-- Privacy badge -->
      <div style="background-color:#042f2e;border:1px solid rgba(13,148,136,0.3);border-radius:8px;padding:12px;margin-bottom:24px;">
        <p style="color:#5eead4;font-size:12px;margin:0;">
          🔒 Encrypted on Aleo — This payment is stored as a private record. No transaction details are visible on-chain.
        </p>
      </div>

      <!-- TX hash -->
      <p style="color:#475569;font-size:11px;margin:0 0 20px;word-break:break-all;font-family:monospace;">
        TX: ${data.transactionHash}
      </p>

      <!-- Portal link -->
      <a href="${data.portalUrl}" style="display:block;text-align:center;background-color:#0d9488;color:white;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;">
        View Payment Portal
      </a>
    </div>

    <!-- Powered by -->
    <p style="text-align:center;color:#475569;font-size:11px;margin-top:24px;">
      Powered by <span style="color:#94a3b8;">StealthAP</span> — Private Invoice Payments on Aleo
    </p>
  </div>
</body>
</html>`;
}
