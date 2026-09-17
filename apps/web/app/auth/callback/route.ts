// app/auth/callback/route.ts
// Handles the OAuth redirect from Supabase after Google sign-in.

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription ?? error)}`,
    );
  }

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (!exchangeError) {
      const forwardedHost = req.headers.get("x-forwarded-host");
      const isDev = process.env.NODE_ENV === "development";
      if (isDev) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }

    const message = exchangeError?.message?.toLowerCase().includes("invalid api key")
      ? "Supabase credentials do not match the configured project. Replace NEXT_PUBLIC_SUPABASE_ANON_KEY with the anon key from this Supabase project, then restart the dev server."
      : exchangeError?.message ?? "Unable to complete Google sign-in";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(message)}`);
  }

  // Fallback: If no query code was sent (e.g. hash fragments #access_token=...),
  // return a lightweight HTML response that processes tokens client-side and redirects to /dashboard.
  const html = `<!DOCTYPE html>
<html>
  <head>
    <title>Authenticating...</title>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  </head>
  <body style="background:#09090b;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
    <div style="text-align:center;">
      <p style="font-size:16px;">Completing sign in...</p>
    </div>
    <script>
      (function() {
        var supabaseUrl = "${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}";
        var supabaseAnonKey = "${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''}";
        if (supabaseUrl && supabaseAnonKey && window.supabase) {
          var client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
          client.auth.onAuthStateChange(function(event, session) {
            if (session) {
              window.location.href = "${next}";
            } else {
              setTimeout(function() {
                window.location.href = "${origin}/dashboard";
              }, 1000);
            }
          });
        } else {
          window.location.href = "${origin}/dashboard";
        }
      })();
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
