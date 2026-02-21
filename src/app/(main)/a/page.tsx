import { Car, Home, Package, Wrench } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export default function ListingsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <PageHeader title="Объявления" description="Объявления жителей ЖК Сердце Ростова 2" />

      {/* Category cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Parking */}
        <Link href="/a/parking">
          <Card className="relative h-full cursor-pointer overflow-hidden transition-all hover:border-blue-200 hover:bg-blue-50 hover:shadow-lg dark:hover:bg-blue-950/30">
            <Car className="text-muted-foreground/10 absolute -bottom-6 -right-6 h-32 w-32" />
            <CardHeader className="relative z-10">
              <CardTitle className="text-xl">Паркинг</CardTitle>
              <CardDescription>
                Аренда и продажа парковочных мест в подземном паркинге
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Realty */}
        <Link href="/a/aparts">
          <Card className="relative h-full cursor-pointer overflow-hidden transition-all hover:border-green-200 hover:bg-green-50 hover:shadow-lg dark:hover:bg-green-950/30">
            <Home className="text-muted-foreground/10 absolute -bottom-6 -right-6 h-32 w-32" />
            <CardHeader className="relative z-10">
              <CardTitle className="text-xl">Недвижимость</CardTitle>
              <CardDescription>Аренда и продажа квартир в жилом комплексе</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Services - Coming Soon */}
        <Card className="relative h-full overflow-hidden opacity-50">
          <Badge className="absolute right-4 top-4 z-10 bg-amber-500">Скоро</Badge>
          <Wrench className="text-muted-foreground/10 absolute -bottom-6 -right-6 h-32 w-32" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl">Услуги</CardTitle>
            <CardDescription>Услуги от жителей и для жителей комплекса</CardDescription>
          </CardHeader>
        </Card>

        {/* Marketplace - Coming Soon */}
        <Card className="relative h-full overflow-hidden opacity-50">
          <Badge className="absolute right-4 top-4 z-10 bg-amber-500">Скоро</Badge>
          <Package className="text-muted-foreground/10 absolute -bottom-6 -right-6 h-32 w-32" />
          <CardHeader className="relative z-10">
            <CardTitle className="text-xl">Барахолка</CardTitle>
            <CardDescription>Купля-продажа вещей между жителями</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
