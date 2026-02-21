import { and, eq, lte } from "drizzle-orm";
import type { MetadataRoute } from "next";

import { db } from "~/server/db";
import { directoryEntries, news, publications } from "~/server/db/schema";

const siteUrl = "https://sr2.ru";

// Force dynamic rendering - sitemap needs database access
export const dynamic = "force-dynamic";

// Revalidate sitemap once per day
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/news`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/events`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/info`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];

  // Community static pages
  const communityPages: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/larina-45`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/larina-45/rules`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/larina-45/guide`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/larina-45/chats`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/larina-45/contribute`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/larina-45/map`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Fetch all dynamic data in parallel
  const [publishedNews, publishedEvents, activeDirectoryEntries] = await Promise.all([
    // Published news
    db
      .select({
        slug: news.slug,
        updatedAt: news.updatedAt,
        publishAt: news.publishAt,
      })
      .from(news)
      .where(and(eq(news.status, "published"), lte(news.publishAt, now))),

    // Published events
    db
      .select({
        id: publications.id,
        updatedAt: publications.updatedAt,
        createdAt: publications.createdAt,
      })
      .from(publications)
      .where(and(eq(publications.type, "event"), eq(publications.status, "published"))),

    // Active directory entries
    db
      .select({
        slug: directoryEntries.slug,
        updatedAt: directoryEntries.updatedAt,
      })
      .from(directoryEntries)
      .where(eq(directoryEntries.isActive, 1)),
  ]);

  const newsPages: MetadataRoute.Sitemap = publishedNews.map((item) => ({
    url: `${siteUrl}/news/${item.slug}`,
    lastModified: item.updatedAt ?? item.publishAt ?? now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const eventPages: MetadataRoute.Sitemap = publishedEvents.map((item) => ({
    url: `${siteUrl}/events/${item.id}`,
    lastModified: item.updatedAt ?? item.createdAt,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  const directoryPages: MetadataRoute.Sitemap = activeDirectoryEntries.map((item) => ({
    url: `${siteUrl}/info/${item.slug}`,
    lastModified: item.updatedAt,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...communityPages, ...newsPages, ...eventPages, ...directoryPages];
}
