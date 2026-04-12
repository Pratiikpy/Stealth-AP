import { NextRequest, NextResponse } from "next/server";
import { createServerAdmin } from "@/lib/supabase/server";
import { rateLimit, clientIp } from "@/lib/rate-limit";

/**
 * One-click email approval handler.
 * GET /api/approvals/email?token=xxx
 * No login required — token-based auth.
 */
export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const ip = clientIp(request.headers);
  try {
    // Defense-in-depth against brute-forcing `email_token`. The token is
    // long-random so guessing is infeasible to begin with, but capping any
    // single IP at 20 attempts/min closes the door on a distributed-guess
    // scenario burning through an edge container.
    if (!rateLimit(`approvals-email:${ip}`, 20, 60_000)) {
      console.warn("[approvals/email] rate limited", { ip });
      return NextResponse.redirect(
        new URL("/login?error=rate_limited", request.url)
      );
    }

    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(
        new URL("/login?error=missing_token", request.url)
      );
    }

    // Use admin client — email approvals bypass RLS
    const supabase = await createServerAdmin();

    const { data: approval, error: findError } = await supabase
      .from("approvals")
      .select("*, invoices(id, invoice_number)")
      .eq("email_token", token)
      .eq("status", "pending")
      .gt("email_token_exp", new Date().toISOString())
      .single();

    if (findError || !approval) {
      console.info("[approvals/email] invalid or expired token", { ip, ms: Date.now() - startedAt });
      return NextResponse.redirect(
        new URL("/login?error=invalid_token", request.url)
      );
    }

    // Approve
    await supabase
      .from("approvals")
      .update({
        status: "approved",
        decided_at: new Date().toISOString(),
      })
      .eq("id", approval.id);

    // Update invoice
    if (approval.invoices?.id) {
      await supabase
        .from("invoices")
        .update({
          status: "approved",
          approved_by: approval.approver_id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", approval.invoices.id);
    }

    console.info("[approvals/email] approved", {
      approvalId: approval.id,
      invoiceId: approval.invoices?.id,
      ms: Date.now() - startedAt,
    });
    return NextResponse.redirect(
      new URL(
        `/approvals?approved=${approval.invoices?.invoice_number ?? ""}`,
        request.url
      )
    );
  } catch (err) {
    console.error("[approvals/email] unhandled", {
      ip,
      ms: Date.now() - startedAt,
      err: err instanceof Error ? err.message : err,
    });
    return NextResponse.redirect(
      new URL("/login?error=approval_failed", request.url)
    );
  }
}
