"use client";

import { Suspense, useState } from "react";

import { ArrowUpDown, Building2, Calendar, Home, ListFilter, Loader2, Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { PageHeader } from "~/components/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api, type RouterOutputs } from "~/trpc/react";

type ListingType = "rent" | "sale";

type ListingData = RouterOutputs["listings"]["public"]["list"]["listings"][0];

// Get apartment info for sorting and display
function getApartmentInfo(listing: ListingData): {
  building: number;
  entrance: number;
  floor: number;
  apt: string;
  display: string;
} {
  if (!listing.apartment?.floor?.entrance?.building?.number) {
    return { building: 999, entrance: 999, floor: 999, apt: "999", display: "Адрес не указан" };
  }
  const building = listing.apartment.floor.entrance.building.number;
  const entrance = listing.apartment.floor.entrance.entranceNumber;
  const floor = listing.apartment.floor.floorNumber;
  const apt = listing.apartment.number;
  return {
    building,
    entrance,
    floor,
    apt,
    display: `Строение ${building}, подъезд ${entrance}, этаж ${floor}, кв. ${apt}`,
  };
}

function RealtyListingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentType = searchParams.get("type") as ListingType | null;
  const currentBuilding = searchParams.get("building");
  const currentSort = searchParams.get("sort") ?? "building";

  const [page, setPage] = useState(1);

  const { data: buildingsData } = api.listings.public.buildings.useQuery();
  const { data, isLoading } = api.listings.public.list.useQuery({
    page: 1,
    limit: 100, // Get all for client-side sorting
    type: currentType ?? undefined,
    propertyType: "apartment",
    buildingNumber: currentBuilding ? parseInt(currentBuilding) : undefined,
  });

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/a/aparts?${params.toString()}`);
    setPage(1);
  };

  const formatPrice = (price: number, type: ListingType) => {
    const formatted = new Intl.NumberFormat("ru-RU").format(price);
    if (type === "rent") {
      return `${formatted} ₽/мес`;
    }
    return `${formatted} ₽`;
  };

  // Sort listings
  const sortedListings = [...(data?.listings ?? [])].sort((a, b) => {
    if (currentSort === "building") {
      const infoA = getApartmentInfo(a);
      const infoB = getApartmentInfo(b);
      if (infoA.building !== infoB.building) return infoA.building - infoB.building;
      if (infoA.entrance !== infoB.entrance) return infoA.entrance - infoB.entrance;
      if (infoA.floor !== infoB.floor) return infoA.floor - infoB.floor;
      return infoA.apt.localeCompare(infoB.apt, undefined, { numeric: true });
    }
    if (currentSort === "price_asc") {
      return a.price - b.price;
    }
    if (currentSort === "price_desc") {
      return b.price - a.price;
    }
    // Default: by date (newest first)
    return new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime();
  });

  // Client-side pagination
  const pageSize = 20;
  const totalPages = Math.ceil(sortedListings.length / pageSize);
  const paginatedListings = sortedListings.slice((page - 1) * pageSize, page * pageSize);

  // Get current filter labels for display
  const getTypeLabel = () => {
    if (!currentType) return "Все типы";
    return currentType === "rent" ? "Аренда" : "Продажа";
  };

  const getBuildingLabel = () => {
    if (!currentBuilding) return "Все строения";
    return `Строение ${currentBuilding}`;
  };

  const getSortLabel = () => {
    switch (currentSort) {
      case "price_asc":
        return "Сначала дешевые";
      case "price_desc":
        return "Сначала дорогие";
      case "date":
        return "По дате";
      default:
        return "По адресу";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <PageHeader
        title="Недвижимость"
        description="Аренда и продажа квартир"
        backHref="/a"
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600">
            <Home className="h-5 w-5 text-white" />
          </div>
        }
      >
        {/* Type filter */}
        <Select value={currentType ?? "all"} onValueChange={(value) => setFilter("type", value)}>
          <SelectTrigger className="hover:border-border h-auto gap-1.5 border-transparent px-2 py-1.5 focus:ring-0">
            <ListFilter className="h-3.5 w-3.5 opacity-60" />
            <SelectValue>{getTypeLabel()}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="rent">Аренда</SelectItem>
            <SelectItem value="sale">Продажа</SelectItem>
          </SelectContent>
        </Select>

        {/* Building filter */}
        <Select
          value={currentBuilding ?? "all"}
          onValueChange={(value) => setFilter("building", value)}
        >
          <SelectTrigger className="hover:border-border h-auto gap-1.5 border-transparent px-2 py-1.5 focus:ring-0">
            <Building2 className="h-3.5 w-3.5 opacity-60" />
            <SelectValue>{getBuildingLabel()}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все строения</SelectItem>
            {buildingsData?.map((building) => (
              <SelectItem key={building.id} value={String(building.number)}>
                Строение {building.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={currentSort} onValueChange={(value) => setFilter("sort", value)}>
          <SelectTrigger className="hover:border-border h-auto gap-1.5 border-transparent px-2 py-1.5 focus:ring-0">
            <ArrowUpDown className="h-3.5 w-3.5 opacity-60" />
            <SelectValue>{getSortLabel()}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="building">По адресу</SelectItem>
            <SelectItem value="price_asc">Сначала дешевые</SelectItem>
            <SelectItem value="price_desc">Сначала дорогие</SelectItem>
            <SelectItem value="date">По дате</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {/* Listings grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      ) : paginatedListings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Home className="text-muted-foreground/50 h-12 w-12" />
          <p className="text-muted-foreground mt-4 text-lg font-medium">Объявления не найдены</p>
          {(currentType || currentBuilding) && (
            <button
              onClick={() => router.push("/a/aparts")}
              className="text-primary mt-2 text-sm hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedListings.map((listing) => {
            const aptInfo = getApartmentInfo(listing);
            return (
              <Card key={listing.id} className="overflow-hidden">
                {/* Main photo placeholder */}
                <div className="bg-muted relative aspect-video">
                  {listing.photos && listing.photos.length > 0 ? (
                    <img
                      src={listing.photos.find((p) => p.isMain)?.url ?? listing.photos[0]?.url}
                      alt={listing.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Home className="text-muted-foreground/30 h-12 w-12" />
                    </div>
                  )}
                  {/* Type badge */}
                  <div className="absolute left-2 top-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        listing.listingType === "rent"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {listing.listingType === "rent" ? "Аренда" : "Продажа"}
                    </span>
                  </div>
                  {/* Building badge */}
                  <div className="absolute right-2 top-2">
                    <span className="inline-flex items-center rounded-full bg-gray-900/80 px-2.5 py-0.5 text-xs font-medium text-white">
                      Строение {aptInfo.building}
                    </span>
                  </div>
                </div>

                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="line-clamp-2 font-semibold leading-tight">{listing.title}</h3>
                    <span className="text-primary shrink-0 text-lg font-bold">
                      {formatPrice(listing.price, listing.listingType)}
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Location */}
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 shrink-0" />
                    <span className="line-clamp-1">{aptInfo.display}</span>
                  </div>

                  {/* Publication date */}
                  <div className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      {listing.publishedAt
                        ? new Date(listing.publishedAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Дата не указана"}
                    </span>
                  </div>

                  {/* User info */}
                  <div className="flex items-center justify-between border-t pt-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={listing.user?.image ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {listing.user?.name?.slice(0, 2).toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-muted-foreground text-sm">
                        {listing.user?.name ?? "Пользователь"}
                      </span>
                    </div>
                    <Button size="sm" variant="outline">
                      <Phone className="mr-1 h-3 w-3" />
                      Связаться
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Страница {page} из {totalPages} (всего {sortedListings.length})
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперед
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RealtyListingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <RealtyListingsPageContent />
    </Suspense>
  );
}
