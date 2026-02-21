"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";
import { NAV_GROUPS } from "~/lib/navigation";
import { cn } from "~/lib/utils";

export function NavLinks() {
  const pathname = usePathname();

  const isGroupActive = (group: (typeof NAV_GROUPS)[number]) => {
    if (group.direct && group.href) {
      return pathname.startsWith(group.href);
    }
    return group.items.some((item) => {
      if (item.href === "/") return pathname === "/";
      return pathname.startsWith(item.href);
    });
  };

  return (
    <NavigationMenu className="hidden lg:flex">
      <NavigationMenuList>
        {NAV_GROUPS.map((group) => {
          const active = isGroupActive(group);

          if (group.direct && group.href) {
            return (
              <NavigationMenuItem key={group.title}>
                <NavigationMenuLink asChild>
                  <Link
                    href={group.href}
                    data-testid={group.testId}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      active && "bg-accent/60 text-accent-foreground font-medium"
                    )}
                  >
                    {group.title}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            );
          }

          return (
            <NavigationMenuItem key={group.title} hasSubmenu>
              <NavigationMenuTrigger
                className={cn(active && "bg-accent/60 text-accent-foreground font-medium")}
              >
                {group.title}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="w-105 grid gap-1 p-3 sm:grid-cols-2">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const itemActive =
                      item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <NavigationMenuLink asChild>
                          <Link
                            href={item.href}
                            data-testid={item.testId}
                            className={cn(
                              "hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex select-none items-start gap-3 rounded-md p-3 leading-none no-underline outline-none transition-colors",
                              itemActive && "bg-accent/60 text-accent-foreground"
                            )}
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                            <div>
                              <div className="text-sm font-medium leading-none">{item.title}</div>
                              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs leading-snug">
                                {item.description}
                              </p>
                            </div>
                          </Link>
                        </NavigationMenuLink>
                      </li>
                    );
                  })}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
