/** Roles que pueden cambiar la configuración del establecimiento. */
export const ROLES_CONFIG = new Set(["ADMIN", "DIRECTOR"]);

export function puedeConfigurarColegio(rol: string): boolean {
  return ROLES_CONFIG.has(rol);
}
