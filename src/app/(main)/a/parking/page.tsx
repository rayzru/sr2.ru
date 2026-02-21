"use client";

import { Suspense, useState } from "react";

import { ArrowUpDown, Building2, Calendar, Car, ListFilter, Loader2, Phone } from "lucide-react";
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

// Generate parking code: P<building>-<floor>-<spot>
function getParkingCode(listing: ListingData): string {
  if (!listing.parkingSpot?.floor?.parking?.building?.number) {
    return "P?-?-???";
  }
  const building = listing.parkingSpot.floor.parking.building.number;
  const floor = Math.abs(listing.parkingSpot.floor.floorNumber);
  const spot = listing.parkingSpot.number.toString().padStart(3, "0");
  return `P${building}-${floor}-${spot}`;
}

// Parse parking code for sorting
function parseParkingCode(code: string): { building: number; floor: number; spot: number } {
  const match = /P(\d+)-(\d+)-(\d+)/.exec(code);
  if (!match) return { building: 999, floor: 999, spot: 999 };
  return {
    building: parseInt(match[1]!, 10),
    floor: parseInt(match[2]!, 10),
    spot: parseInt(match[3]!, 10),
  };
}

function ParkingListingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentType = searchParams.get("type") as ListingType | null;
  const currentBuilding = searchParams.get("building");
  const currentSort = searchParams.get("sort") ?? "code";

  const [page, setPage] = useState(1);

  const { data: buildingsData } = api.listings.public.buildingsWithParkings.useQuery();
  const { data, isLoading } = api.listings.public.list.useQuery({
    page: 1,
    limit: 100, // Get all for client-side sorting
    type: currentType ?? undefined,
    propertyType: "parking",
    buildingNumber: currentBuilding ? parseInt(currentBuilding) : undefined,
  });

  const setFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/a/parking?${params.toString()}`);
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
    if (currentSort === "code") {
      const codeA = parseParkingCode(getParkingCode(a));
      const codeB = parseParkingCode(getParkingCode(b));
      if (codeA.building !== codeB.building) return codeA.building - codeB.building;
      if (codeA.floor !== codeB.floor) return codeA.floor - codeB.floor;
      return codeA.spot - codeB.spot;
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
        return "По номеру";
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with filters */}
      <PageHeader
        title="Паркинг"
        description="Аренда и продажа парковочных мест"
        backHref="/a"
        icon={
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
            <Car className="h-5 w-5 text-white" />
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
            <SelectItem value="code">По номеру</SelectItem>
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
          <Car className="text-muted-foreground/50 h-12 w-12" />
          <p className="text-muted-foreground mt-4 text-lg font-medium">Объявления не найдены</p>
          {(currentType || currentBuilding) && (
            <button
              onClick={() => router.push("/a/parking")}
              className="text-primary mt-2 text-sm hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paginatedListings.map((listing) => {
            const parkingCode = getParkingCode(listing);
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
                      <Car className="text-muted-foreground/30 h-12 w-12" />
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
                  {/* Parking code badge */}
                  <div className="absolute right-2 top-2">
                    <span className="inline-flex items-center rounded-full bg-gray-900/80 px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                      {parkingCode}
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
                    <span className="line-clamp-1">
                      Строение {listing.parkingSpot?.floor?.parking?.building?.number}, уровень{" "}
                      {listing.parkingSpot?.floor?.floorNumber ?? "?"}, место{" "}
                      {listing.parkingSpot?.number}
                    </span>
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

export default function ParkingListingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <ParkingListingsPageContent />
    </Suspense>
  );
}
