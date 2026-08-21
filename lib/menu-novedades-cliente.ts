'use client';

// Lado panel del badge «NUEVO» del menú (reglas puras en ./menu-novedades.ts).
//
// Lee `menu_novedades` DIRECTO de Supabase con RLS (select para
// `authenticated`), como el widget de Actualizaciones lee el changelog — no hay
// endpoint propio para esto: es contenido global y público para cualquier
// staff, y una ruta más solo añadiría un salto.
//
// ⚠️ Sin Realtime a propósito. `realtime.apply_rls()` es el mayor consumidor de
// CPU de esta base (el 58 % del tiempo medido, ver migr
// 20260806150000_realtime_sin_mensajes_equipo), y esto se publica una vez cada
// varias semanas: enterarse al recargar es de sobra.

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/db/supabase';
import { hrefsConBadge, type NovedadMenu } from '@/lib/menu-novedades';

const CLAVE_VISTOS = 'tentare:menu-novedades-vistas';

// Una sola petición por carga de página aunque la consuman el sidebar de
// escritorio y el cajón de móvil a la vez (los dos están montados: `lg:hidden`
// no desmonta). Se cachea la PROMESA, no el resultado, para que dos
// consumidores que monten a la vez no disparen dos consultas.
let enVuelo: Promise<NovedadMenu[]> | null = null;

async function consultar(): Promise<NovedadMenu[]> {
  const { data, error } = await supabase.from('menu_novedades').select('href, expira_en');
  // Un fallo de red deja el menú EXACTAMENTE como estaba. Un badge que no
  // aparece no rompe nada; reventar el menú entero por esto, sí.
  if (error || !data) return [];
  return data.map(r => ({ href: r.href as string, expiraEn: r.expira_en as string }));
}

function cargar(): Promise<NovedadMenu[]> {
  enVuelo ??= consultar();
  return enVuelo;
}

function leerVistos(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_VISTOS);
    const v: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    // localStorage puede lanzar (Safari en privado, cuota llena). Sin memoria
    // de lo visto, el badge simplemente dura hasta su fecha.
    return [];
  }
}

function anotarVisto(href: string): boolean {
  const vistos = leerVistos();
  if (vistos.includes(href)) return false;
  try {
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify([...vistos, href]));
    return true;
  } catch { return false; }
}

/**
 * Los `href` que llevan badge ahora mismo.
 *
 * Arranca VACÍO y se llena tras montar, a propósito: `localStorage` no existe
 * en el servidor, así que decidirlo en el render daría un desajuste de
 * hidratación. Lo peor que pasa es que el badge aparezca un instante después
 * que el menú.
 *
 * `rutaActual` apaga el badge de la sección en la que ya está: si la
 * propietaria está mirando lo nuevo, señalárselo sobra. Es lo que convierte el
 * badge en algo que se gasta al usarlo en vez de en un adorno que sigue ahí
 * cuando ya lo ha visto diez veces.
 */
export function useMenuNovedades(rutaActual: string): Set<string> {
  const [novedades, setNovedades] = useState<NovedadMenu[]>([]);
  const [vistos, setVistos] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    void cargar().then(n => { if (vivo) { setNovedades(n); setVistos(leerVistos()); } });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    // El `href` marcado puede ser un prefijo de donde está de verdad
    // (`/network/buscar` marcado, ella en `/network/buscar/123`): se da por
    // visto igual, es el mismo criterio con el que el menú decide qué entrada
    // pintar como activa.
    const visitado = novedades.find(
      n => rutaActual === n.href || rutaActual.startsWith(`${n.href}/`),
    );
    // El `setState` síncrono aquí es justo el caso que la regla contempla como
    // legítimo: `localStorage` ES el sistema externo, y este efecto lo
    // sincroniza con React. No cascadea — `anotarVisto` devuelve `false` en
    // cuanto la ruta ya está anotada, así que se ejecuta UNA vez por novedad.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (visitado && anotarVisto(visitado.href)) setVistos(leerVistos());
  }, [rutaActual, novedades]);

  return hrefsConBadge(novedades, new Date().toISOString().slice(0, 10), vistos);
}
