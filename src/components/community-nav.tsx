"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import ResponsiveWrapper from "./responsive-wrapper";

const weCategories = [
  {
    name: "Руководство",
    slug: "guide",
  },
  {
    name: "Чаты",
    slug: "chats",
  },
  {
    name: "Правила",
    slug: "rules",
  },
  {
    name: "Как помочь?",
    slug: "contribute",
  },
];

export function CommunityNav() {
  const pathname = usePathname();

  return (
    <ResponsiveWrapper>
      <ScrollArea className="my-6 flex flex-col gap-2">
        <div className="flex items-center">
          <CommunityNavLink
            category={{ name: "О нас", slug: "" }}
            isActive={pathname === "/larina-45"}
          />
          {weCategories.map((category) => (
            <CommunityNavLink
              key={category.slug}
              category={category}
              isActive={pathname === `/larina-45/${category.slug}`}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
    </ResponsiveWrapper>
  );
}

function CommunityNavLink({
  category,
  isActive,
}: {
  category: (typeof weCategories)[number];
  isActive: boolean;
}) {
  return (
    <Link
      href={`/larina-45/${category.slug}`}
      key={category.slug}
      className="text-muted-foreground hover:text-foreground data-[active=true]:bg-muted data-[active=true]:text-foreground flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 text-center text-sm font-medium transition-colors"
      data-active={isActive}
    >
      {category.name}
    </Link>
  );
}
