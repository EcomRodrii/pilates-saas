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
import type { NovedadMenu } from '@/lib/menu-novedades';

// Una sola petición por carga de página aunque la consuman el sidebar de
// escritorio y el cajón de móvil a la vez (los dos están montados: `lg:hidden`
// no desmonta). Se cachea la PROMESA, no el resultado, para que dos
// consumidores que monten a la vez no disparen dos consultas.
let enVuelo: Promise<NovedadMenu[]> | null = null;

async function consultar(): Promise<NovedadMenu[]> {
  const { data, error } = await supabase.from('menu_novedades').select('href');
  // Un fallo de red deja el menú EXACTAMENTE como estaba. Un badge que no
  // aparece no rompe nada; reventar el menú entero por esto, sí.
  if (error || !data) return [];
  return data.map(r => ({ href: r.href as string }));
}

function cargar(): Promise<NovedadMenu[]> {
  enVuelo ??= consultar();
  return enVuelo;
}

/**
 * Los `href` que llevan badge ahora mismo.
 *
 * Arranca VACÍO y se llena tras montar, a propósito: no hay forma de saber
 * esto en el servidor sin duplicar la consulta, así que decidirlo en el
 * render daría un desajuste de hidratación. Lo peor que pasa es que el badge
 * aparezca un instante después que el menú.
 *
 * Puramente manual: se queda hasta que la fila se borra desde /interno. No
 * hay «ya lo vi» — visitar la sección no apaga nada.
 */
export function useMenuNovedades(): Set<string> {
  const [novedades, setNovedades] = useState<NovedadMenu[]>([]);

  useEffect(() => {
    let vivo = true;
    void cargar().then(n => { if (vivo) setNovedades(n); });
    return () => { vivo = false; };
  }, []);

  return new Set(novedades.map(n => n.href));
}
