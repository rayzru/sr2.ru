import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";

interface SectionHeaderProps {
  icon?: LucideIcon;
  title: string;
  href?: string;
  linkLabel?: string;
}

export function SectionHeader({ icon: Icon, title, href, linkLabel = "Все" }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="text-muted-foreground h-5 w-5" />}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {href && (
        <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" asChild>
          <Link href={href} className="gap-1">
            {linkLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      )}
    </div>
  );
}
