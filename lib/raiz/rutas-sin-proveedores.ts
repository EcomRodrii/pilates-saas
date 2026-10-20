// Qué rutas se sirven SIN los providers de sesión del panel (`AuthProvider` y
// `StudioProvider`, que monta `components/raiz/proveedores-raiz.tsx`).
//
// Solo la app de la alumna (`app/portal/**`): no lee ninguno de los dos
// contextos —`lib/student/sesion.ts` evita `useStudio()` a propósito— y aun así
// descargaba y ejecutaba ~65 KB gz de código del panel en cada arranque.
//
// ⚠️ Prefijo EXACTO `/portal/`, con la barra: `/portal-preview` y
// `/portal-prototipo` existen y SÍ necesitan los providers. Y no se reutiliza
// `shadowedByPublicRoute` (lib/studio-context.tsx): incluye `/reservar/`, que
// necesita `AuthProvider` encima de su propio `StudioProvider`.
//
// `null` (sin ruta resuelta) monta los providers: ante la duda, lo que había.

export function esAppDeLaAlumna(pathname: string | null | undefined): boolean {
  return typeof pathname === 'string' && pathname.startsWith('/portal/');
}

/**
 * La ventana del puente del widget (`/widget-auth-retorno`) tampoco los monta
 * (20-oct-2026): no usa ninguno de los dos contextos, y por debajo cargan el
 * cliente de auth del PORTAL (`studio-context` → `api-client` →
 * `student/api-publica` → `supabase-portal`), que en esa página leería y
 * refrescaría la sesión de la alumna en tentare.app. Fuera los providers, esa
 * página no lo carga: la sesión del puente vive solo en su propio cliente
 * (app/widget-auth-retorno/clientes-auth.ts). Ruta EXACTA.
 */
export const RUTA_PUENTE_WIDGET = '/widget-auth-retorno';

/** ¿Esta ruta se sirve sin `AuthProvider`/`StudioProvider`? */
export function sinProveedoresDeSesion(pathname: string | null | undefined): boolean {
  return esAppDeLaAlumna(pathname) || pathname === RUTA_PUENTE_WIDGET;
}
