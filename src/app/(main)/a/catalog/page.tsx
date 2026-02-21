import { Package } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "~/components/page-header";

export const metadata: Metadata = {
  title: "Барахолка | SR2",
  description: "Купля-продажа вещей между жителями ЖК Сердце Ростова 2",
};

export default function CatalogPage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="Барахолка"
        description="Купля-продажа вещей между жителями"
        backHref="/a"
      />
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Package className="text-muted-foreground/50 mb-4 h-12 w-12" />
        <h3 className="font-semibold">Раздел в разработке</h3>
        <p className="text-muted-foreground mt-1 text-sm">Скоро здесь появится барахолка</p>
      </div>
    </div>
  );
}
