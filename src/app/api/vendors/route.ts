import { ensureProfile } from "@/lib/supabase/ensure-profile";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .eq("status", "active")
      .order("name");

    if (error) {
      console.error("[vendors GET] query failed", error.message);
      return NextResponse.json({ error: "Failed to fetch vendors" }, { status: 500 });
    }

    const transformed = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      name: row.name || "",
      alias: (row.vendor_hash as string)?.slice(0, 12) || "",
      address: row.payment_address || "",
      // Expose payment_address directly so the vendor-first invoice flow can
      // use it without re-fetching the DB row.
      payment_address: (row.payment_address as string) || "",
      category: row.category || "",
      contact_email: (row.contact_email as string) || "",
      totalPaid: (row.total_paid_micro as number) || 0,
      invoiceCount: (row.invoice_count as number) || 0,
      lastPayment: row.created_at || "",
    }));

    return NextResponse.json({ data: transformed });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch vendors" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let { data: profile } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      const companyId = await ensureProfile(user.id, user.email!);
      if (!companyId) return NextResponse.json({ error: "Failed to create profile" }, { status: 500 });
      profile = { company_id: companyId };
    }

    const body = await request.json();

    const { data, error } = await supabase
      .from("vendors")
      .insert({
        name: body.name,
        legal_name: body.legal_name,
        payment_address: body.payment_address,
        default_token: body.default_token || "ALEO",
        payment_terms: body.payment_terms || 30,
        category: body.category,
        contact_name: body.contact_name,
        contact_email: body.contact_email,
        notes: body.notes,
        vendor_hash: body.vendor_hash,
        status: "active",
        company_id: profile.company_id,
      })
      .select()
      .single();

    if (error) {
      console.error("[vendors POST] insert failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Failed to create vendor" }, { status: 500 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create vendor" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "Missing vendor id" }, { status: 400 });
    }

    // Resolve the caller's company_id for an explicit ownership check — RLS
    // would catch a mismatch anyway, but returning a clear 403 beats a silent
    // no-op update when a user somehow sends another company's vendor id.
    const { data: profile } = await supabase
      .from("users")
      .select("company_id")
      .eq("id", user.id)
      .single();
    if (!profile?.company_id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 403 });
    }

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.payment_address !== undefined) updates.payment_address = body.payment_address;
    if (body.category !== undefined) updates.category = body.category;
    if (body.contact_email !== undefined) updates.contact_email = body.contact_email;
    if (body.default_token !== undefined) updates.default_token = body.default_token;

    const { data, error } = await supabase
      .from("vendors")
      .update(updates)
      .eq("id", body.id)
      .eq("company_id", profile.company_id)
      .select()
      .single();

    if (error) {
      // Sanitize: don't leak raw Postgres/Supabase error strings to clients.
      console.error("[vendors PATCH] update failed", { userId: user.id, vendorId: body.id, err: error.message });
      return NextResponse.json({ error: "Failed to update vendor" }, { status: 500 });
    }

    if (!data) {
      // PostgREST returns null with no error when the where-clause matches
      // zero rows (i.e. the vendor isn't owned by this company).
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }

    return NextResponse.json({ data });
  } catch (err) {
    console.error("[vendors PATCH] unhandled", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Failed to update vendor" },
      { status: 500 }
    );
  }
}
