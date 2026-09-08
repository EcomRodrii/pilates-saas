'use client';

// Los créditos en vivo, en la app de la alumna.
//
// Mismo cableado que `use-aforo-portal.ts`, y por los mismos motivos —que allí
// están explicados con detalle y no se repiten aquí:
//
//  · Hay que invalidar el CATÁLOGO además de recargar. `catalogo()` es una
//    caché de módulo con TTL de 60 s: sin invalidarla, `refrescar()` releería
//    el mismo payload viejo y el fallo se leería como «el realtime no
//    funciona».
//  · DOS clientes: el canal lo abre `supabase` (el completo) y la identidad la
//    pone `supabasePortal.auth`, donde vive la sesión de la socia.
//  · `refrescar()` y no `reintentar()`: recarga sin pasar por el esqueleto.
//    Nadie quiere ver su pantalla parpadear porque otra persona ganó créditos.

import { useCallback } from 'react';
import { supabase } from '@/lib/db/supabase';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { useCreditosEnVivo } from '@/lib/realtime/creditos-en-vivo';

export function useCreditosEnVivoPortal(
  slug: string | null | undefined,
  studioId: string | null | undefined,
  refrescar: () => void | Promise<void>,
): void {
  const alCambiar = useCallback(() => {
    if (slug) invalidarCatalogo(slug);
    void refrescar();
  }, [slug, refrescar]);

  useCreditosEnVivo(supabase, {
    studioId,
    alCambiar,
    activo: Boolean(slug),
    auth: supabasePortal.auth,
  });
}
