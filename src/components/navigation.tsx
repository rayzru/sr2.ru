import Link from "next/link";

import { auth } from "~/server/auth";
import { isAdmin, type UserRole } from "~/server/auth/rbac";

import { Button } from "./ui/button";
import { AccountSheet } from "./account-sheet";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { NavLogo } from "./nav-logo";
import { UserNav } from "./user-nav";

// Pages where we don't show the login button (user is already on auth flow)
const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password"];

interface NavigationProps {
  pathname?: string;
}

export async function Navigation({ pathname = "" }: NavigationProps) {
  const session = await auth();
  const userRoles = session?.user?.roles ?? [];
  const hasAdminAccess = isAdmin(userRoles);
  return (
    <div className="flex h-16 items-center justify-between gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
      {/* Left side: Logo */}
      <div className="flex items-center justify-start">
        <NavLogo />
      </div>

      {/* Center: Desktop mega-menu */}
      <NavLinks />

      {/* Right side: user actions */}
      <div className="flex items-center justify-end gap-2">
        {!session && !AUTH_PAGES.some((p) => pathname.startsWith(p)) && (
          <Link passHref href="/login" data-testid="nav-login">
            <Button>Войти</Button>
          </Link>
        )}

        {session && (
          <>
            {/* Desktop: dropdown user menu */}
            <UserNav
              user={{
                name: session.user.name,
                email: session.user.email,
                image: session.user.image,
                roles: userRoles as string[],
              }}
              isAdmin={hasAdminAccess}
            />

            {/* Mobile: account sheet trigger */}
            <AccountSheet
              user={{
                name: session.user.name,
                image: session.user.image,
                roles: userRoles as string[],
              }}
              isAdmin={hasAdminAccess}
            />
          </>
        )}

        {/* Mobile: burger menu */}
        <MobileNav isAuthenticated={!!session} />
      </div>
    </div>
  );
}
