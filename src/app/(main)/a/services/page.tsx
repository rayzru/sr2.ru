import { Wrench } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "~/components/page-header";

export const metadata: Metadata = {
  title: "Услуги | SR2",
  description: "Услуги от жителей и для жителей ЖК Сердце Ростова 2",
};

export default function ServicesPage() {
  return (
    <div className="container py-8">
      <PageHeader
        title="Услуги"
        description="Услуги от жителей и для жителей"
        backHref="/a"
      />
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Wrench className="text-muted-foreground/50 mb-4 h-12 w-12" />
        <h3 className="font-semibold">Раздел в разработке</h3>
        <p className="text-muted-foreground mt-1 text-sm">Скоро здесь появятся услуги от жителей</p>
      </div>
    </div>
  );
}
