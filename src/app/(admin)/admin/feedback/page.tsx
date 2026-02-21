"use client";

import { useState } from "react";

import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  HelpCircle,
  Lightbulb,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminPageHeader } from "~/components/admin/admin-page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
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
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Textarea } from "~/components/ui/textarea";
import { useMobile } from "~/hooks/use-mobile";
import { useToast } from "~/hooks/use-toast";
import type { FeedbackPriority, FeedbackStatus, FeedbackType } from "~/server/db/schema";
import { api } from "~/trpc/react";

// ============================================================================
// Labels
// ============================================================================

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "Новое",
  in_progress: "В работе",
  forwarded: "Перенаправлено",
  resolved: "Решено",
  closed: "Закрыто",
};

const STATUS_COLORS: Record<FeedbackStatus, "default" | "secondary" | "outline" | "destructive"> = {
  new: "secondary",
  in_progress: "default",
  forwarded: "outline",
  resolved: "outline",
  closed: "destructive",
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  complaint: "Жалоба",
  suggestion: "Пожелание",
  request: "Заявка",
  question: "Вопрос",
  other: "Другое",
};

const TYPE_ICONS: Record<FeedbackType, typeof AlertTriangle> = {
  complaint: AlertTriangle,
  suggestion: Lightbulb,
  request: FileText,
  question: HelpCircle,
  other: MessageSquare,
};

const TYPE_COLORS: Record<FeedbackType, string> = {
  complaint: "text-red-500",
  suggestion: "text-yellow-500",
  request: "text-blue-500",
  question: "text-purple-500",
  other: "text-gray-500",
};

const PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  urgent: "Срочный",
};

// ============================================================================
// View Dialog
// ============================================================================

type ViewDialogProps = {
  feedbackId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

function ViewDialog({ feedbackId, open, onOpenChange, onSuccess }: ViewDialogProps) {
  const { toast } = useToast();
  const utils = api.useUtils();

  const [newStatus, setNewStatus] = useState<FeedbackStatus | "">("");
  const [newPriority, setNewPriority] = useState<FeedbackPriority | "">("");
  const [response, setResponse] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [forwardedTo, setForwardedTo] = useState("");

  const { data: feedback, isLoading } = api.feedback.admin.byId.useQuery(
    { id: feedbackId! },
    { enabled: open && !!feedbackId }
  );

  const updateMutation = api.feedback.admin.update.useMutation({
    onSuccess: () => {
      toast({ title: "Обращение обновлено" });
      utils.feedback.admin.list.invalidate();
      utils.feedback.admin.byId.invalidate({ id: feedbackId! });
      utils.admin.dashboardStats.invalidate();
      utils.admin.navCounts.invalidate();
      onSuccess();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const respondMutation = api.feedback.admin.respond.useMutation({
    onSuccess: () => {
      toast({ title: "Ответ отправлен" });
      utils.feedback.admin.list.invalidate();
      utils.feedback.admin.byId.invalidate({ id: feedbackId! });
      utils.admin.dashboardStats.invalidate();
      utils.admin.navCounts.invalidate();
      setResponse("");
      onSuccess();
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const handleUpdate = () => {
    if (!feedbackId) return;

    const updates: Record<string, unknown> = { id: feedbackId };
    if (newStatus) updates.status = newStatus;
    if (newPriority) updates.priority = newPriority;
    if (internalNote) updates.internalNote = internalNote;
    if (forwardedTo) {
      updates.forwardedTo = forwardedTo;
      updates.status = "forwarded";
    }

    if (Object.keys(updates).length > 1) {
      updateMutation.mutate(updates as any);
    }
  };

  const handleRespond = () => {
    if (!feedbackId || !response.trim()) return;
    respondMutation.mutate({ id: feedbackId, response: response.trim() });
  };

  // Reset state when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setNewStatus("");
      setNewPriority("");
      setResponse("");
      setInternalNote("");
      setForwardedTo("");
    }
    onOpenChange(isOpen);
  };

  if (!feedbackId) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Просмотр обращения
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : feedback ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const TypeIcon = TYPE_ICONS[feedback.type];
                  return (
                    <div className={`bg-muted rounded-full p-2 ${TYPE_COLORS[feedback.type]}`}>
                      <TypeIcon className="h-5 w-5" />
                    </div>
                  );
                })()}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{TYPE_LABELS[feedback.type]}</span>
                    <Badge variant={STATUS_COLORS[feedback.status]}>
                      {STATUS_LABELS[feedback.status]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {new Date(feedback.createdAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Content */}
            <div className="space-y-4">
              {feedback.title && (
                <div>
                  <Label className="text-muted-foreground">Тема</Label>
                  <p className="font-medium">{feedback.title}</p>
                </div>
              )}

              <div>
                <Label className="text-muted-foreground">Текст обращения</Label>
                <p className="bg-muted mt-1 whitespace-pre-wrap rounded-lg p-3">
                  {feedback.content}
                </p>
              </div>

              {/* Photos */}
              {feedback.photos && feedback.photos.length > 0 && (
                <div>
                  <Label className="text-muted-foreground">Фотографии</Label>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {feedback.photos.map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square overflow-hidden rounded-lg border"
                      >
                        <Image
                          src={photo}
                          alt={`Фото ${idx + 1}`}
                          fill
                          className="object-cover"
                          unoptimized={photo.includes("/uploads/")}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Info */}
              <div className="grid grid-cols-3 gap-4">
                {feedback.contactName && (
                  <div>
                    <Label className="text-muted-foreground">Имя</Label>
                    <p className="font-medium">{feedback.contactName}</p>
                  </div>
                )}
                {feedback.contactEmail && (
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{feedback.contactEmail}</p>
                  </div>
                )}
                {feedback.contactPhone && (
                  <div>
                    <Label className="text-muted-foreground">Телефон</Label>
                    <p className="font-medium">{feedback.contactPhone}</p>
                  </div>
                )}
              </div>

              {/* Previous response */}
              {feedback.response && (
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-950">
                  <Label className="text-green-700 dark:text-green-300">Ответ</Label>
                  <p className="mt-1 whitespace-pre-wrap">{feedback.response}</p>
                  <p className="text-muted-foreground mt-2 text-xs">
                    {feedback.respondedBy?.name} ·{" "}
                    {feedback.respondedAt && new Date(feedback.respondedAt).toLocaleString("ru-RU")}
                  </p>
                </div>
              )}

              {/* Forwarded info */}
              {feedback.forwardedTo && (
                <div className="flex items-center gap-2 text-purple-600">
                  <ArrowRight className="h-4 w-4" />
                  <span>Перенаправлено: {feedback.forwardedTo}</span>
                </div>
              )}

              {/* Internal note */}
              {feedback.internalNote && (
                <div className="rounded-lg bg-yellow-50 p-4 dark:bg-yellow-950">
                  <Label className="text-yellow-700 dark:text-yellow-300">Внутренняя заметка</Label>
                  <p className="mt-1 whitespace-pre-wrap">{feedback.internalNote}</p>
                </div>
              )}
            </div>

            <Separator />

            {/* Actions */}
            {feedback.status !== "resolved" && feedback.status !== "closed" && (
              <div className="space-y-4">
                <h4 className="font-medium">Действия</h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Изменить статус</Label>
                    <Select
                      value={newStatus}
                      onValueChange={(v) => setNewStatus(v as FeedbackStatus)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите статус" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="in_progress">В работе</SelectItem>
                        <SelectItem value="forwarded">Перенаправлено</SelectItem>
                        <SelectItem value="closed">Закрыто</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Изменить приоритет</Label>
                    <Select
                      value={newPriority}
                      onValueChange={(v) => setNewPriority(v as FeedbackPriority)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Выберите приоритет" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Низкий</SelectItem>
                        <SelectItem value="normal">Обычный</SelectItem>
                        <SelectItem value="high">Высокий</SelectItem>
                        <SelectItem value="urgent">Срочный</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Перенаправить</Label>
                  <Input
                    value={forwardedTo}
                    onChange={(e) => setForwardedTo(e.target.value)}
                    placeholder="Куда перенаправить (УК, МСК и т.д.)"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Внутренняя заметка</Label>
                  <Textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    placeholder="Заметка видна только администраторам"
                    rows={2}
                  />
                </div>

                <Button
                  onClick={handleUpdate}
                  disabled={
                    updateMutation.isPending ||
                    (!newStatus && !newPriority && !internalNote && !forwardedTo)
                  }
                >
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Сохранить изменения
                </Button>

                <Separator />

                <div className="space-y-2">
                  <Label>Ответить заявителю</Label>
                  <Textarea
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    placeholder="Текст ответа..."
                    rows={4}
                  />
                  <p className="text-muted-foreground text-xs">
                    Ответ будет отправлен на email заявителя (если указан)
                  </p>
                </div>

                <Button
                  onClick={handleRespond}
                  disabled={respondMutation.isPending || !response.trim()}
                  className="w-full"
                >
                  {respondMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Send className="mr-2 h-4 w-4" />
                  Отправить ответ и закрыть
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center">Обращение не найдено</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function AdminFeedbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useMobile();
  const { toast } = useToast();

  const statusFilter = (searchParams.get("status") ?? "all") as FeedbackStatus | "all";
  const typeFilter = (searchParams.get("type") ?? "all") as FeedbackType | "all";
  const priorityFilter = (searchParams.get("priority") ?? "all") as FeedbackPriority | "all";
  const pageParam = searchParams.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState("");
  const [selectedFeedbackIds, setSelectedFeedbackIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data, isLoading, refetch } = api.feedback.admin.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
  });

  const utils = api.useUtils();

  const toggleFeedback = (feedbackId: string) => {
    const newSet = new Set(selectedFeedbackIds);
    if (newSet.has(feedbackId)) {
      newSet.delete(feedbackId);
    } else {
      newSet.add(feedbackId);
    }
    setSelectedFeedbackIds(newSet);
  };

  const toggleAll = () => {
    if (data?.items) {
      if (selectedFeedbackIds.size === data.items.length) {
        setSelectedFeedbackIds(new Set());
      } else {
        setSelectedFeedbackIds(new Set(data.items.map((item) => item.id)));
      }
    }
  };

  const deleteMutation = api.feedback.admin.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "Обращение удалено",
      });
      setDeleteId(null);
      setShowDeleteDialog(false);
      void utils.feedback.admin.list.invalidate();
      void utils.admin.dashboardStats.invalidate();
      void utils.admin.navCounts.invalidate();
      void refetch();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = api.feedback.admin.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Обращения удалены",
        description: `${result.message} (удалено: ${result.actual} из ${result.requested})`,
      });
      setSelectedFeedbackIds(new Set());
      setShowBulkDeleteDialog(false);
      void utils.feedback.admin.list.invalidate();
      void utils.admin.dashboardStats.invalidate();
      void utils.admin.navCounts.invalidate();
      void refetch();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate({
      ids: Array.from(selectedFeedbackIds),
    });
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    setShowDeleteDialog(true);
  };

  const updateParams = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`/admin/feedback?${params.toString()}`);
  };

  const setPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", newPage.toString());
    }
    router.push(`/admin/feedback?${params.toString()}`);
  };

  const openViewDialog = (id: string) => {
    setSelectedId(id);
    setViewDialogOpen(true);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Обратная связь" description="Обращения пользователей" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Input
          placeholder="Поиск по имени или тексту..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="w-full sm:w-64"
        />

        <Select value={statusFilter} onValueChange={(v) => updateParams("status", v)}>
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="new">Новые</SelectItem>
            <SelectItem value="in_progress">В работе</SelectItem>
            <SelectItem value="forwarded">Перенаправлено</SelectItem>
            <SelectItem value="resolved">Решено</SelectItem>
            <SelectItem value="closed">Закрыто</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={(v) => updateParams("type", v)}>
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Все типы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="complaint">Жалобы</SelectItem>
            <SelectItem value="suggestion">Пожелания</SelectItem>
            <SelectItem value="request">Заявки</SelectItem>
            <SelectItem value="question">Вопросы</SelectItem>
            <SelectItem value="other">Другое</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={(v) => updateParams("priority", v)}>
          <SelectTrigger className="w-45">
            <SelectValue placeholder="Все приоритеты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все приоритеты</SelectItem>
            <SelectItem value="urgent">Срочный</SelectItem>
            <SelectItem value="high">Высокий</SelectItem>
            <SelectItem value="normal">Обычный</SelectItem>
            <SelectItem value="low">Низкий</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedFeedbackIds.size > 0 && (
        <div className="bg-muted flex items-center gap-2 rounded-md border p-3">
          <span className="text-sm font-medium">Выбрано: {selectedFeedbackIds.size}</span>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить выбранные
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedFeedbackIds(new Set())}>
            Отменить выбор
          </Button>
        </div>
      )}

      {/* Feedback Table/Cards */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : data?.items && data.items.length > 0 ? (
        <>
          {/* Desktop Table View */}
          <div className="hidden rounded-lg border md:block">
            <div className="bg-muted/50 text-muted-foreground flex items-center gap-4 border-b px-4 py-3 text-sm font-medium">
              <div className="w-12">
                <Checkbox
                  checked={selectedFeedbackIds.size === data.items.length && data.items.length > 0}
                  onCheckedChange={toggleAll}
                  aria-label="Выбрать все"
                />
              </div>
              <div className="w-24">Дата</div>
              <div className="w-32">Тип</div>
              <div className="min-w-0 flex-1">Содержание</div>
              <div className="hidden w-40 lg:block">Контакт</div>
              <div className="w-28">Статус</div>
              <div className="w-10"></div>
            </div>

            {data.items.map((item) => {
              const TypeIcon = TYPE_ICONS[item.type];

              return (
                <div
                  key={item.id}
                  className="hover:bg-muted/30 flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
                >
                  {/* Checkbox */}
                  <div className="w-12">
                    <Checkbox
                      checked={selectedFeedbackIds.has(item.id)}
                      onCheckedChange={() => toggleFeedback(item.id)}
                      aria-label={`Выбрать ${item.title ?? "обращение"}`}
                    />
                  </div>

                  {/* Date */}
                  <div className="text-muted-foreground w-24 text-sm">
                    {formatDate(item.createdAt)}
                  </div>

                  {/* Type */}
                  <div className="flex w-32 items-center gap-2">
                    <TypeIcon className={`h-4 w-4 ${TYPE_COLORS[item.type]}`} />
                    <span className="text-sm">{TYPE_LABELS[item.type]}</span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {item.title && <div className="truncate font-medium">{item.title}</div>}
                    <p className="text-muted-foreground line-clamp-1 text-sm">{item.content}</p>
                  </div>

                  {/* Contact */}
                  <div className="hidden w-40 lg:block">
                    {item.contactName ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {item.contactName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground truncate text-sm">
                          {item.contactName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>

                  {/* Status */}
                  <div className="w-28">
                    <Badge variant={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                  </div>

                  {/* Actions */}
                  <div className="w-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openViewDialog(item.id)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Открыть
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => openDeleteDialog(item.id)}
                          className="text-destructive"
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
          </div>

          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {data.items.map((item) => {
              const TypeIcon = TYPE_ICONS[item.type];

              return (
                <div
                  key={item.id}
                  className="bg-card cursor-pointer rounded-lg border p-4"
                  onClick={() => openViewDialog(item.id)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className={`bg-muted rounded-full p-2 ${TYPE_COLORS[item.type]}`}>
                        <TypeIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{TYPE_LABELS[item.type]}</div>
                        {item.title && (
                          <div className="text-muted-foreground truncate text-xs">{item.title}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge variant={STATUS_COLORS[item.status]}>{STATUS_LABELS[item.status]}</Badge>
                  </div>

                  <p className="text-muted-foreground mb-2 line-clamp-2 text-sm">{item.content}</p>

                  <div className="text-muted-foreground flex items-center gap-2 text-xs">
                    {item.contactName && (
                      <div className="flex items-center gap-1">
                        <Avatar className="h-4 w-4">
                          <AvatarFallback className="text-[8px]">
                            {item.contactName.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span>{item.contactName}</span>
                      </div>
                    )}
                    <span>·</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
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
        </>
      ) : (
        <div className="text-muted-foreground rounded-lg border py-12 text-center">
          Обращений не найдено
        </div>
      )}

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление {selectedFeedbackIds.size} обращений</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие пометит {selectedFeedbackIds.size} обращений как удалённые. Обращения
              будут скрыты из общего списка, но сохранятся в системе для аудита.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Single Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удаление обращения</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие пометит обращение как удалённое. Оно будет скрыто из общего списка, но
              сохранится в системе для аудита.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Удаление...
                </>
              ) : (
                "Удалить"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Dialog */}
      <ViewDialog
        feedbackId={selectedId}
        open={viewDialogOpen}
        onOpenChange={setViewDialogOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
