import { AdminPageHeader } from "~/components/admin/admin-page-header";
import { UsersTable } from "~/components/admin/users-table";
import { auth } from "~/server/auth";
import { hasFeatureAccess, type UserRole } from "~/server/auth/rbac";

export default async function AdminUsersPage() {
  const session = await auth();
  const userRoles = session?.user.roles ?? [];

  const canManageRoles = hasFeatureAccess(userRoles, "users:roles");
  const canDeleteUsers = hasFeatureAccess(userRoles, "users:delete");
  const canHardDeleteUsers = hasFeatureAccess(userRoles, "users:hard-delete");

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Пользователи" description="Управление пользователями системы" />

      <UsersTable
        canManageRoles={canManageRoles}
        canDeleteUsers={canDeleteUsers}
        canHardDeleteUsers={canHardDeleteUsers}
      />
    </div>
  );
}
