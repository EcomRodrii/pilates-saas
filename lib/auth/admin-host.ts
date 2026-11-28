const HOSTS_PUBLICOS_TENTARE = new Set(['tentare.app', 'www.tentare.app', 'app.tentare.app']);

// Rutas servidas por `app/(dashboard)`. La ruta /network también sirve páginas
// públicas, por eso solo se fija aquí el árbol privado que pertenece al panel.
const PREFIJOS_PANEL = [
  '/actualizaciones', '/apps', '/asistente', '/automatizaciones', '/bienvenido-apertura',
  '/calendario', '/centro-de-control', '/chat', '/cierre', '/citas', '/clientas', '/cobros',
  '/comunidad', '/configuracion', '/contenido', '/dashboard', '/equipo', '/explorar-funciones',
  '/facturas', '/festivos', '/informes', '/libreta', '/marketing', '/mensajeria', '/mi-perfil',
  '/migracion', '/notificaciones', '/ondemand', '/pagos', '/pos', '/primeros-pasos',
  '/productos', '/puesta-en-marcha', '/socios', '/sustituciones', '/transacciones', '/verifactu', '/interno',
] as const;

const RUTAS_DE_ACCESO = ['/login', '/crear-estudio', '/clave-nueva', '/verificar-acceso', '/invitacion'] as const;

function coincidePrefijo(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** El panel y sus pantallas de acceso siempre viven en admin.tentare.app. */
export function debeRedirigirPanelAAdmin(hostname: string, pathname: string): boolean {
  const host = hostname.toLowerCase().replace(/:\d+$/, '');
  if (!HOSTS_PUBLICOS_TENTARE.has(host)) return false;
  if (pathname.startsWith('/network/')) {
    return !pathname.startsWith('/network/instructoras') && !pathname.startsWith('/network/oportunidades');
  }
  return PREFIJOS_PANEL.some(p => coincidePrefijo(pathname, p))
    || RUTAS_DE_ACCESO.some(p => coincidePrefijo(pathname, p));
}

/** La raíz del host admin entra directamente al flujo de login/registro. */
export function raizAdminVaAlLogin(hostname: string, pathname: string): boolean {
  return hostname.toLowerCase().replace(/:\d+$/, '') === 'admin.tentare.app' && pathname === '/';
}
