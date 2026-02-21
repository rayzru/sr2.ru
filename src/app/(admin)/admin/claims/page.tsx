"use client";

import { useState } from "react";

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Home,
  Loader2,
  MoreHorizontal,
  ParkingCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AdminPageHeader } from "~/components/admin/admin-page-header";
import { DocumentViewerDialog } from "~/components/admin/document-viewer-dialog";
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
import { Card, CardContent } from "~/components/ui/card";
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
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
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
import { api } from "~/trpc/react";

// ============================================================================
// Constants
// ============================================================================

const STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  review: "На рассмотрении",
  approved: "Одобрена",
  rejected: "Отклонена",
  documents_requested: "Запрошены документы",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  review: "outline",
  approved: "default",
  rejected: "destructive",
  documents_requested: "outline",
};

const ROLE_LABELS: Record<string, string> = {
  ApartmentOwner: "Собственник квартиры",
  ApartmentResident: "Житель квартиры",
  ParkingOwner: "Собственник парковки",
  ParkingResident: "Арендатор парковки",
  StoreOwner: "Владелец магазина",
  StoreRepresenative: "Представитель магазина",
};

const APPROVAL_TEMPLATES = [
  { value: "approved_all_correct", label: "Все хорошо, все данные верны" },
  { value: "approved_custom", label: "Свой текст" },
];

const REJECTION_TEMPLATES = [
  { value: "rejected_no_documents", label: "Подтверждающие документы не получены" },
  { value: "rejected_invalid_documents", label: "Подтверждающие документы не верны" },
  { value: "rejected_no_reason", label: "Отказ без объявления причины" },
  { value: "rejected_custom", label: "Свой текст" },
];

// ============================================================================
// Review Dialog Component
// ============================================================================

type ReviewDialogProps = {
  claim: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  onViewDocument: (doc: any) => void;
};

function ReviewDialog({ claim, open, onOpenChange, onSuccess, onViewDocument }: ReviewDialogProps) {
  const { toast } = useToast();
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [template, setTemplate] = useState<string>("");
  const [customText, setCustomText] = useState("");

  const reviewMutation = api.claims.admin.review.useMutation({
    onSuccess: () => {
      toast({
        title: action === "approve" ? "Заявка одобрена" : "Заявка отклонена",
        description: "Решение сохранено",
      });
      onOpenChange(false);
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!template) {
      toast({
        title: "Выберите причину",
        variant: "destructive",
      });
      return;
    }

    if (template.endsWith("_custom") && !customText.trim()) {
      toast({
        title: "Введите текст решения",
        variant: "destructive",
      });
      return;
    }

    reviewMutation.mutate({
      claimId: claim.id,
      status: action === "approve" ? "approved" : "rejected",
      resolutionTemplate: template as any,
      customText: template.endsWith("_custom") ? customText : undefined,
    });
  };

  const templates = action === "approve" ? APPROVAL_TEMPLATES : REJECTION_TEMPLATES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Рассмотрение заявки</DialogTitle>
          <DialogDescription>Выберите решение и укажите причину</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Documents Section */}
          {claim.documents && claim.documents.length > 0 && (
            <div className="space-y-2">
              <Label>Приложенные документы ({claim.documents.length})</Label>
              <div className="flex flex-wrap gap-2">
                {claim.documents.map((doc: any) => (
                  <button
                    key={doc.id}
                    onClick={() => onViewDocument(doc)}
                    className="bg-muted/30 hover:bg-muted group flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-red-500" />
                    <span className="max-w-32 truncate">{doc.fileName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Action Selection */}
          <div className="space-y-3">
            <Label>Решение</Label>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={action === "approve" ? "default" : "outline"}
                className="flex-1"
                onClick={() => {
                  setAction("approve");
                  setTemplate("");
                }}
              >
                <Check className="mr-2 h-4 w-4" />
                Одобрить
              </Button>
              <Button
                type="button"
                variant={action === "reject" ? "destructive" : "outline"}
                className="flex-1"
                onClick={() => {
                  setAction("reject");
                  setTemplate("");
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Отклонить
              </Button>
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-3">
            <Label>Причина</Label>
            <RadioGroup value={template} onValueChange={setTemplate}>
              {templates.map((t) => (
                <div key={t.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={t.value} id={t.value} />
                  <Label htmlFor={t.value} className="cursor-pointer font-normal">
                    {t.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Custom Text */}
          {template.endsWith("_custom") && (
            <div className="space-y-2">
              <Label>Текст решения</Label>
              <Textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Введите текст решения..."
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              reviewMutation.isPending ||
              !template ||
              (template.endsWith("_custom") && !customText.trim())
            }
            variant={action === "reject" ? "destructive" : "default"}
          >
            {reviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action === "approve" ? "Одобрить" : "Отклонить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Page Component
// ============================================================================

export default function AdminClaimsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const isMobile = useMobile();

  // URL params
  const pageParam = searchParams.get("page");
  const page = pageParam ? parseInt(pageParam, 10) : 1;
  const statusFilter = searchParams.get("status") ?? "all";
  const typeFilter = searchParams.get("type") ?? "all";
  const searchQuery = searchParams.get("q") ?? "";

  // Local state
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [viewerDocument, setViewerDocument] = useState<any>(null);
  const [viewerDialogOpen, setViewerDialogOpen] = useState(false);

  // Bulk selection state
  const [selectedClaimIds, setSelectedClaimIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");

  const toggleClaim = (claimId: string) => {
    const newSet = new Set(selectedClaimIds);
    if (newSet.has(claimId)) {
      newSet.delete(claimId);
    } else {
      newSet.add(claimId);
    }
    setSelectedClaimIds(newSet);
  };

  const toggleAll = () => {
    if (data?.claims) {
      if (selectedClaimIds.size === data.claims.length) {
        setSelectedClaimIds(new Set());
      } else {
        setSelectedClaimIds(new Set(data.claims.map((c) => c.id)));
      }
    }
  };

  const utils = api.useUtils();

  const bulkDeleteMutation = api.claims.admin.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Заявки удалены",
        description: `Удалено заявок: ${result.deleted}`,
      });
      setSelectedClaimIds(new Set());
      setShowBulkDeleteDialog(false);
      setBulkDeleteReason("");
      void utils.claims.admin.list.invalidate();
      void utils.claims.admin.stats.invalidate();
    },
    onError: (error) => {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleBulkDelete = () => {
    bulkDeleteMutation.mutate({
      claimIds: Array.from(selectedClaimIds),
      reason: bulkDeleteReason || undefined,
    });
  };

  // Queries
  const { data, isLoading, refetch } = api.claims.admin.list.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? (statusFilter as any) : undefined,
    type: typeFilter !== "all" ? (typeFilter as any) : undefined,
  });

  // URL helpers
  const setPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newPage === 1) {
      params.delete("page");
    } else {
      params.set("page", newPage.toString());
    }
    router.push(`/admin/claims?${params.toString()}`);
  };

  const setStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.delete("page");
    router.push(`/admin/claims?${params.toString()}`);
  };

  const setTypeFilter = (type: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "all") {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    params.delete("page");
    router.push(`/admin/claims?${params.toString()}`);
  };

  const handleSearch = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (localSearch) {
      params.set("q", localSearch);
    } else {
      params.delete("q");
    }
    params.delete("page");
    router.push(`/admin/claims?${params.toString()}`);
  };

  const clearSearch = () => {
    setLocalSearch("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    router.push(`/admin/claims?${params.toString()}`);
  };

  const openReviewDialog = (claim: any) => {
    setSelectedClaim(claim);
    setReviewDialogOpen(true);
  };

  const openDocumentViewer = (doc: any) => {
    setViewerDocument(doc);
    setViewerDialogOpen(true);
  };

  const getPropertyInfo = (claim: any) => {
    if (claim.apartment) {
      return {
        icon: Home,
        title: `Квартира ${claim.apartment.number}`,
        subtitle:
          claim.apartment.floor?.entrance?.building?.title ??
          `Строение ${claim.apartment.floor?.entrance?.building?.number}`,
      };
    }
    if (claim.parkingSpot) {
      return {
        icon: ParkingCircle,
        title: `Место ${claim.parkingSpot.number}`,
        subtitle: claim.parkingSpot.floor?.parking?.name,
      };
    }
    return {
      icon: FileText,
      title: "Неизвестный объект",
      subtitle: "",
    };
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Заявки на недвижимость"
        description="Рассмотрение заявок пользователей"
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Поиск по имени пользователя..."
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Все статусы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            <SelectItem value="pending">Ожидают</SelectItem>
            <SelectItem value="review">На рассмотрении</SelectItem>
            <SelectItem value="approved">Одобрены</SelectItem>
            <SelectItem value="rejected">Отклонены</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Все типы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все типы</SelectItem>
            <SelectItem value="apartment">Квартиры</SelectItem>
            <SelectItem value="parking">Парковки</SelectItem>
          </SelectContent>
        </Select>
        {searchQuery && (
          <Button variant="ghost" size="sm" onClick={clearSearch}>
            Сбросить поиск
          </Button>
        )}
      </div>

      {/* Bulk Action Toolbar */}
      {selectedClaimIds.size > 0 && (
        <div className="bg-muted mb-4 flex items-center gap-3 rounded-md border p-3">
          <span className="text-sm font-medium">Выбрано заявок: {selectedClaimIds.size}</span>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Удалить выбранные
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedClaimIds(new Set())}>
            Отменить выбор
          </Button>
        </div>
      )}

      {/* Claims List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : data?.claims && data.claims.length > 0 ? (
        isMobile ? (
          /* Mobile: Card View */
          <div className="space-y-3">
            {data.claims.map((claim) => {
              const propertyInfo = getPropertyInfo(claim);
              const PropertyIcon = propertyInfo.icon;

              return (
                <Card key={claim.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedClaimIds.has(claim.id)}
                        onCheckedChange={() => toggleClaim(claim.id)}
                        aria-label={`Выбрать заявку ${claim.user?.name ?? claim.user?.email}`}
                        className="mt-1"
                      />
                      <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={claim.user?.image ?? undefined} />
                              <AvatarFallback>
                                {claim.user?.name?.slice(0, 2).toUpperCase() ?? "??"}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">
                              {claim.user?.name ?? claim.user?.email}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant={STATUS_VARIANTS[claim.status] ?? "outline"}
                              className="text-xs"
                            >
                              {STATUS_LABELS[claim.status]}
                            </Badge>
                            {claim.documents && claim.documents.length > 0 && (
                              <Badge variant="outline" className="gap-1 text-xs">
                                <FileText className="h-3 w-3" />
                                {claim.documents.length}
                              </Badge>
                            )}
                          </div>
                          <div className="text-muted-foreground mt-2 flex items-center gap-2 text-xs">
                            <PropertyIcon className="h-3.5 w-3.5" />
                            <span>{propertyInfo.title}</span>
                            <span>·</span>
                            <span>{new Date(claim.createdAt).toLocaleDateString("ru-RU")}</span>
                          </div>
                        </div>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openReviewDialog(claim)}>
                              <Eye className="mr-2 h-4 w-4" />
                              Рассмотреть
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Mobile Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 py-4">
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
          /* Desktop: Table View */
          <>
            <div className="rounded-lg border">
              {/* Table Header */}
              <div className="bg-muted/50 text-muted-foreground flex items-center gap-4 border-b px-4 py-3 text-sm font-medium">
                <div className="w-12">
                  <Checkbox
                    checked={
                      data?.claims &&
                      data.claims.length > 0 &&
                      selectedClaimIds.size === data.claims.length
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </div>
                <div className="w-24">Дата</div>
                <div className="min-w-0 flex-1">Заголовок</div>
                <div className="hidden w-32 sm:block">Тип</div>
                <div className="hidden w-40 md:block">Автор</div>
                <div className="w-28">Статус</div>
                <div className="w-10"></div>
              </div>

              {/* Table Body */}
              {data.claims.map((claim) => {
                const propertyInfo = getPropertyInfo(claim);
                const PropertyIcon = propertyInfo.icon;

                return (
                  <div
                    key={claim.id}
                    className="hover:bg-muted/30 flex items-center gap-4 border-b px-4 py-3 transition-colors last:border-b-0"
                  >
                    {/* Checkbox Column */}
                    <div className="w-12 shrink-0">
                      <Checkbox
                        checked={selectedClaimIds.has(claim.id)}
                        onCheckedChange={() => toggleClaim(claim.id)}
                        aria-label={`Выбрать заявку ${claim.user?.name ?? claim.user?.email}`}
                      />
                    </div>

                    {/* Date Column */}
                    <div className="w-24 shrink-0">
                      <div className="text-sm font-medium">
                        {new Date(claim.createdAt).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {new Date(claim.createdAt).toLocaleDateString("ru-RU", {
                          year: "numeric",
                        })}
                      </div>
                    </div>

                    {/* Title Column */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <PropertyIcon className="text-muted-foreground h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{propertyInfo.title}</div>
                          <div className="text-muted-foreground truncate text-xs">
                            {ROLE_LABELS[claim.claimedRole]}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Type Column */}
                    <div className="hidden w-32 sm:block">
                      <Badge variant="outline" className="text-xs">
                        {claim.claimType === "apartment" ? "Квартира" : "Парковка"}
                      </Badge>
                      {claim.documents && claim.documents.length > 0 && (
                        <div className="mt-1 flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          <span className="text-muted-foreground text-xs">
                            {claim.documents.length}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Author Column */}
                    <div className="hidden w-40 md:block">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={claim.user?.image ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {claim.user?.name?.slice(0, 2).toUpperCase() ?? "??"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground block truncate text-sm">
                          {claim.user?.name ?? claim.user?.email}
                        </span>
                      </div>
                    </div>

                    {/* Status Column */}
                    <div className="w-28 shrink-0">
                      <Badge
                        variant={STATUS_VARIANTS[claim.status] ?? "outline"}
                        className="text-xs"
                      >
                        {STATUS_LABELS[claim.status]}
                      </Badge>
                    </div>

                    {/* Actions Column */}
                    <div className="w-10 shrink-0">
                      <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openReviewDialog(claim)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Рассмотреть
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-sm">
                  Показано {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} из {data.total}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ChevronLeft className="mr-2 h-4 w-4" />
                    Назад
                  </Button>
                  <span className="text-sm">
                    Страница {page} из {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === data.totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Вперед
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <div className="text-muted-foreground py-12 text-center text-sm">
          {searchQuery || statusFilter !== "all" || typeFilter !== "all"
            ? "Заявки не найдены"
            : "Пока нет заявок"}
        </div>
      )}

      {/* Review Dialog */}
      {selectedClaim && (
        <ReviewDialog
          claim={selectedClaim}
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          onSuccess={() => {
            refetch();
            setSelectedClaim(null);
          }}
          onViewDocument={openDocumentViewer}
        />
      )}

      {/* Document Viewer Dialog */}
      <DocumentViewerDialog
        document={viewerDocument}
        open={viewerDialogOpen}
        onOpenChange={setViewerDialogOpen}
      />

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              Удаление {selectedClaimIds.size} заявок
            </AlertDialogTitle>
            <AlertDialogDescription>
              Это действие удалит {selectedClaimIds.size} заявок без возможности восстановления. Все
              данные и документы будут удалены немедленно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Причина удаления (опционально)</Label>
            <Textarea
              value={bulkDeleteReason}
              onChange={(e) => setBulkDeleteReason(e.target.value)}
              placeholder="Спам, некорректные заявки..."
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? "Удаление..." : "Удалить"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
