import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Navigation } from "~/components/navigation";
import { SiteFooter } from "~/components/site-footer";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { type MaintenanceSettings, SETTING_KEYS, systemSettings } from "~/server/db/schema";

// Force dynamic rendering (layout uses auth and database queries)
export const dynamic = "force-dynamic";

// Paths that should be accessible during maintenance (for admin login flow)
const MAINTENANCE_BYPASS_PATHS = ["/login", "/register", "/forgot-password", "/reset-password"];

async function checkMaintenance() {
  // Check if current path should bypass maintenance
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";

  if (MAINTENANCE_BYPASS_PATHS.some((path) => pathname.startsWith(path))) {
    return;
  }

  const setting = await db.query.systemSettings.findFirst({
    where: eq(systemSettings.key, SETTING_KEYS.MAINTENANCE_MODE),
  });

  const maintenanceSettings = setting?.value as MaintenanceSettings | undefined;

  if (!maintenanceSettings?.enabled) {
    return;
  }

  // Check if user is admin
  const session = await auth();
  if (session?.user?.isAdmin) {
    return;
  }

  // Redirect non-admins to maintenance page
  redirect("/maintenance");
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  await checkMaintenance();

  // Get current pathname to pass to Navigation
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background/95 supports-backdrop-filter:bg-background/60 sticky top-0 z-50 border-b backdrop-blur">
        <div className="container m-auto max-w-7xl px-5">
          <Navigation pathname={pathname} />
        </div>
      </header>
      <div
        data-wrapper=""
        className="min-w-xs container m-auto grid max-w-7xl flex-1 grid-cols-12 gap-4 px-5"
      >
        <main className="col-span-full">{children}</main>
      </div>
      <SiteFooter />
    </div>
  );
}
