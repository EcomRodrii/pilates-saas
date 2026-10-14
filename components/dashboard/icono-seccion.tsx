'use client';

// El icono de color de cada sección, junto a su título (panel nuevo,
// 14-oct-2026): como los iconos de color de Bonsai, que dicen dónde estás antes
// de leer. Sale del mismo catálogo que el menú (`MODULOS`), así que una sección
// nueva lo trae sola. El Resumen no lo lleva: su título es el saludo.

import { usePathname } from 'next/navigation';
import { MODULOS } from '@/lib/nav-config';
import { usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { Baldosa, type Tono } from './vivo';

/** El tono de cada sección: el mismo en su cabecera, sus cifras y sus vacíos. */
export const TONO_DE_SECCION: Record<string, Tono> = {
  '/centro-de-control': 'magenta',
  '/automatizaciones': 'indigo',
  '/calendario': 'azul',
  '/citas': 'indigo',
  '/clientas': 'magenta',
  '/mensajeria': 'indigo',
  '/equipo': 'verde',
  '/sustituciones': 'verde',
  '/cobros': 'verde',
  '/pos': 'verde',
  '/productos': 'magenta',
  '/informes': 'azul',
  '/cierre': 'indigo',
  '/configuracion': 'azul',
  '/migracion': 'azul',
  '/libreta': 'indigo',
  '/actualizaciones': 'magenta',
  '/suscripcion': 'verde',
};

export function IconoSeccion() {
  const panelNuevo = usePanelNuevo();
  const pathname = usePathname() ?? '';
  if (!panelNuevo || pathname === '/dashboard') return null;
  // La sección es la primera parte de la ruta: /clientas/123 sigue siendo Clientas.
  const raiz = `/${pathname.split('/')[1] ?? ''}`;
  if (raiz !== pathname) return null; // en una ficha o un paso, el título ya es otra cosa
  const modulo = MODULOS.find(m => m.href === raiz);
  if (!modulo) return null;
  return <Baldosa tono={TONO_DE_SECCION[raiz] ?? 'azul'} Icono={modulo.icon} />;
}
