'use client';

// El aforo en vivo, en la app de la alumna.
//
// ⚠️ Hay que invalidar el CATÁLOGO además de recargar la pantalla. `catalogo()`
// es una caché de módulo con TTL de 60 s (`lib/student/catalogo.ts`): sin
// invalidarla, `refrescar()` volvería a leer exactamente el mismo payload viejo
// y no cambiaría nada — y el fallo se leería como «el realtime no funciona».
//
// ⚠️ Y hace falta el payload COMPLETO, no `refrescarAforo()`. Ese solo parchea
// `aforoReservas`, que es la lista ANÓNIMA de ocupación: sirve para «quedan 2
// plazas», y no para «tu reserva ha pasado de lista de espera a confirmada»,
// que vive en la parte `socia` del payload. Ese era justo el caso roto: se
// liberaba una plaza, el servidor la promocionaba, y su pantalla seguía
// diciendo «en lista de espera» hasta recargar a mano.
//
// `refrescar()` (y no `reintentar()`) a propósito: recarga sin pasar por el
// esqueleto y conserva lo que hay si falla. Nadie quiere ver la pantalla
// parpadear porque otra persona canceló una clase.

import { useCallback } from 'react';
import { supabase } from '@/lib/db/supabase';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { useAforoEnVivo } from '@/lib/realtime/aforo-en-vivo';

export function useAforoEnVivoPortal(
  slug: string | null | undefined,
  studioId: string | null | undefined,
  refrescar: () => void | Promise<void>,
): void {
  // Los ids que cambiaron no se usan aquí a propósito: la alumna necesita el
  // payload completo de todos modos —su reserva vive en la parte `socia`, no en
  // el aforo anónimo—, así que saber CUÁL cambió no ahorraría nada.
  const alCambiar = useCallback(() => {
    if (slug) invalidarCatalogo(slug);
    void refrescar();
  }, [slug, refrescar]);

  // ⚠️ DOS clientes, y no es un descuido. El canal lo abre `supabase` (el
  // cliente completo, que ya está cargado aquí porque `StudioProvider` envuelve
  // toda la app aunque quede inerte en /portal) y la identidad la pone
  // `supabasePortal.auth`, donde vive la sesión de la socia.
  //
  // `supabasePortal` es SOLO `.auth` a propósito: un cliente completo instancia
  // Postgrest/Realtime/Storage en su constructor y eso metía ~110 KB de más en
  // `public/widget.js`. Cambiarlo por uno completo para poder abrir un canal
  // habría pagado ese peso otra vez, en el bundle que se sirve desde la web del
  // estudio. Así no se paga nada.
  useAforoEnVivo(supabase, {
    studioId,
    alCambiar,
    activo: Boolean(slug),
    auth: supabasePortal.auth,
  });
}
