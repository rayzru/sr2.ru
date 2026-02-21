"use client";

import { type MouseEvent, useState } from "react";

import {
  Bell,
  Building2,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Monitor,
  Moon,
  Shield,
  Sun,
  User,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { getRankConfig } from "~/lib/ranks";
import { cn } from "~/lib/utils";
import { type Theme, useThemeStore } from "~/stores/theme-store";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { useThemeTransition } from "./theme-transition";

interface AccountSheetProps {
  user: {
    name?: string | null;
    image?: string | null;
    roles?: string[];
  };
  isAdmin?: boolean;
}

const CABINET_NAV = [
  { title: "Мой кабинет", href: "/my", icon: LayoutDashboard, testId: "nav-cabinet" },
  { title: "Профиль", href: "/my/profile", icon: User, testId: "nav-profile" },
  { title: "Уведомления", href: "/my/notifications", icon: Bell, testId: "nav-notifications" },
  { title: "Безопасность", href: "/my/security", icon: KeyRound, testId: "nav-security" },
  { title: "Недвижимость", href: "/my/property", icon: Building2, testId: "nav-property" },
  { title: "Объявления", href: "/my/ads", icon: Megaphone, testId: "nav-ads" },
] as const;

export function AccountSheet({ user, isAdmin }: AccountSheetProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useThemeStore();
  const { setTheme: setNextTheme } = useTheme();
  const triggerTransition = useThemeTransition();

  const rankConfig = getRankConfig((user.roles ?? []) as Parameters<typeof getRankConfig>[0]);

  const isActive = (href: string) => {
    if (href === "/my") return pathname === "/my";
    return pathname.startsWith(href);
  };

  const handleThemeChange = async (newTheme: Theme, e: MouseEvent) => {
    await triggerTransition(
      () => {
        setTheme(newTheme);
        setNextTheme(newTheme);
      },
      { x: e.clientX, y: e.clientY }
    );
  };

  const themeOptions = [
    { value: "system" as Theme, label: "Система", icon: Monitor },
    { value: "light" as Theme, label: "Светлая", icon: Sun },
    { value: "dark" as Theme, label: "Тёмная", icon: Moon },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Avatar
            className={cn(
              "ring-offset-background h-7 w-7 ring-2 ring-offset-1",
              rankConfig.ringColor
            )}
          >
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="text-xs">{user.name?.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Аккаунт</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0! w-full overflow-hidden p-0 sm:w-[300px]">
        <div className="flex h-dvh max-h-full flex-col overflow-hidden">
          {/* User info header */}
          <SheetHeader className="shrink-0 p-4 pb-3">
            <div className="flex items-center gap-3">
              <Avatar
                className={cn(
                  "ring-offset-background h-10 w-10 ring-2 ring-offset-2",
                  rankConfig.ringColor
                )}
              >
                <AvatarImage src={user.image ?? undefined} />
                <AvatarFallback>{user.name?.slice(0, 2) ?? "U"}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <SheetTitle className="text-base font-medium">
                  {user.name ?? "Пользователь"}
                </SheetTitle>
                {isAdmin && <span className="text-muted-foreground text-xs">Администратор</span>}
              </div>
            </div>
          </SheetHeader>

          <Separator />

          {/* Cabinet links - scrollable */}
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="flex flex-col gap-0.5">
              {CABINET_NAV.map(({ title, href, icon: Icon, testId }) => {
                const active = isActive(href);
                return (
                  <Link key={href} href={href} data-testid={testId} onClick={() => setOpen(false)}>
                    <Button
                      variant={active ? "secondary" : "ghost"}
                      className={cn(
                        "h-10 w-full justify-start gap-3",
                        active && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {title}
                    </Button>
                  </Link>
                );
              })}
            </div>

            {isAdmin && (
              <>
                <Separator className="my-2" />
                <Link href="/admin" data-testid="nav-admin" onClick={() => setOpen(false)}>
                  <Button
                    variant={pathname.startsWith("/admin") ? "secondary" : "ghost"}
                    className={cn(
                      "h-10 w-full justify-start gap-3",
                      pathname.startsWith("/admin") && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <Shield className="h-4 w-4" />
                    Администрирование
                  </Button>
                </Link>
              </>
            )}
          </nav>

          {/* Theme */}
          <div className="shrink-0">
            <Separator />
            <div className="p-2">
              <div className="text-muted-foreground px-3 py-2 text-xs">Тема</div>
              <div className="flex gap-1">
                {themeOptions.map((option) => {
                  const Icon = option.icon;
                  const isSelected = theme === option.value;
                  return (
                    <Button
                      key={option.value}
                      variant={isSelected ? "secondary" : "ghost"}
                      size="sm"
                      className={cn("flex-1 gap-2", isSelected && "bg-primary/10 text-primary")}
                      onClick={(e) => handleThemeChange(option.value, e)}
                    >
                      <Icon className="h-4 w-4" />
                      {option.label}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Logout */}
          <div className="shrink-0">
            <Separator />
            <div className="p-2">
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-12 w-full justify-start gap-3"
                onClick={() => signOut()}
              >
                <LogOut className="h-5 w-5" />
                Выйти
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
