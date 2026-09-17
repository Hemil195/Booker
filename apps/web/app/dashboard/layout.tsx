// app/dashboard/layout.tsx
// Centered layout shell with top navigation header replacing sidebar

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabaseServerClient";
import { Navbar } from "@/components/Navbar";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bk-bg)" }}>
      <Navbar user={user} />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}
