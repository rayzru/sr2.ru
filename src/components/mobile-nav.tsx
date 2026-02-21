"use client";

import { type MouseEvent, useState } from "react";

import { Menu, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";

import { NAV_GROUPS } from "~/lib/navigation";
import { cn } from "~/lib/utils";
import { type Theme, useThemeStore } from "~/stores/theme-store";

import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { useThemeTransition } from "./theme-transition";

interface MobileNavProps {
  isAuthenticated?: boolean;
}

export function MobileNav({ isAuthenticated }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useThemeStore();
  const { setTheme: setNextTheme } = useTheme();
  const triggerTransition = useThemeTransition();

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
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
          <Menu className="h-5 w-5" />
          <span className="sr-only">Меню</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0! w-full overflow-hidden p-0 sm:w-[320px]">
        <div className="flex h-dvh max-h-full flex-col overflow-hidden">
          <SheetHeader className="shrink-0 p-4 pb-2">
            <SheetTitle>Меню</SheetTitle>
          </SheetHeader>

          {/* Main navigation - scrollable */}
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {/* Content groups from NAV_GROUPS */}
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="mb-1">
                <div className="text-muted-foreground px-3 py-1.5 text-xs font-medium uppercase tracking-wide">
                  {group.title}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.direct && group.href ? (
                    <Link
                      href={group.href}
                      data-testid={group.testId}
                      onClick={() => setOpen(false)}
                    >
                      <Button
                        variant={isActive(group.href) ? "secondary" : "ghost"}
                        className={cn(
                          "h-10 w-full justify-start gap-3",
                          isActive(group.href) && "bg-primary/10 text-primary font-medium"
                        )}
                      >
                        {group.title}
                      </Button>
                    </Link>
                  ) : (
                    group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isActive(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          data-testid={item.testId}
                          onClick={() => setOpen(false)}
                        >
                          <Button
                            variant={active ? "secondary" : "ghost"}
                            className={cn(
                              "h-10 w-full justify-start gap-3",
                              active && "bg-primary/10 text-primary font-medium"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {item.title}
                          </Button>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </nav>

          {/* Theme selector */}
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

          {/* Login for guests */}
          {!isAuthenticated &&
            !pathname.startsWith("/login") &&
            !pathname.startsWith("/register") &&
            !pathname.startsWith("/forgot-password") &&
            !pathname.startsWith("/reset-password") && (
              <div className="shrink-0">
                <Separator />
                <div className="p-2">
                  <Link href="/login" onClick={() => setOpen(false)}>
                    <Button className="h-12 w-full">Войти</Button>
                  </Link>
                </div>
              </div>
            )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
