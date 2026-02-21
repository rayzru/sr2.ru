"use client";

import { useState } from "react";

import {
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminPageHeader } from "~/components/admin/admin-page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useToast } from "~/hooks/use-toast";
import type { PublicationStatus } from "~/server/db/schema";
import { api } from "~/trpc/react";

const STATUS_CONFIG: Record<
  PublicationStatus,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  draft: { label: "Черновик", variant: "secondary" },
  pending: { label: "На модерации", variant: "outline" },
  published: { label: "Опубликовано", variant: "default" },
  rejected: { label: "Отклонено", variant: "destructive" },
  archived: { label: "В архиве", variant: "secondary" },
};

export default function AdminEventsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // URL params
  const pageParam = searchParams.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const statusFilter = searchParams.get("status") ?? "all";
  const searchQuery = searchParams.get("q") ?? "";

  // Local state
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; title: string } | null>(null);
  const [moderateDialogOpen, setModerateDialogOpen] = useState(false);
  const [eventToModerate, setEventToModerate] = useState<{
    id: string;
    title: string;
    action: "approve" | "reject";
  } | null>(null);

  // Queries - filter by type="event"
  const { data, isLoading, refetch } = api.publications.admin.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? (statusFilter as PublicationStatus) : undefined,
  });

  // Filter events client-side (since admin.list doesn't filter by type)
  const events = data?.items.filter((item) => item.type === "event") ?? [];

  // Utils for cache invalidation
  const utils = api.useUtils();

  // Mutations
  const deleteMutation = api.publications.admin.delete.useMutation({
    onSuccess: () => {
      toast({ title: "Мероприятие удалено" });
      setDeleteDialogOpen(false);
      setEventToDelete(null);
      refetch();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const moderateMutation = api.publications.admin.moderate.useMutation({
    onSuccess: () => {
      toast({
        title:
          eventToModerate?.action === "approve"
            ? "Мероприятие опубликовано"
            : "Мероприятие отклонено",
      });
      setModerateDialogOpen(false);
      setEventToModerate(null);
      refetch();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  // URL helpers
  const setPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", newPage.toString());
    }
    router.push(`/admin/events?${params.toString()}`);
  };

  const setStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.delete("page");
    router.push(`/admin/events?${params.toString()}`);
  };

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (localSearch) {
      params.set("q", localSearch);
    } else {
      params.delete("q");
    }
    params.delete("page");
    router.push(`/admin/events?${params.toString()}`);
  };

  const clearSearch = () => {
    setLocalSearch("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    router.push(`/admin/events?${params.toString()}`);
  };

  const openDeleteDialog = (event: { id: string; title: string }) => {
    setEventToDelete(event);
    setDeleteDialogOpen(true);
  };

  const openModerateDialog = (
    event: { id: string; title: string },
    action: "approve" | "reject"
  ) => {
    setEventToModerate({ ...event, action });
    setModerateDialogOpen(true);
  };

  const confirmDelete = () => {
    if (eventToDelete) {
      deleteMutation.mutate({ id: eventToDelete.id });
    }
  };

  const confirmModerate = () => {
    if (eventToModerate) {
      moderateMutation.mutate({
        id: eventToModerate.id,
        status: eventToModerate.action === "approve" ? "published" : "rejected",
      });
    }
  };

  const TZ = "Europe/Moscow";

  const fmtDate = (d: Date) =>
    new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: TZ }).format(d);

  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);

  // Build schedule summary for the date column
  const formatSchedule = (item: (typeof events)[number]) => {
    const start = item.eventStartAt ? new Date(item.eventStartAt) : null;
    const end = item.eventEndAt ? new Date(item.eventEndAt) : null;
    if (!start) return { primary: "—", secondary: null };

    const recLabel =
      item.eventRecurrenceType && item.eventRecurrenceType !== "none"
        ? ({ monthly: "ежемесячно", weekly: "еженедельно", yearly: "ежегодно", daily: "ежедневно" }[
            item.eventRecurrenceType
          ] ?? item.eventRecurrenceType)
        : null;

    if (item.eventAllDay) {
      const startStr = fmtDate(start);
      const endStr = end ? fmtDate(end) : null;
      const primary =
        endStr && endStr !== startStr ? `${startStr} — ${endStr}` : startStr;
      return { primary, secondary: recLabel };
    }

    // Timed event
    const primary = fmtDate(start);
    const timeStr = end ? `${fmtTime(start)} — ${fmtTime(end)}` : fmtTime(start);
    const secondary = recLabel ? `${timeStr} · ${recLabel}` : timeStr;
    return { primary, secondary };
  };

  // Sort events by nearest upcoming date (past events go to bottom)
  const sortedEvents = [...events].sort((a, b) => {
    const now = Date.now();
    const aMs = a.eventStartAt ? new Date(a.eventStartAt).getTime() : 0;
    const bMs = b.eventStartAt ? new Date(b.eventStartAt).getTime() : 0;
    // Future/ongoing first, ascending; past last, descending
    const aFuture = aMs >= now;
    const bFuture = bMs >= now;
    if (aFuture && !bFuture) return -1;
    if (!aFuture && bFuture) return 1;
    if (aFuture && bFuture) return aMs - bMs;
    return bMs - aMs; // both past: most recent first
  });

  // Check if event is upcoming
  const isUpcoming = (startAt: Date | null) => {
    if (!startAt) return false;
    return new Date(startAt) > new Date();
  };

  // Check if event is ongoing
  const isOngoing = (startAt: Date | null, endAt: Date | null) => {
    if (!startAt) return false;
    const now = new Date();
    const start = new Date(startAt);
    const end = endAt ? new Date(endAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return now >= start && now <= end;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Мероприятия"
        description="Управление событиями и мероприятиями сообщества"
      >
        <Link href="/admin/events/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Создать мероприятие
          </Button>
        </Link>
      </AdminPageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Поиск по названию..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="draft">Черновики</SelectItem>
            <SelectItem value="pending">На модерации</SelectItem>
            <SelectItem value="published">Опубликованные</SelectItem>
            <SelectItem value="rejected">Отклонённые</SelectItem>
            <SelectItem value="archived">В архиве</SelectItem>
          </SelectContent>
        </Select>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            Сбросить поиск
          </Button>
        )}
      </div>

      {/* Events List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : events.length > 0 ? (
        <div className="rounded-lg border">
          {/* Table Header */}
          <div className="bg-muted/50 text-muted-foreground flex items-center gap-4 border-b px-4 py-3 text-sm font-medium">
            <div className="w-36">Расписание</div>
            <div className="min-w-0 flex-1">Название</div>
            <div className="hidden w-32 sm:block">Место</div>
            <div className="hidden w-32 md:block">Автор</div>
            <div className="w-28">Статус</div>
            <div className="w-10"></div>
          </div>

          {/* Table Body */}
          {sortedEvents.map((item) => {
            const statusConfig = STATUS_CONFIG[item.status];
            const upcoming = item.eventStartAt && isUpcoming(item.eventStartAt);
            const ongoing = item.eventStartAt && isOngoing(item.eventStartAt, item.eventEndAt);
            const isPast = !upcoming && !ongoing && item.eventStartAt !== null;
            const schedule = formatSchedule(item);

            return (
              <div
                key={item.id}
                className={`hover:bg-muted/30 flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0 ${isPast ? "opacity-50" : ""}`}
              >
                {/* Schedule Column */}
                <div className="w-36 shrink-0">
                  <div className="text-sm">
                    <div className="font-medium">{schedule.primary}</div>
                    {schedule.secondary && (
                      <div className="text-muted-foreground text-xs">{schedule.secondary}</div>
                    )}
                  </div>
                </div>

                {/* Title Column */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <Link
                      href={`/admin/events/${item.id}`}
                      className="line-clamp-2 font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    {item.isUrgent && (
                      <Badge variant="destructive" className="shrink-0 px-1.5 py-0 text-xs">
                        !
                      </Badge>
                    )}
                  </div>
                  {item.eventLocation && (
                    <div className="text-muted-foreground mt-0.5 truncate text-xs sm:hidden">
                      <MapPin className="mr-1 inline h-3 w-3" />
                      {item.eventLocation}
                    </div>
                  )}
                </div>

                {/* Location Column */}
                <div className="hidden w-32 sm:block">
                  {item.eventLocation ? (
                    <span className="text-muted-foreground block truncate text-sm">
                      {item.eventLocation}
                    </span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </div>

                {/* Author Column */}
                <div className="hidden w-32 md:block">
                  <span className="text-muted-foreground block truncate text-sm">
                    {item.author?.name ?? "—"}
                  </span>
                </div>

                {/* Status Column */}
                <div className="w-28 shrink-0">
                  <div className="flex flex-col gap-1">
                    <Badge variant={statusConfig.variant} className="w-fit text-xs">
                      {statusConfig.label}
                    </Badge>
                    {ongoing && (
                      <Badge variant="default" className="w-fit bg-green-500 text-xs">
                        Сейчас
                      </Badge>
                    )}
                    {upcoming && !ongoing && (
                      <Badge
                        variant="outline"
                        className="w-fit border-purple-600 text-xs text-purple-600"
                      >
                        Скоро
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions Column */}
                <div className="w-10 shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={isPast}
                        onClick={() => {
                          if (!isPast) {
                            router.push(`/admin/events/${item.id}`);
                          }
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Редактировать
                        {isPast && (
                          <span className="text-muted-foreground ml-2 text-xs">(прошло)</span>
                        )}
                      </DropdownMenuItem>
                      {item.status === "published" && (
                        <DropdownMenuItem asChild>
                          <Link href={`/publications/${item.id}`} target="_blank">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Открыть на сайте
                          </Link>
                        </DropdownMenuItem>
                      )}
                      {item.status === "pending" && (
                        <>
                          <DropdownMenuItem
                            onClick={() =>
                              openModerateDialog({ id: item.id, title: item.title }, "approve")
                            }
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Одобрить
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() =>
                              openModerateDialog({ id: item.id, title: item.title }, "reject")
                            }
                          >
                            <X className="mr-2 h-4 w-4" />
                            Отклонить
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => openDeleteDialog({ id: item.id, title: item.title })}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="icon"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {page} из {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page === data.totalPages}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="text-muted-foreground/30 mx-auto h-12 w-12" />
            <h3 className="mt-4 text-lg font-medium">Мероприятий пока нет</h3>
            <p className="text-muted-foreground mt-2 text-sm">
              {searchQuery
                ? "Ничего не найдено по вашему запросу"
                : "Создайте первое мероприятие для сообщества"}
            </p>
            <Link href="/admin/events/new" className="mt-4 inline-block">
              <Button>
                <CalendarPlus className="mr-2 h-4 w-4" />
                Создать мероприятие
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить мероприятие?</DialogTitle>
            <DialogDescription>
              Вы уверены, что хотите удалить &quot;{eventToDelete?.title}&quot;? Это действие нельзя
              отменить.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Moderate Dialog */}
      <Dialog open={moderateDialogOpen} onOpenChange={setModerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {eventToModerate?.action === "approve"
                ? "Одобрить мероприятие?"
                : "Отклонить мероприятие?"}
            </DialogTitle>
            <DialogDescription>
              {eventToModerate?.action === "approve"
                ? `Мероприятие "${eventToModerate?.title}" будет опубликовано и станет доступно всем пользователям.`
                : `Мероприятие "${eventToModerate?.title}" будет отклонено. Автор сможет отредактировать и отправить его снова.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModerateDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              variant={eventToModerate?.action === "approve" ? "default" : "destructive"}
              onClick={confirmModerate}
              disabled={moderateMutation.isPending}
            >
              {moderateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {eventToModerate?.action === "approve" ? "Одобрить" : "Отклонить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
