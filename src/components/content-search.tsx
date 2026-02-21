"use client";

import { useEffect, useRef, useState } from "react";

import { BookOpen, CalendarDays, Loader2, Newspaper, ScrollText, X } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

export interface LinkedContent {
  id: string;
  type: string;
  title?: string;
}

interface ContentSearchProps {
  value: LinkedContent[];
  onChange: (items: LinkedContent[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  event: "Событие",
  publication: "Публикация",
  news: "Новость",
  knowledge: "База знаний",
};

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  event: CalendarDays,
  publication: ScrollText,
  news: Newspaper,
  knowledge: BookOpen,
};

export function ContentSearch({
  value,
  onChange,
  placeholder = "Поиск по названию...",
  disabled = false,
}: ContentSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: results, isFetching } = api.publications.searchContent.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );

  const selectedIds = new Set(value.map((v) => v.id));

  const filteredResults = results?.filter((r) => !selectedIds.has(r.id)) ?? [];

  const handleSelect = (item: { id: string; title: string; type: string }) => {
    onChange([...value, { id: item.id, type: item.type, title: item.title }]);
    setQuery("");
    setDebouncedQuery("");
    setOpen(false);
  };

  const handleRemove = (id: string) => {
    onChange(value.filter((v) => v.id !== id));
  };

  return (
    <div className="space-y-2" ref={containerRef}>
      {/* Selected items */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => {
            const Icon = TYPE_ICONS[item.type] ?? ScrollText;
            const label = TYPE_LABELS[item.type] ?? item.type;
            return (
              <Badge
                key={item.id}
                variant="secondary"
                className="flex items-center gap-1 pr-1"
              >
                <Icon className="h-3 w-3 shrink-0 opacity-60" />
                <span className="text-muted-foreground text-[10px] uppercase tracking-wide">
                  {label}
                </span>
                <span className="max-w-40 truncate text-xs font-medium">
                  {item.title ?? item.id.slice(0, 8) + "…"}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="hover:bg-muted-foreground/20 ml-0.5 rounded"
                  disabled={disabled}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-8"
        />
        {isFetching && (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 animate-spin" />
        )}

        {/* Dropdown */}
        {open && debouncedQuery.length >= 2 && (
          <div className="bg-popover border-border absolute top-full right-0 left-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border shadow-lg">
            {filteredResults.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-sm">
                {isFetching ? "Поиск..." : "Ничего не найдено"}
              </p>
            ) : (
              <ul className="py-1">
                {filteredResults.map((item) => {
                  const Icon = TYPE_ICONS[item.type] ?? ScrollText;
                  const label = TYPE_LABELS[item.type] ?? item.type;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={cn(
                          "hover:bg-accent flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors"
                        )}
                      >
                        <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{item.title}</span>
                        <span className="text-muted-foreground text-xs">{label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
