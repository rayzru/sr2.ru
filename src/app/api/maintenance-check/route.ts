import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logger } from "~/lib/logger";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { type MaintenanceSettings, SETTING_KEYS, systemSettings } from "~/server/db/schema";

export async function GET() {
  try {
    // Get maintenance settings
    const setting = await db.query.systemSettings.findFirst({
      where: eq(systemSettings.key, SETTING_KEYS.MAINTENANCE_MODE),
    });

    const maintenanceSettings = setting?.value as MaintenanceSettings | undefined;
    const maintenanceEnabled = maintenanceSettings?.enabled ?? false;

    // Check if user is admin
    let isAdmin = false;
    try {
      const session = await auth();
      isAdmin = session?.user?.isAdmin ?? false;
    } catch {
      // Session check failed, treat as not admin
    }

    return NextResponse.json({
      maintenanceEnabled,
      isAdmin,
    });
  } catch (error) {
    logger.error("Maintenance check error:", error);
    // On error, return maintenance disabled to avoid locking users out
    return NextResponse.json({
      maintenanceEnabled: false,
      isAdmin: false,
    });
  }
}
