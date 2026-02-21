"use client";

import { type MouseEvent } from "react";

import { Heart, Mail, MessageCircle, Monitor, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import { cn } from "~/lib/utils";
import { type Theme, useThemeStore } from "~/stores/theme-store";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useThemeTransition } from "./theme-transition";

export function SiteFooter() {
  const { theme, setTheme } = useThemeStore();
  const { setTheme: setNextTheme } = useTheme();
  const triggerTransition = useThemeTransition();

  const handleThemeChange = async (newTheme: Theme, e: MouseEvent) => {
    // Use View Transitions API for smooth animated theme change
    await triggerTransition(
      () => {
        setTheme(newTheme);
        setNextTheme(newTheme);
      },
      { x: e.clientX, y: e.clientY }
    );
  };

  const themeOptions = [
    { value: "system" as Theme, icon: Monitor, label: "Авто" },
    { value: "light" as Theme, icon: Sun, label: "Светлая" },
    { value: "dark" as Theme, icon: Moon, label: "Тёмная" },
  ];
  return (
    <footer className="bg-muted/30 mt-auto border-t">
      <div className="container mx-auto max-w-7xl px-[20px] py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          {/* Signature */}
          <div className="max-w-md space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Heart className="h-4 w-4 text-red-500" />
              <span>Соседями для соседей</span>
            </div>
            <p className="text-muted-foreground text-xs leading-relaxed">
              Информационный сервис создан и поддерживается инициативными жильцами ЖК «Сердце
              Ростова 2». Мы объединяем соседей, собираем полезную информацию и создаём инструменты
              для комфортной жизни в нашем доме.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 md:gap-12">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground mb-1 text-xs font-medium">О сервисе</p>
              <Link href="/larina-45" className="link">
                О проекте
              </Link>
              <Link href="/larina-45/rules" className="link">
                Правила сообщества
              </Link>
              <Link href="/terms" className="link">
                Пользовательское соглашение
              </Link>
              <Link href="/privacy" className="link">
                Политика конфиденциальности
              </Link>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground mb-1 text-xs font-medium">Связаться</p>
              <Link
                href="https://t.me/serdcerostova2"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Основной чат
              </Link>
              <a
                href="mailto:help@sr2.ru"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                help@sr2.ru
              </a>
            </div>
          </div>
        </div>

        {/* Bottom line */}
        <div className="border-border/50 mt-6 flex items-center justify-between border-t pt-4">
          <span className="text-muted-foreground hover:text-foreground text-xs">
            Открытое сообщество в рамках законодательства&nbsp;-&nbsp;
            <a
              href="https://www.consultant.ru/document/cons_doc_LAW_28399/2fd1c7c9b207640443093237e96f505e64cbc197/"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Ст. 30 Конституции РФ
            </a>
          </span>
          {/* Theme switcher & Version badge */}
          <div className="flex items-center gap-2">
            {process.env.NEXT_PUBLIC_BUILD_VERSION && (
              <Badge variant="outline" className="text-muted-foreground h-7 font-mono text-[10px]">
                v{process.env.NEXT_PUBLIC_BUILD_VERSION}
              </Badge>
            )}
            <div className="bg-background flex items-center gap-0.5 rounded-md border p-0.5">
              {themeOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = theme === option.value;
                return (
                  <Button
                    key={option.value}
                    variant="ghost"
                    size="icon"
                    className={cn("h-7 w-7", isSelected && "bg-muted")}
                    onClick={(e) => handleThemeChange(option.value, e)}
                    title={option.label}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
