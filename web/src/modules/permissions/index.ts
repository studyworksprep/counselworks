export type { Role, Permission, PermissionContext } from "./types";

export {
  ROLE_PERMISSIONS,
  hasPermission,
  canViewStudent,
  canEditStudent,
  canViewRecord,
  requirePermission,
  getPermissionContext,
} from "./service";
