import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Use service role client to bypass RLS for profile creation
        const adminClient = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          {
            cookies: {
              getAll() { return cookieStore.getAll(); },
              setAll() {},
            },
          }
        );

        const { data: existingUser } = await adminClient
          .from("users")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!existingUser) {
          const metadata = user.user_metadata ?? {};

          const { data: company } = await adminClient
            .from("companies")
            .insert({
              name: metadata.company_name || "My Company",
            })
            .select("id")
            .single();

          if (company) {
            await adminClient.from("users").insert({
              id: user.id,
              email: user.email!,
              first_name: metadata.first_name || null,
              last_name: metadata.last_name || null,
              role: "admin",
              company_id: company.id,
            });
          }
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
