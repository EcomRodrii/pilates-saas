// Los submenús del menú lateral a sangre (`SHELL_NUEVO`, 19-nov-2026): como el de Shopify, un módulo con varias
// vistas se despliega EN LÍNEA debajo de su fila («Paquetes» → Tarifas, Tarjeta regalo, Productos de la caja) y así
// las pantallas dejan de cargar sus pestañas de arriba: cada vista tiene su sitio en el menú.
//
// ⚠️ No son rutas nuevas ni permisos nuevos: cada hijo apunta a una vista que ya existía (una pestaña de la pantalla,
// con su `?tab=` / `?pestana=` / `?vista=`, o una subruta del módulo) y se enseña SOLO a quien ya podía verla. Las
// reglas de permiso son las mismas funciones que usan las propias pantallas.
//
// Aparte de `nav-config.ts` a propósito: `hijos` de allí es el desplegable lateral (flyout) de «Apps e integraciones»,
// que se queda como está para el menú de siempre. Esto solo lo lee el marco a sangre.

import {
  puedeGestionarClientas, puedeMoverDinero, puedeVerAuditoriaFinanciera, puedeVerFinanzas,
} from './permisos-reglas.ts';
import { esRutaCongelada } from './frozen-features.ts';
import type { Rol } from './types';

export interface SubItem {
  /** Ruta, con su parámetro si es una vista de la misma pantalla. */
  href: string;
  label: string;
  /** La vista que se ve cuando la URL no trae parámetro. */
  porDefecto?: boolean;
  /** ¿Lo ve este rol? Sin esto, lo ve quien ve el módulo. */
  puede?: (rol: Rol) => boolean;
}

export const SUBMENUS: Readonly<Record<string, readonly SubItem[]>> = {
  '/clientas': [
    { href: '/clientas', label: 'Todos', porDefecto: true },
    { href: '/clientas?vista=interesadas', label: 'Interesados y pruebas' },
    { href: '/clientas/importar', label: 'Importar clientes' },
  ],
  '/calendario': [
    { href: '/calendario', label: 'Calendario', porDefecto: true },
    { href: '/calendario/plazas-libres', label: 'Plazas libres' },
    { href: '/calendario/importar', label: 'Importar horario' },
  ],
  '/mensajeria': [
    { href: '/mensajeria?tab=notificaciones', label: 'Notificaciones', porDefecto: true },
    { href: '/mensajeria?tab=comunidad', label: 'Comunidad' },
    { href: '/mensajeria?tab=conversaciones', label: 'Conversaciones' },
    { href: '/mensajeria?tab=enviar', label: 'Enviar mensaje', puede: puedeGestionarClientas },
  ],
  '/equipo': [
    { href: '/equipo', label: 'Instructores', porDefecto: true },
    { href: '/equipo/rendimiento', label: 'Rendimiento' },
    { href: '/equipo/tiempo-trabajado', label: 'Tiempo trabajado' },
    { href: '/equipo/liquidaciones', label: 'Liquidaciones' },
  ],
  '/cobros': [
    { href: '/cobros?tab=deudas', label: 'Quién me debe', porDefecto: true },
    { href: '/cobros?tab=cobrado', label: 'Cobrado' },
    { href: '/cobros?tab=facturas', label: 'Facturas' },
    { href: '/cobros?tab=historial', label: 'Historial', puede: puedeVerAuditoriaFinanciera },
  ],
  '/productos': [
    { href: '/productos?tab=planes', label: 'Tarifas', porDefecto: true },
    { href: '/productos?tab=regalo', label: 'Tarjeta regalo', puede: puedeVerFinanzas },
    { href: '/productos?tab=pos', label: 'Productos de la caja', puede: (r) => !esRutaCongelada('/pos') && puedeMoverDinero(r) },
  ],
  '/informes': [
    { href: '/informes', label: 'Resumen', porDefecto: true },
    { href: '/informes?pestana=dinero', label: 'Dinero' },
    { href: '/informes?pestana=clases', label: 'Clases' },
    { href: '/informes?pestana=clientas', label: 'Clientes' },
    { href: '/informes?pestana=bonos', label: 'Bonos' },
  ],
  '/apps': [
    { href: '/apps', label: 'Tienda de apps', porDefecto: true },
    { href: '/apps/integraciones', label: 'Integraciones de terceros' },
    { href: '/apps/api', label: 'API de desarrollador' },
  ],
};

/** Los submenús de un módulo que este rol puede ver (con `puedeVer` de la ruta ya aplicado por quien llama). */
export function submenuDe(href: string, rol: Rol, puedeVer: (ruta: string) => boolean): SubItem[] {
  const filas = SUBMENUS[href];
  if (!filas) return [];
  return filas.filter(f => (f.puede ? f.puede(rol) : true) && puedeVer(f.href.split('?')[0]));
}

/** ¿Está esta vista a la vista? Misma ruta y, si lleva parámetro, el mismo valor (o es la de por defecto y no hay ninguno). */
export function subItemActivo(f: SubItem, pathname: string, params: { get(nombre: string): string | null }): boolean {
  const [ruta, consulta] = f.href.split('?');
  if (pathname !== ruta) return false;
  if (!consulta) {
    // Sin parámetro en el enlace: es la vista de la ruta o una subruta. «Por defecto» solo si la URL no trae el parámetro de otra vista.
    if (!f.porDefecto) return true;
    const otros = (SUBMENUS[ruta] ?? []).filter(x => x !== f && x.href.startsWith(`${ruta}?`));
    return !otros.some(x => {
      const [n] = x.href.split('?')[1].split('=');
      return params.get(n) !== null;
    });
  }
  const [nombre, valor] = consulta.split('=');
  const actual = params.get(nombre);
  return actual === valor || (f.porDefecto === true && actual === null);
}
