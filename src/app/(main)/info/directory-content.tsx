"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BookOpen,
  Building,
  Droplet,
  ExternalLink,
  FileText,
  Globe,
  Headphones,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  UserCheck,
  X,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";

import { EmergencyPhoneButton } from "~/components/emergency-phone-button";
import { KeyboardShortcut } from "~/components/keyboard-shortcut";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

// Склонение слова "запись" для русского языка
function pluralizeRecords(count: number): string {
  const lastTwo = count % 100;
  const lastOne = count % 10;

  if (lastTwo >= 11 && lastTwo <= 19) {
    return `${count} записей`;
  }
  if (lastOne === 1) {
    return `${count} запись`;
  }
  if (lastOne >= 2 && lastOne <= 4) {
    return `${count} записи`;
  }
  return `${count} записей`;
}

type Tag = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  entryCount: number;
  hasChildren: boolean;
  scope?: string;
};

type Entry = {
  id: string;
  slug: string;
  type: string;
  title: string;
  description: string | null;
  icon: string | null;
  contacts: {
    id: string;
    type: string;
    value: string;
    label: string | null;
    isPrimary: number;
  }[];
  tags: { id: string; name: string; slug: string }[];
};

type DirectoryContentProps = {
  initialTags: Tag[];
  initialEntries: { entries: Entry[]; total: number };
  contentSlot?: React.ReactNode;
};

// Tag groups for quick access
const TAG_GROUPS = {
  services: {
    title: "Полезное",
    tags: [
      { slug: "konsierzh", icon: UserCheck, label: "Консьержи" },
      { slug: "chat", icon: MessageCircle, label: "Чаты" },
    ],
  },
  emergency: {
    title: "Аварийные",
    tags: [
      { slug: "dispetcher", icon: Headphones, label: "Диспетчерские" },
      { slug: "elektrik", icon: Zap, label: "Электрики" },
      { slug: "santehnik", icon: Droplet, label: "Сантехники" },
    ],
  },
  buildings: {
    title: "Строения",
    tags: [
      { slug: "stroenie-1", label: "1" },
      { slug: "stroenie-2", label: "2" },
      { slug: "stroenie-3", label: "3" },
      { slug: "stroenie-4", label: "4" },
      { slug: "stroenie-5", label: "5" },
      { slug: "stroenie-6", label: "6" },
      { slug: "stroenie-7", label: "7" },
    ],
  },
};

// Contact type icons
const CONTACT_ICONS: Record<string, typeof Phone> = {
  phone: Phone,
  telegram: MessageCircle,
  whatsapp: MessageCircle,
  email: Mail,
  website: Globe,
  address: MapPin,
  vk: Globe,
  other: ExternalLink,
};

export function DirectoryContent({ initialTags, contentSlot }: DirectoryContentProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagSlug, setSelectedTagSlug] = useState<string | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastTrackedSearchRef = useRef<string>("");

  // Analytics tracking mutation
  const trackEvent = api.directory.trackEvent.useMutation();

  // CMD+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setSearchQuery("");
        setSelectedTagSlug(null);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Contact search results (new granular search)
  const contactResults = api.directory.searchContacts.useQuery(
    { query: searchQuery, limit: 50 },
    { enabled: searchQuery.length >= 2 }
  );

  // Knowledge base articles search
  const articlesResults = api.knowledge.search.useQuery(
    { query: searchQuery, limit: 5 },
    { enabled: searchQuery.length >= 2 }
  );

  // Contacts by tag (when a tag is clicked) - flat list
  const contactsByTag = api.directory.contactsByTag.useQuery(
    { tagSlug: selectedTagSlug ?? "", limit: 50 },
    { enabled: !!selectedTagSlug }
  );

  // Entries grouped by child tags (for hierarchical display)
  const entriesGrouped = api.directory.entriesGroupedByTag.useQuery(
    { tagSlug: selectedTagSlug ?? "", limit: 50 },
    { enabled: !!selectedTagSlug }
  );

  // Knowledge base articles by tag (when a tag is clicked)
  const articlesByTag = api.knowledge.getByTag.useQuery(
    { tagSlug: selectedTagSlug ?? "", limit: 10 },
    { enabled: !!selectedTagSlug }
  );

  // Track search events (debounced via useEffect)
  useEffect(() => {
    if (
      searchQuery.length >= 2 &&
      contactResults.data &&
      lastTrackedSearchRef.current !== searchQuery
    ) {
      const timeoutId = setTimeout(() => {
        if (lastTrackedSearchRef.current !== searchQuery) {
          lastTrackedSearchRef.current = searchQuery;
          trackEvent.mutate({
            eventType: "search",
            searchQuery,
            resultsCount: contactResults.data?.total ?? 0,
          });
        }
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [searchQuery, contactResults.data, trackEvent]);

  // Determine state
  const isSearching = searchQuery.length >= 2;
  const isFiltering = !!selectedTagSlug;
  const hasActiveQuery = isSearching || isFiltering;

  // Get displayed contacts
  const displayContacts = isSearching
    ? (contactResults.data?.contacts ?? [])
    : isFiltering
      ? (contactsByTag.data?.contacts ?? [])
      : [];

  // Group contacts by entry for search results
  const searchEntriesGrouped = useMemo(() => {
    if (!isSearching || !contactResults.data?.contacts) return [];

    const entriesMap = new Map<
      string,
      {
        id: string;
        slug: string;
        title: string;
        subtitle: string | null;
        icon: string | null;
        contacts: typeof displayContacts;
      }
    >();

    for (const contact of contactResults.data.contacts) {
      const entryId = contact.entryId;
      if (!entriesMap.has(entryId)) {
        entriesMap.set(entryId, {
          id: entryId,
          slug: contact.entrySlug,
          title: contact.entryTitle,
          subtitle: null,
          icon: contact.entryIcon,
          contacts: [],
        });
      }
      entriesMap.get(entryId)!.contacts.push(contact);
    }

    return Array.from(entriesMap.values());
  }, [isSearching, contactResults.data?.contacts]);

  const matchedTags = isSearching ? (contactResults.data?.matchedTags ?? []) : [];

  const handleTagClick = useCallback(
    (slug: string, tagId?: string) => {
      setSelectedTagSlug(slug);
      setSearchQuery("");

      if (tagId) {
        trackEvent.mutate({
          eventType: "tag_click",
          tagId,
        });
      }
    },
    [trackEvent]
  );

  const handleClearFilter = () => {
    setSelectedTagSlug(null);
    setSearchQuery("");
    inputRef.current?.focus();
  };

  // Map tag groups with actual tag data from DB
  const tagGroups = {
    services: {
      ...TAG_GROUPS.services,
      tags: TAG_GROUPS.services.tags.map((t) => ({
        ...t,
        tag: initialTags.find((it) => it.slug === t.slug),
      })),
    },
    emergency: {
      ...TAG_GROUPS.emergency,
      tags: TAG_GROUPS.emergency.tags.map((t) => ({
        ...t,
        tag: initialTags.find((it) => it.slug === t.slug),
      })),
    },
    buildings: {
      ...TAG_GROUPS.buildings,
      tags: TAG_GROUPS.buildings.tags.map((t) => ({
        ...t,
        tag: initialTags.find((it) => it.slug === t.slug),
      })),
    },
  };

  return (
    <div className="flex min-h-[40vh] flex-col">
      {/* Search Section */}
      <div
        className={cn(
          "transition-all duration-300 ease-out",
          hasActiveQuery ? "pt-0" : "flex flex-1 items-center justify-center"
        )}
      >
        <div
          className={cn(
            "w-full transition-all duration-300",
            hasActiveQuery ? "max-w-full" : "mx-auto max-w-xl px-4"
          )}
        >
          {/* Search Input */}
          <div className="relative">
            <Search className="text-muted-foreground absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2" />
            <Input
              ref={inputRef}
              placeholder="Что вас интересует?"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length >= 2) {
                  setSelectedTagSlug(null);
                }
              }}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className={cn(
                "h-14 rounded-full pl-12 text-lg transition-shadow",
                hasActiveQuery ? "pr-12 sm:pr-28" : "pr-4 sm:pr-24",
                "border-2",
                isSearchFocused
                  ? "border-primary shadow-primary/20 shadow-lg"
                  : "border-primary/30 hover:border-primary/50"
              )}
            />
            <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {/* Clear button (X) */}
              {hasActiveQuery && (
                <button
                  type="button"
                  onClick={handleClearFilter}
                  className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-full p-1 transition-colors"
                  aria-label="Очистить поиск"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {/* CMD+K / CTRL+K hint */}
              <KeyboardShortcut shortcutKey="K" />
            </div>
          </div>

          {/* Emergency Phone Button - only show when not searching */}
          {!hasActiveQuery && (
            <div className="mt-4 flex justify-center">
              <EmergencyPhoneButton />
            </div>
          )}

          {/* Quick Access Tags - only show when not searching */}
          {!hasActiveQuery && (
            <>
              {/* Mobile layout: stacked groups with horizontal tags */}
              <div className="mt-6 flex flex-col gap-4 md:hidden">
                {/* Services group */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.services.title}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tagGroups.services.tags.map(({ slug, icon: Icon, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex max-w-[140px] cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        {Icon && (
                          <Icon className="group-hover:text-primary h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        )}
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emergency group */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.emergency.title}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tagGroups.emergency.tags.map(({ slug, icon: Icon, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex max-w-[140px] cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        {Icon && (
                          <Icon className="group-hover:text-primary h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        )}
                        <span className="truncate">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buildings group */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.buildings.title}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {tagGroups.buildings.tags.map(({ slug, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex h-8 w-12 cursor-pointer items-center justify-center gap-1 rounded-full",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        <Building className="group-hover:text-primary h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Desktop layout: 3 columns */}
              <div className="mt-6 hidden grid-cols-3 gap-6 md:grid">
                {/* Services column */}
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.services.title}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {tagGroups.services.tags.map(({ slug, icon: Icon, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex w-fit cursor-pointer items-center gap-2 rounded-full px-3 py-1.5",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        {Icon && (
                          <Icon className="group-hover:text-primary h-4 w-4 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        )}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Emergency column */}
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.emergency.title}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    {tagGroups.emergency.tags.map(({ slug, icon: Icon, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex w-fit cursor-pointer items-center gap-2 rounded-full px-3 py-1.5",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        {Icon && (
                          <Icon className="group-hover:text-primary h-4 w-4 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        )}
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buildings column */}
                <div className="flex flex-col gap-2">
                  <span className="text-muted-foreground text-xs font-medium lowercase">
                    {tagGroups.buildings.title}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {tagGroups.buildings.tags.map(({ slug, label, tag }) => (
                      <button
                        key={slug}
                        onClick={() => handleTagClick(slug, tag?.id)}
                        className={cn(
                          "group flex h-8 cursor-pointer items-center justify-center gap-1 rounded-full",
                          "bg-background border-primary/20 border",
                          "hover:border-primary hover:shadow-sm",
                          "transition-all duration-150",
                          "text-sm"
                        )}
                      >
                        <Building className="group-hover:text-primary h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:opacity-100" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Results Section */}
      {hasActiveQuery && (
        <div className="mt-6 flex-1">
          {/* Filter indicator */}
          <div className="mb-4 flex items-center justify-between text-sm">
            <div className="flex flex-wrap items-center gap-1.5">
              {isSearching &&
                matchedTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => handleTagClick(tag.slug, tag.id)}
                    className={cn(
                      "cursor-pointer rounded-full px-2.5 py-1",
                      "bg-background border-primary/20 border",
                      "hover:border-primary hover:shadow-sm",
                      "transition-all duration-150",
                      "text-foreground/80 text-sm"
                    )}
                  >
                    {tag.name}
                  </button>
                ))}
              {isFiltering &&
                contactsByTag.data?.tag &&
                (() => {
                  const tag = contactsByTag.data.tag;
                  return (
                    <button
                      onClick={() => handleTagClick(tag.slug, tag.id)}
                      className={cn(
                        "cursor-pointer rounded-full px-2.5 py-1",
                        "bg-primary/10 border-primary/30 border",
                        "text-primary text-sm font-medium"
                      )}
                    >
                      {tag.name}
                    </button>
                  );
                })()}
            </div>
            <span className="text-muted-foreground ml-4 shrink-0 text-sm">
              {isSearching && contactResults.data && pluralizeRecords(contactResults.data.total)}
              {isFiltering &&
                entriesGrouped.data &&
                entriesGrouped.data.groups.length > 0 &&
                pluralizeRecords(entriesGrouped.data.total)}
              {isFiltering &&
                entriesGrouped.data?.groups.length === 0 &&
                contactsByTag.data &&
                pluralizeRecords(contactsByTag.data.total)}
            </span>
          </div>

          {/* Loading */}
          {(contactResults.isLoading || contactsByTag.isLoading || entriesGrouped.isLoading) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-muted h-24 animate-pulse rounded-lg" />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!contactResults.isLoading &&
            !contactsByTag.isLoading &&
            !entriesGrouped.isLoading &&
            displayContacts.length === 0 &&
            (!entriesGrouped.data || entriesGrouped.data.groups.length === 0) && (
              <div className="text-muted-foreground py-12 text-center">
                {isSearching ? "Ничего не найдено" : "Нет контактов с этим тегом"}
              </div>
            )}

          {/* Knowledge base articles (when searching or filtering by tag) */}
          {(() => {
            const articles = isSearching
              ? articlesResults.data?.articles
              : isFiltering
                ? articlesByTag.data?.articles
                : null;

            if (!articles || articles.length === 0) return null;

            return (
              <div className="mb-6">
                <div className="mb-3 flex items-center gap-2">
                  <BookOpen className="text-primary h-4 w-4" />
                  <span className="text-sm font-medium">Полезные статьи</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {articles.map((article) => (
                    <ArticleCard key={article.id} article={article} onTagClick={handleTagClick} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Search results - grouped by entry */}
          {isSearching && searchEntriesGrouped.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {searchEntriesGrouped.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onPhoneClick={(contactId) =>
                    trackEvent.mutate({
                      eventType: "entry_call",
                      contactId,
                    })
                  }
                  onLinkClick={(contactId) =>
                    trackEvent.mutate({
                      eventType: "entry_link",
                      contactId,
                    })
                  }
                  onTagClick={handleTagClick}
                />
              ))}
            </div>
          ) : /* Grouped entries (when filtering by tag) */
          isFiltering && entriesGrouped.data && entriesGrouped.data.groups.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {entriesGrouped.data.groups.flatMap((group) =>
                group.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    onPhoneClick={(contactId) =>
                      trackEvent.mutate({
                        eventType: "entry_call",
                        contactId,
                      })
                    }
                    onLinkClick={(contactId) =>
                      trackEvent.mutate({
                        eventType: "entry_link",
                        contactId,
                      })
                    }
                    onTagClick={handleTagClick}
                  />
                ))
              )}
            </div>
          ) : (
            /* Contact cards grid (flat list fallback) */
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayContacts.map((contact) => (
                <ContactCard
                  key={contact.id}
                  contact={contact}
                  onPhoneClick={(contactId) =>
                    trackEvent.mutate({
                      eventType: "entry_call",
                      contactId,
                    })
                  }
                  onLinkClick={(contactId) =>
                    trackEvent.mutate({
                      eventType: "entry_link",
                      contactId,
                    })
                  }
                  onTagClick={handleTagClick}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Hint when not searching */}
      {!hasActiveQuery && (
        <SearchHint
          onHintClick={(hint) => {
            setSearchQuery(hint);
            inputRef.current?.focus();
          }}
        />
      )}

      {/* Content section — slides in when idle, hides during search */}
      <AnimatePresence>
        {!hasActiveQuery && contentSlot && (
          <motion.div
            key="home-content"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10, transition: { duration: 0.2 } }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            {contentSlot}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Popular search hints for random selection
const SEARCH_HINTS = [
  "консьерж",
  "электрик",
  "сантехник",
  "чат",
  "диспетчер",
  "лифт",
  "домофон",
  "ук",
  "паркинг",
  "интернет",
];

// Generate random pair of hints
function getRandomHintPair(): [string, string] {
  const shuffled = [...SEARCH_HINTS].sort(() => Math.random() - 0.5);
  return [shuffled[0]!, shuffled[1]!];
}

// Animated search hint component
function SearchHint({ onHintClick }: { onHintClick: (hint: string) => void }) {
  const [hintPair, setHintPair] = useState<[string, string] | null>(null);
  const [key, setKey] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Initial appearance and first pair after 300ms
  useEffect(() => {
    // Show container first
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    // Then show first pair after 300ms
    const pairTimer = setTimeout(() => {
      setHintPair(getRandomHintPair());
    }, 300);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(pairTimer);
    };
  }, []);

  // Change hint pair every 60 seconds
  useEffect(() => {
    if (!hintPair) return;

    const interval = setInterval(() => {
      setHintPair(getRandomHintPair());
      setKey((k) => k + 1);
    }, 60000);

    return () => clearInterval(interval);
  }, [hintPair]);

  // Outer container with min-height to prevent footer jumping during lazy load
  return (
    <div className="mt-8 flex min-h-20 flex-col items-center gap-3">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="border-border/30 text-muted-foreground/70 flex items-center gap-2 rounded-full border px-4 py-2 text-sm"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0 opacity-50" />
        <span className="opacity-70">попробуйте</span>
        <AnimatePresence mode="wait">
          {hintPair && (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-center gap-1.5"
            >
              <button
                onClick={() => onHintClick(hintPair[0])}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1",
                  "bg-background border-primary/20 border",
                  "hover:border-primary hover:shadow-sm",
                  "transition-all duration-150",
                  "text-foreground/80"
                )}
              >
                {hintPair[0]}
              </button>
              <span className="opacity-50">или</span>
              <button
                onClick={() => onHintClick(hintPair[1])}
                className={cn(
                  "cursor-pointer rounded-full px-2.5 py-1",
                  "bg-background border-primary/20 border",
                  "hover:border-primary hover:shadow-sm",
                  "transition-all duration-150",
                  "text-foreground/80"
                )}
              >
                {hintPair[1]}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <KeyboardShortcut shortcutKey="K" className="opacity-50" />
      </motion.div>

      {/* Missing info link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isVisible ? 1 : 0 }}
        transition={{ duration: 0.3, delay: 0.2, ease: "easeOut" }}
      >
        <Link
          href="/feedback?type=suggestion&title=Не хватает информации в справочнике&focus=content"
          className="link text-xs"
        >
          Не хватает информации?
        </Link>
      </motion.div>
    </div>
  );
}

// Contact card - light design with focus on readability
function ContactCard({
  contact,
  onPhoneClick,
  onLinkClick,
  onTagClick,
}: {
  contact: {
    id: string;
    type: string;
    value: string;
    label: string | null;
    subtitle: string | null;
    is24h: number;
    entryTitle: string;
    entrySlug: string;
    tags: { id: string; name: string; slug: string }[];
  };
  onPhoneClick?: (contactId: string) => void;
  onLinkClick?: (contactId: string) => void;
  onTagClick?: (tagSlug: string, tagId: string) => void;
}) {
  const Icon = CONTACT_ICONS[contact.type] ?? ExternalLink;

  const handleClick = () => {
    if (contact.type === "phone") {
      onPhoneClick?.(contact.id);
    } else {
      onLinkClick?.(contact.id);
    }
  };

  // Build contact URL/href
  let href: string;
  switch (contact.type) {
    case "phone":
      href = `tel:${contact.value}`;
      break;
    case "telegram":
      href = contact.value.startsWith("http")
        ? contact.value
        : `https://t.me/${contact.value.replace("@", "")}`;
      break;
    case "whatsapp":
      href = contact.value.startsWith("http")
        ? contact.value
        : `https://wa.me/${contact.value.replace(/\D/g, "")}`;
      break;
    case "email":
      href = `mailto:${contact.value}`;
      break;
    case "website":
    case "vk":
      href = contact.value;
      break;
    default:
      href = contact.value;
  }

  const isExternalLink = ["telegram", "whatsapp", "website", "vk"].includes(contact.type);

  // Display text for contact
  const contactDisplayText =
    contact.type === "phone" ? contact.value : (contact.label ?? contact.value);

  // Subtitle for phone includes label + subtitle
  const phoneSubtitle =
    contact.type === "phone" && (contact.label || contact.subtitle)
      ? [contact.label, contact.subtitle].filter(Boolean).join(" — ")
      : null;

  return (
    <div className="bg-card hover:border-primary/30 relative flex min-h-[140px] flex-col overflow-hidden rounded-lg border p-4 transition-all hover:shadow-md">
      {/* Icon in corner - like listings page */}
      <Icon className="text-muted-foreground/10 absolute -bottom-4 -right-4 h-20 w-20" />

      {/* Header: Entry title (smaller, not primary) + 24h badge */}
      <div className="relative mb-1 flex items-start justify-between gap-2">
        <Link
          href={`/info/${contact.entrySlug}`}
          className="text-md text-muted-foreground hover:text-foreground truncate transition-colors"
        >
          {contact.entryTitle}
        </Link>
        {contact.is24h === 1 && (
          <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
            24/7
          </span>
        )}
      </div>

      {/* Subtitle */}
      <div className="text-muted-foreground relative mt-1 truncate text-sm">
        {contact.subtitle && contact.type !== "phone" && contact.subtitle}
        {phoneSubtitle && phoneSubtitle}
      </div>

      {/* Main contact info - large and prominent */}
      <a
        href={href}
        target={isExternalLink ? "_blank" : undefined}
        rel={isExternalLink ? "noopener noreferrer" : undefined}
        onClick={handleClick}
        className="group relative mt-2 block"
      >
        <span className="text-foreground group-hover:text-primary line-clamp-2 text-base font-semibold transition-colors">
          {contactDisplayText}
        </span>
      </a>

      {/* Tags - styled like search badges, pinned to bottom */}
      {contact.tags.length > 0 && (
        <div className="relative mt-auto flex flex-wrap gap-1.5 pt-3">
          {contact.tags.slice(0, 3).map((tag) => (
            <button
              key={tag.id}
              onClick={() => onTagClick?.(tag.slug, tag.id)}
              className={cn(
                "cursor-pointer rounded-full px-2 py-0.5 text-[11px]",
                "bg-background border-primary/20 text-muted-foreground border",
                "hover:border-primary hover:text-foreground",
                "transition-all duration-150"
              )}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Entry card - shows entry with all its contacts
function EntryCard({
  entry,
  onPhoneClick,
  onLinkClick,
  onTagClick,
}: {
  entry: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    icon: string | null;
    contacts: {
      id: string;
      type: string;
      value: string;
      label: string | null;
      subtitle: string | null;
      isPrimary: number;
      hasWhatsApp: number;
      hasTelegram: number;
      is24h: number;
      order: number | null;
    }[];
  };
  onPhoneClick?: (contactId: string) => void;
  onLinkClick?: (contactId: string) => void;
  onTagClick?: (tagSlug: string, tagId: string) => void;
}) {
  // Group contacts by type for better organization
  const phoneContacts = entry.contacts.filter((c) => c.type === "phone");
  const messengerContacts = entry.contacts.filter((c) => ["telegram", "whatsapp"].includes(c.type));
  const otherContacts = entry.contacts.filter(
    (c) => !["phone", "telegram", "whatsapp"].includes(c.type)
  );

  // Build contact href
  const getContactHref = (contact: (typeof entry.contacts)[0]) => {
    switch (contact.type) {
      case "phone":
        return `tel:${contact.value}`;
      case "telegram":
        return contact.value.startsWith("http")
          ? contact.value
          : `https://t.me/${contact.value.replace("@", "")}`;
      case "whatsapp":
        return contact.value.startsWith("http")
          ? contact.value
          : `https://wa.me/${contact.value.replace(/\D/g, "")}`;
      case "email":
        return `mailto:${contact.value}`;
      default:
        return contact.value;
    }
  };

  const isExternalLink = (type: string) => ["telegram", "whatsapp", "website", "vk"].includes(type);

  return (
    <div className="bg-card hover:border-primary/30 flex flex-col rounded-lg border p-4 transition-all hover:shadow-md">
      {/* Header: Entry title */}
      <Link
        href={`/info/${entry.slug}`}
        className="group mb-3 flex items-start justify-between gap-2"
      >
        <div className="min-w-0">
          <h3 className="text-foreground group-hover:text-primary font-semibold transition-colors">
            {entry.title}
          </h3>
          {entry.subtitle && (
            <p className="text-muted-foreground mt-0.5 text-sm">{entry.subtitle}</p>
          )}
        </div>
        <ExternalLink className="text-muted-foreground/50 group-hover:text-primary mt-1 h-4 w-4 shrink-0" />
      </Link>

      {/* Contacts list */}
      <div className="flex-1 space-y-2">
        {/* Phone contacts */}
        {phoneContacts.map((contact) => (
          <a
            key={contact.id}
            href={getContactHref(contact)}
            onClick={() => onPhoneClick?.(contact.id)}
            className="hover:bg-muted/50 group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
          >
            <Phone className="text-muted-foreground h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="group-hover:text-primary text-sm font-medium transition-colors">
                  {contact.value}
                </span>
                {contact.is24h === 1 && (
                  <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
                    24/7
                  </span>
                )}
              </div>
              {(contact.label || contact.subtitle) && (
                <span className="text-muted-foreground text-xs">
                  {[contact.label, contact.subtitle].filter(Boolean).join(" — ")}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {contact.hasWhatsApp === 1 && (
                <a
                  href={`https://wa.me/${contact.value.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkClick?.(contact.id);
                  }}
                  className="rounded p-1 hover:bg-green-100 dark:hover:bg-green-900/30"
                  title="WhatsApp"
                >
                  <MessageCircle className="h-4 w-4 text-green-600" />
                </a>
              )}
              {contact.hasTelegram === 1 && (
                <a
                  href={`https://t.me/+${contact.value.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLinkClick?.(contact.id);
                  }}
                  className="rounded p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  title="Telegram"
                >
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                </a>
              )}
            </div>
          </a>
        ))}

        {/* Messenger contacts (Telegram, WhatsApp links) */}
        {messengerContacts.map((contact) => {
          const Icon = CONTACT_ICONS[contact.type] ?? MessageCircle;
          return (
            <a
              key={contact.id}
              href={getContactHref(contact)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onLinkClick?.(contact.id)}
              className="hover:bg-muted/50 group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  contact.type === "whatsapp" && "text-green-600",
                  contact.type === "telegram" && "text-blue-500"
                )}
              />
              <div className="min-w-0 flex-1">
                <span className="group-hover:text-primary text-sm transition-colors">
                  {contact.label ?? contact.value}
                </span>
                {contact.subtitle && (
                  <span className="text-muted-foreground ml-2 text-xs">{contact.subtitle}</span>
                )}
              </div>
            </a>
          );
        })}

        {/* Other contacts (email, website, address, etc.) */}
        {otherContacts.map((contact) => {
          const Icon = CONTACT_ICONS[contact.type] ?? ExternalLink;
          const isLink = isExternalLink(contact.type) || contact.type === "email";
          const href = getContactHref(contact);

          return (
            <a
              key={contact.id}
              href={href}
              target={isLink ? "_blank" : undefined}
              rel={isLink ? "noopener noreferrer" : undefined}
              onClick={() => onLinkClick?.(contact.id)}
              className="hover:bg-muted/50 group -mx-2 flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors"
            >
              <Icon className="text-muted-foreground h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="group-hover:text-primary block truncate text-sm transition-colors">
                  {contact.label ?? contact.value}
                </span>
                {contact.subtitle && (
                  <span className="text-muted-foreground block truncate text-xs">
                    {contact.subtitle}
                  </span>
                )}
              </div>
            </a>
          );
        })}
      </div>

      {/* Empty state if no contacts */}
      {entry.contacts.length === 0 && (
        <p className="text-muted-foreground text-sm italic">Нет контактной информации</p>
      )}
    </div>
  );
}

// Article card for knowledge base results
function ArticleCard({
  article,
  onTagClick,
}: {
  article: {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    icon: string | null;
    tags: { id: string; name: string; slug: string }[];
  };
  onTagClick?: (tagSlug: string, tagId: string) => void;
}) {
  return (
    <Link
      href={`/howtos/${article.slug}`}
      className="from-primary/5 hover:border-primary/30 min-h-30 bg-linear-to-br group relative flex flex-col overflow-hidden rounded-lg border to-transparent p-4 transition-all hover:shadow-md"
    >
      {/* Icon in corner */}
      <FileText className="text-primary/10 absolute -bottom-4 -right-4 h-20 w-20" />

      {/* Title */}
      <h3 className="text-foreground group-hover:text-primary relative line-clamp-2 pr-8 font-medium transition-colors">
        {article.title}
      </h3>

      {/* Excerpt */}
      {article.excerpt && (
        <p className="text-muted-foreground relative mt-1.5 line-clamp-2 text-sm">
          {article.excerpt}
        </p>
      )}

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="relative mt-auto flex flex-wrap gap-1.5 pt-3">
          {article.tags.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTagClick?.(tag.slug, tag.id);
              }}
              className={cn(
                "cursor-pointer rounded-full px-2 py-0.5 text-[11px]",
                "bg-background border-primary/20 text-muted-foreground border",
                "hover:border-primary hover:text-foreground",
                "transition-all duration-150"
              )}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}
