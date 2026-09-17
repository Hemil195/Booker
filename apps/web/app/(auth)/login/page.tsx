"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { Loader2 } from "lucide-react";

type AuthState = "idle" | "loading" | "error";

function LoginPageContent() {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    const callbackError = searchParams.get("error");
    if (callbackError) {
      setAuthState("error");
      setErrorMsg(callbackError);
    }

    supabase.auth.getSession().then((res) => {
      if (res?.data?.session?.user) {
        window.location.href = "/dashboard";
      }
    });

    const { data: authData } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        window.location.href = "/dashboard";
      }
    });

    return () => {
      authData?.subscription?.unsubscribe();
    };
  }, [searchParams, supabase]);

  const handleGoogleSignIn = async () => {
    setAuthState("loading");
    setErrorMsg(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });

    if (error) {
      setAuthState("error");
      setErrorMsg("Sign-in was cancelled — try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--bk-bg)" }}
    >
      {/* Subtle background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(146,220,229,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(146,220,229,0.03) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-sm bk-card p-8 animate-fade-in-up"
        style={{ animationDelay: "0ms" }}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Logo.png"
            alt="Bookar"
            className="w-10 h-10 rounded-xl object-cover"
          />
          <div>
            <h1
              className="text-lg font-semibold"
              style={{ color: "var(--bk-text-primary)" }}
            >
              Bookar
            </h1>
            <p className="text-xs" style={{ color: "var(--bk-text-muted)" }}>
              Your saved knowledge, synced everywhere
            </p>
          </div>
        </div>

        {/* Headline */}
        <div className="mb-6">
          <h2
            className="text-2xl font-semibold mb-2 leading-tight"
            style={{ color: "var(--bk-text-primary)" }}
          >
            Sign in to Bookar
          </h2>
          <p className="text-sm" style={{ color: "var(--bk-text-muted)", lineHeight: "1.55" }}>
            Sync your bookmarks across every browser. Get AI descriptions. Let Claude
            and ChatGPT search your saved tools.
          </p>
        </div>

        {/* Error message */}
        {authState === "error" && errorMsg && (
          <div
            className="mb-4 px-4 py-3 rounded-[10px] text-sm animate-fade-in"
            style={{
              background: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#fc8181",
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Google Sign-In button */}
        <button
          onClick={handleGoogleSignIn}
          disabled={authState === "loading"}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-[10px] font-medium text-sm transition-bk"
          style={{
            background: authState === "loading" ? "rgba(43,48,58,0.6)" : "var(--bk-surface)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--bk-text-primary)",
            cursor: authState === "loading" ? "not-allowed" : "pointer",
          }}
          onMouseEnter={(e) => {
            if (authState !== "loading")
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(146,220,229,0.08)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bk-surface)";
          }}
        >
          {authState === "loading" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--bk-accent)" }} />
              <span style={{ color: "var(--bk-text-muted)" }}>Signing in…</span>
            </>
          ) : (
            <>
              {/* Google logo SVG (dark theme variant) */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path
                  d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                  fill="#4285F4"
                />
                <path
                  d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                  fill="#34A853"
                />
                <path
                  d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                  fill="#FBBC05"
                />
                <path
                  d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* Footer note */}
        <p
          className="text-center text-xs mt-6"
          style={{ color: "var(--bk-text-muted)", lineHeight: "1.5" }}
        >
          No password needed. We use Google Sign-In only.
        </p>
      </div>

      {/* Feature pills below card */}
      <div
        className="relative z-10 flex flex-wrap gap-2 mt-6 justify-center animate-fade-in"
        style={{ animationDelay: "120ms" }}
      >
        {["AI descriptions", "Multi-device sync", "Claude + ChatGPT ready", "Always free"].map(
          (f) => (
            <span
              key={f}
              className="bk-pill"
              style={{
                background: "rgba(146,220,229,0.08)",
                border: "1px solid rgba(146,220,229,0.15)",
                color: "var(--bk-text-muted)",
              }}
            >
              {f}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
