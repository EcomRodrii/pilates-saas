/** ¿Debe el host de administración abrir el flujo de acceso al visitar su raíz? */
export function raizAdminVaAlLogin(hostname: string, pathname: string): boolean {
  return hostname.toLowerCase() === 'admin.tentare.app' && pathname === '/';
}
