"use client";

import { LayoutDashboard, LogOut, Shield } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";

import { CABINET_ITEMS } from "~/lib/navigation";
import { getRankConfig } from "~/lib/ranks";
import { cn } from "~/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface UserNavProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    roles?: string[];
  };
  isAdmin?: boolean;
}

export function UserNav({ user, isAdmin }: UserNavProps) {
  const rankConfig = getRankConfig((user.roles ?? []) as Parameters<typeof getRankConfig>[0]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden gap-2 lg:flex">
          <Avatar
            className={cn(
              "ring-offset-background h-6 w-6 shrink-0 ring-2 ring-offset-1",
              rankConfig.ringColor
            )}
          >
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback className="text-[10px]">{user.name?.slice(0, 2)}</AvatarFallback>
          </Avatar>
          <span className="max-w-36 truncate text-sm">{user.name ?? "Кабинет"}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* User info */}
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium leading-none">{user.name ?? "Пользователь"}</p>
            {user.email && (
              <p className="text-muted-foreground text-xs leading-none">{user.email}</p>
            )}
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {/* Cabinet links */}
        {CABINET_ITEMS.map((item) => (
          <DropdownMenuItem key={item.href} asChild>
            <Link href={item.href} data-testid={item.testId}>
              {item.href === "/my" && <LayoutDashboard className="mr-2 h-4 w-4" />}
              {item.title}
            </Link>
          </DropdownMenuItem>
        ))}

        {/* Admin link */}
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin" data-testid="nav-admin">
                <Shield className="mr-2 h-4 w-4" />
                Администрирование
              </Link>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="text-destructive focus:text-destructive cursor-pointer"
          onClick={() => signOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
