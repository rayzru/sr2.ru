"use client";

import { useState } from "react";

import { AlertTriangle, Trash2 } from "lucide-react";

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
import { DropdownMenuItem } from "~/components/ui/dropdown-menu";
import { useToast } from "~/hooks/use-toast";
import { api } from "~/trpc/react";

interface HardDeleteUserDialogProps {
  userId: string;
  userName: string | null;
  asMenuItem?: boolean;
}

export function HardDeleteUserDialog({
  userId,
  userName,
  asMenuItem = false,
}: HardDeleteUserDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const utils = api.useUtils();

  const hardDeleteMutation = api.admin.users.hardDelete.useMutation({
    onSuccess: () => {
      toast({
        title: "Пользователь удалён",
        description:
          "Пользователь и все его персональные данные удалены без возможности восстановления",
      });
      setOpen(false);
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

  const handleHardDelete = () => {
    hardDeleteMutation.mutate({ userId });
  };

  const dialogContent = (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle className="text-destructive flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Полное удаление пользователя
        </AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div className="space-y-3">
            <p>
              Вы собираетесь <strong>безвозвратно удалить</strong> пользователя{" "}
              <span className="text-foreground font-medium">{userName ?? "Без имени"}</span>
            </p>

            <div className="border-destructive bg-destructive/10 rounded-lg border p-3">
              <p className="text-destructive text-sm font-medium">
                ВНИМАНИЕ! Это необратимое действие:
              </p>
              <ul className="text-destructive/90 mt-2 space-y-1 text-sm">
                <li className="flex items-start gap-2">
                  <span className="bg-destructive mt-1.5 h-1 w-1 shrink-0 rounded-full" />
                  <span>
                    Пользователь и все его персональные данные будут{" "}
                    <strong>удалены навсегда</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-destructive mt-1.5 h-1 w-1 shrink-0 rounded-full" />
                  <span>
                    Восстановление будет <strong>невозможно</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-destructive mt-1.5 h-1 w-1 shrink-0 rounded-full" />
                  <span>Будут удалены: профиль, роли, сессии, связи с собственностью</span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Проверка зависимостей:
              </p>
              <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                Система автоматически проверит наличие публикаций, объявлений и новостей. Если
                пользователь является автором контента, удаление будет отклонено.
              </p>
            </div>

            <p className="text-muted-foreground text-sm">
              Используйте эту функцию только для удаления спам-аккаунтов или пользователей без
              контента.
            </p>
          </div>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Отмена</AlertDialogCancel>
        <AlertDialogAction
          onClick={handleHardDelete}
          disabled={hardDeleteMutation.isPending}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {hardDeleteMutation.isPending ? "Удаление..." : "Удалить навсегда"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );

  if (asMenuItem) {
    return (
      <>
        <DropdownMenuItem
          variant="destructive"
          onSelect={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          <AlertTriangle className="h-4 w-4" />
          Удалить полностью
        </DropdownMenuItem>
        <AlertDialog open={open} onOpenChange={setOpen}>
          {dialogContent}
        </AlertDialog>
      </>
    );
  }

  return null; // Only support as menu item for now
}
