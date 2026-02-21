"use client";

import { useState } from "react";

import {
  AlertTriangle,
  Ban,
  Building2,
  KeyRound,
  MoreHorizontal,
  Search,
  Trash2,
  UserCog,
} from "lucide-react";
import Link from "next/link";

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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Separator } from "~/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Textarea } from "~/components/ui/textarea";
import { useMobile } from "~/hooks/use-mobile";
import { useToast } from "~/hooks/use-toast";
import { getRankConfig } from "~/lib/ranks";
import { cn } from "~/lib/utils";
import { type UserRole } from "~/server/auth/rbac";
import { api } from "~/trpc/react";

import { BlockUserDialog } from "./block-user-dialog";
import { DeleteUserDialog } from "./delete-user-dialog";
import { EditTaglineDialog } from "./edit-tagline-dialog";
import { HardDeleteUserDialog } from "./hard-delete-user-dialog";
import { UnblockUserDialog } from "./unblock-user-dialog";

interface User {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  roles: UserRole[];
  createdAt: Date | null;
  tagline: string | null;
}

interface UsersTableProps {
  canManageRoles: boolean;
  canDeleteUsers: boolean;
  canHardDeleteUsers: boolean;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear().toString().slice(-2);
  return `${day}.${month}.${year}`;
}

// Row component to handle block status loading per user
function UserRow({
  user,
  canManageRoles,
  canDeleteUsers,
  canHardDeleteUsers,
  selectedUserIds,
  toggleUser,
}: {
  user: User;
  canManageRoles: boolean;
  canDeleteUsers: boolean;
  canHardDeleteUsers: boolean;
  selectedUserIds: Set<string>;
  toggleUser: (userId: string) => void;
}) {
  const { data: blockStatus } = api.admin.users.getActiveBlock.useQuery(
    { userId: user.id },
    { staleTime: 30000 }
  );

  const isBlocked = !!blockStatus;
  const rankConfig = getRankConfig(user.roles.length > 0 ? user.roles : ["Guest"]);

  return (
    <TableRow key={user.id} className={cn(isBlocked && "bg-destructive/5")}>
      <TableCell>
        <Checkbox
          checked={selectedUserIds.has(user.id)}
          onCheckedChange={() => toggleUser(user.id)}
          aria-label={`Выбрать ${user.name}`}
        />
      </TableCell>
      <TableCell>
        <div className="relative">
          <Avatar
            className={cn(
              "ring-offset-background h-6 w-6 ring-2 ring-offset-1",
              isBlocked ? "ring-destructive/50" : rankConfig.ringColor
            )}
          >
            <AvatarImage src={user.image ?? undefined} />
            <AvatarFallback
              className={cn(
                "text-[10px]",
                isBlocked ? "bg-destructive/20 text-destructive" : rankConfig.badgeColor,
                !isBlocked && "text-white"
              )}
            >
              {user.name?.slice(0, 2).toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          {isBlocked && (
            <div className="bg-destructive absolute -bottom-0.5 -right-0.5 rounded-full p-0.5">
              <Ban className="h-2 w-2 text-white" />
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div>
          <div className="flex items-center gap-2">
            <p className={cn("font-medium", isBlocked && "text-destructive")}>
              {user.name ?? "Без имени"}
            </p>
            {isBlocked && (
              <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                Заблокирован
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">{user.email}</p>
        </div>
      </TableCell>
      <TableCell>
        {user.roles.length > 0 ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              rankConfig.badgeColor + "/15",
              rankConfig.textColor
            )}
          >
            {rankConfig.shortLabel}
            {user.roles.length > 1 && (
              <span className="text-muted-foreground ml-1">(+{user.roles.length - 1})</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">—</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{formatDate(user.createdAt)}</TableCell>
      <TableCell>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canManageRoles && (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/users/${user.id}/roles`}>
                    <UserCog className="h-4 w-4" />
                    Управление ролями
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/admin/users/${user.id}/properties`}>
                    <Building2 className="h-4 w-4" />
                    Собственность
                  </Link>
                </DropdownMenuItem>
                <EditTaglineDialog userId={user.id} userName={user.name} asMenuItem />
                <DropdownMenuItem>
                  <KeyRound className="h-4 w-4" />
                  Сбросить пароль
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {isBlocked ? (
                  <UnblockUserDialog userId={user.id} userName={user.name} asMenuItem />
                ) : (
                  <BlockUserDialog userId={user.id} userName={user.name} asMenuItem />
                )}
              </>
            )}
            {canDeleteUsers && (
              <>
                {canManageRoles && <DropdownMenuSeparator />}
                <DeleteUserDialog userId={user.id} userName={user.name} asMenuItem />
                {canHardDeleteUsers && (
                  <HardDeleteUserDialog userId={user.id} userName={user.name} asMenuItem />
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// Card component for mobile view
function UserCard({
  user,
  canManageRoles,
  canDeleteUsers,
  canHardDeleteUsers,
  selectedUserIds,
  toggleUser,
}: {
  user: User;
  canManageRoles: boolean;
  canDeleteUsers: boolean;
  canHardDeleteUsers: boolean;
  selectedUserIds: Set<string>;
  toggleUser: (userId: string) => void;
}) {
  const { data: blockStatus } = api.admin.users.getActiveBlock.useQuery(
    { userId: user.id },
    { staleTime: 30000 }
  );

  const isBlocked = !!blockStatus;
  const rankConfig = getRankConfig(user.roles.length > 0 ? user.roles : ["Guest"]);

  return (
    <Card className={cn(isBlocked && "border-destructive/50")}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Checkbox
            checked={selectedUserIds.has(user.id)}
            onCheckedChange={() => toggleUser(user.id)}
            aria-label={`Выбрать ${user.name}`}
            className="mt-2"
          />
          <div className="flex flex-1 items-start gap-3">
            <div className="relative">
              <Avatar
                className={cn(
                  "ring-offset-background h-10 w-10 ring-2 ring-offset-1",
                  isBlocked ? "ring-destructive/50" : rankConfig.ringColor
                )}
              >
                <AvatarImage src={user.image ?? undefined} />
                <AvatarFallback
                  className={cn(
                    "text-sm",
                    isBlocked ? "bg-destructive/20 text-destructive" : rankConfig.badgeColor,
                    !isBlocked && "text-white"
                  )}
                >
                  {user.name?.slice(0, 2).toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              {isBlocked && (
                <div className="bg-destructive absolute -bottom-0.5 -right-0.5 rounded-full p-0.5">
                  <Ban className="h-3 w-3 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className={cn("truncate font-medium", isBlocked && "text-destructive")}>
                  {user.name ?? "Без имени"}
                </p>
                {isBlocked && (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                    Заблокирован
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground truncate text-xs">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {user.roles.length > 0 ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      rankConfig.badgeColor + "/15",
                      rankConfig.textColor
                    )}
                  >
                    {rankConfig.shortLabel}
                    {user.roles.length > 1 && (
                      <span className="text-muted-foreground ml-1">(+{user.roles.length - 1})</span>
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">Без ролей</span>
                )}
                <span className="text-muted-foreground text-xs">{formatDate(user.createdAt)}</span>
              </div>
            </div>
          </div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManageRoles && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/users/${user.id}/roles`}>
                      <UserCog className="h-4 w-4" />
                      Управление ролями
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/users/${user.id}/properties`}>
                      <Building2 className="h-4 w-4" />
                      Собственность
                    </Link>
                  </DropdownMenuItem>
                  <EditTaglineDialog userId={user.id} userName={user.name} asMenuItem />
                  <DropdownMenuItem>
                    <KeyRound className="h-4 w-4" />
                    Сбросить пароль
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {isBlocked ? (
                    <UnblockUserDialog userId={user.id} userName={user.name} asMenuItem />
                  ) : (
                    <BlockUserDialog userId={user.id} userName={user.name} asMenuItem />
                  )}
                </>
              )}
              {canDeleteUsers && (
                <>
                  {canManageRoles && <DropdownMenuSeparator />}
                  <DeleteUserDialog userId={user.id} userName={user.name} asMenuItem />
                  {canHardDeleteUsers && (
                    <HardDeleteUserDialog userId={user.id} userName={user.name} asMenuItem />
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}

export function UsersTable({
  canManageRoles,
  canDeleteUsers,
  canHardDeleteUsers,
}: UsersTableProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");
  const isMobile = useMobile();
  const { toast } = useToast();

  const { data, isLoading } = api.admin.users.list.useQuery({
    page,
    limit: 20,
    search: search || undefined,
  });

  const utils = api.useUtils();

  const toggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) {
      newSet.delete(userId);
    } else {
      newSet.add(userId);
    }
    setSelectedUserIds(newSet);
  };

  const toggleAll = () => {
    if (data?.users) {
      if (selectedUserIds.size === data.users.length) {
        setSelectedUserIds(new Set());
      } else {
        setSelectedUserIds(new Set(data.users.map((u) => u.id)));
      }
    }
  };

  const bulkDeleteMutation = api.admin.users.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast({
        title: "Пользователи удалены",
        description: `Удалено пользователей: ${result.deleted}`,
      });
      setSelectedUserIds(new Set());
      setShowBulkDeleteDialog(false);
      setBulkDeleteReason("");
      void utils.admin.users.list.invalidate();
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
    const userIds = Array.from(selectedUserIds).filter((id) => {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      return uuidRegex.test(id);
    });

    if (userIds.length === 0) {
      toast({
        title: "Ошибка",
        description: "Не выбрано ни одного валидного пользователя",
        variant: "destructive",
      });
      return;
    }

    bulkDeleteMutation.mutate({
      userIds,
      reason: bulkDeleteReason || undefined,
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            placeholder="Поиск по имени или email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit">Найти</Button>
      </form>

      {/* Bulk Action Toolbar */}
      {selectedUserIds.size > 0 && (
        <div className="bg-muted mb-4 flex items-center gap-3 rounded-md border p-3">
          <span className="text-sm font-medium">Выбрано: {selectedUserIds.size}</span>
          <Separator orientation="vertical" className="h-6" />
          <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteDialog(true)}>
            <Trash2 className="h-4 w-4" />
            Удалить выбранных
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedUserIds(new Set())}>
            Отменить выбор
          </Button>
        </div>
      )}

      {/* Content - Mobile Cards or Desktop Table */}
      {isMobile ? (
        // Mobile: Card view
        <div className="space-y-3">
          {isLoading ? (
            <Card>
              <CardContent className="text-muted-foreground p-4 text-center">
                Загрузка...
              </CardContent>
            </Card>
          ) : data?.users.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground p-4 text-center">
                Пользователи не найдены
              </CardContent>
            </Card>
          ) : (
            data?.users.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                canManageRoles={canManageRoles}
                canDeleteUsers={canDeleteUsers}
                canHardDeleteUsers={canHardDeleteUsers}
                selectedUserIds={selectedUserIds}
                toggleUser={toggleUser}
              />
            ))
          )}
        </div>
      ) : (
        // Desktop: Table view
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      data?.users &&
                      data.users.length > 0 &&
                      selectedUserIds.size === data.users.length
                    }
                    onCheckedChange={toggleAll}
                    aria-label="Выбрать всех"
                  />
                </TableHead>
                <TableHead className="w-12"></TableHead>
                <TableHead>Пользователь</TableHead>
                <TableHead>Роли</TableHead>
                <TableHead>Регистрация</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Загрузка...
                  </TableCell>
                </TableRow>
              ) : data?.users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    Пользователи не найдены
                  </TableCell>
                </TableRow>
              ) : (
                data?.users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    canManageRoles={canManageRoles}
                    canDeleteUsers={canDeleteUsers}
                    canHardDeleteUsers={canHardDeleteUsers}
                    selectedUserIds={selectedUserIds}
                    toggleUser={toggleUser}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Страница {data.page} из {data.totalPages} (всего {data.total})
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
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Вперед
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Delete Dialog */}
      <AlertDialog open={showBulkDeleteDialog} onOpenChange={setShowBulkDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="text-destructive h-5 w-5" />
              Удаление {selectedUserIds.size} пользователей
            </AlertDialogTitle>
            <AlertDialogDescription>
              Это действие удалит {selectedUserIds.size} пользователей без возможности
              восстановления. Все данные будут удалены немедленно.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Причина удаления (опционально)</Label>
            <Textarea
              value={bulkDeleteReason}
              onChange={(e) => setBulkDeleteReason(e.target.value)}
              placeholder="Спам-аккаунты, боты..."
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
