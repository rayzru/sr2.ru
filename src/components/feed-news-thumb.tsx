"use client";

import { Newspaper } from "lucide-react";
import { useState } from "react";

export function FeedNewsThumb({ src }: { src: string }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 dark:bg-sky-900/40">
        <Newspaper className="h-5 w-5 text-sky-500 dark:text-sky-400" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-10 w-10 shrink-0 rounded-lg object-cover"
      onError={() => setError(true)}
    />
  );
}
