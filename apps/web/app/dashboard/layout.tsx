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
    <div className="bk-dashboard-shell min-h-screen flex flex-col">
      <Navbar user={user} />
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5">
        {children}
      </main>
    </div>
  );
}
