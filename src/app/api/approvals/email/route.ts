import { NextRequest, NextResponse } from "next/server";
import { createServerAdmin } from "@/lib/supabase/server";

/**
 * One-click email approval handler.
 * GET /api/approvals/email?token=xxx
 * No login required — token-based auth.
 */
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");

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

    // Redirect to success page
    return NextResponse.redirect(
      new URL(
        `/approvals?approved=${approval.invoices?.invoice_number ?? ""}`,
        request.url
      )
    );
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=approval_failed", request.url)
    );
  }
}
