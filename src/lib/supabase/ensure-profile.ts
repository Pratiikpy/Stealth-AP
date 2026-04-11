import { createServerClient } from "@supabase/ssr";

/**
 * Ensures a user profile exists. If not, creates company + user using service role.
 * Returns the company_id or null if creation fails.
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

  // Check if profile exists
  const { data: existing } = await adminClient
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .single();

  if (existing) return existing.company_id;

  // Create company + user
  const { data: company } = await adminClient
    .from("companies")
    .insert({ name: "My Company" })
    .select("id")
    .single();

  if (!company) return null;

  await adminClient.from("users").insert({
    id: userId,
    email: email,
    role: "admin",
    company_id: company.id,
  });

  return company.id;
}
