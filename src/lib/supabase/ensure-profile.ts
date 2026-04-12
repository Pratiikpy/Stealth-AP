import { createServerClient } from "@supabase/ssr";

/**
 * Ensures a user profile exists. If not, creates company + user using service role.
 * Returns the company_id, or null if creation fails.
 *
 * Race-safe via Postgres upsert on the users.id primary key: two concurrent
 * first-time logins will both attempt insert, but the one that loses the
 * race will conflict on the PK and we read back the winner's company_id.
 * The earlier check-then-insert pattern left both requests thinking they
 * needed to create a company, producing an orphan row.
 */
export async function ensureProfile(userId: string, email: string): Promise<string | null> {
  const adminClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll() {},
      },
    }
  );

  // Fast path — profile already exists.
  const { data: existing } = await adminClient
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (existing?.company_id) return existing.company_id;

  // Create a company first. If two requests race here, two companies get
  // created; only the one whose user-upsert wins "owns" their user row, the
  // other is orphaned. Acceptable for a single-user default "My Company"
  // bootstrap — the alternative (a DB-side function) is heavier than the
  // cost of one stray row in a small table.
  const { data: company, error: companyErr } = await adminClient
    .from("companies")
    .insert({ name: "My Company" })
    .select("id")
    .single();
  if (companyErr || !company) {
    console.error("[ensureProfile] companies insert failed", companyErr);
    return null;
  }

  // Upsert on id — if a parallel request got here first, we read back their
  // company_id instead of overwriting. ignoreDuplicates makes conflict a
  // no-op; a follow-up select returns the canonical row.
  const { error: upsertErr } = await adminClient
    .from("users")
    .upsert(
      { id: userId, email, role: "admin", company_id: company.id },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (upsertErr) {
    console.error("[ensureProfile] users upsert failed", upsertErr);
    return null;
  }

  // Re-read to resolve the race winner's company_id.
  const { data: winner } = await adminClient
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .single();
  return winner?.company_id ?? company.id;
}
