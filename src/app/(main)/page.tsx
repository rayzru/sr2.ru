import { Suspense } from "react";

import type { Metadata } from "next";

import { HomeContentSection } from "~/components/home-content-section";
import { fetchWeather } from "~/lib/weather";
import { api } from "~/trpc/server";

import { DirectoryContent } from "./info/directory-content";

export const metadata: Metadata = {
  title: "Главная",
  description:
    "Сердце Ростова 2 — информационный портал жилого комплекса. Новости, мероприятия, справочник организаций и полезная информация для жителей.",
  openGraph: {
    type: "website",
    title: "Сердце Ростова 2",
    description:
      "Информационный портал жилого комплекса. Новости, мероприятия, справочник организаций и полезная информация для жителей.",
    siteName: "Сердце Ростова 2",
  },
  twitter: {
    card: "summary",
    title: "Сердце Ростова 2",
    description:
      "Информационный портал жилого комплекса. Новости, мероприятия, справочник организаций и полезная информация для жителей.",
  },
  alternates: {
    canonical: "/",
  },
};

export default async function Home() {
  // Prefetch root tags and directory entries for DirectoryContent
  const [tags, entries, weather, stats] = await Promise.all([
    api.directory.getTags({ parentId: null }),
    api.directory.list({ limit: 20 }),
    fetchWeather(),
    api.stats.summary(),
  ]);

  const contentSection = (
    <Suspense fallback={<HomeContentSkeleton />}>
      <HomeContentSection weather={weather} stats={stats} />
    </Suspense>
  );

  return (
    <div className="container py-8">
      <Suspense fallback={<DirectoryContentSkeleton />}>
        <DirectoryContent
          initialTags={tags}
          initialEntries={entries}
          contentSlot={contentSection}
        />
      </Suspense>
    </div>
  );
}

function DirectoryContentSkeleton() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <div className="w-full max-w-xl space-y-4">
        <div className="bg-muted h-14 animate-pulse rounded-lg" />
        <div className="flex justify-center gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-10 w-24 animate-pulse rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeContentSkeleton() {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, col) => (
        <div key={col} className="space-y-3">
          <div className="bg-muted h-6 w-24 animate-pulse rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-muted h-16 animate-pulse rounded-lg" />
          ))}
        </div>
      ))}
    </div>
  );
}
