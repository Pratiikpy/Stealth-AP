import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user profile with company
    const { data: profile } = await supabase
      .from("users")
      .select("*, companies(*)")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Get team members
    const { data: team } = await supabase
      .from("users")
      .select("id, email, first_name, last_name, role, is_active")
      .eq("company_id", profile.company_id)
      .order("created_at");

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        role: profile.role,
        wallet_address: profile.wallet_address,
      },
      company: profile.companies,
      team: team ?? [],
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { section, data } = body;

  // Get user's company
  const { data: profile } = await supabase
    .from("users")
    .select("company_id, role")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (section === "company" && profile.role === "admin") {
    const { error } = await supabase
      .from("companies")
      .update({
        name: data.name,
        legal_name: data.legal_name,
        default_currency: data.default_currency,
        timezone: data.timezone,
        fiscal_year_start_month: data.fiscal_year_start_month,
        auto_approve_threshold_micro: data.auto_approve_threshold_micro,
      })
      .eq("id", profile.company_id);

    if (error) {
      console.error("[settings] company update failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }
  }

  if (section === "wallet") {
    const { error } = await supabase
      .from("users")
      .update({ wallet_address: data.wallet_address })
      .eq("id", user.id);

    if (error) {
      console.error("[settings] wallet update failed", { userId: user.id, err: error.message });
      return NextResponse.json({ error: "Failed to save wallet" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
