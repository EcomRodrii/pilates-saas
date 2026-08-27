'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCore } from '@/lib/core-context';
import { usePortalAuth } from '@/lib/portal-auth';

/**
 * La raíz del portal: siempre a `/acceso`.
 *
 * ⚠️ RETIRADO (decisión del fundador, 2026-08-27): esto montaba la bienvenida
 * del kit de temas (`components/portal/portal-tema-marco.tsx`), borrado en el
 * PR 2 de "borrar temas del kit". Esa rama ya era inalcanzable desde el PR 1
 * (`esTemaPortal()` devolvía siempre `false`, así que `sinKit` era siempre
 * `true`) — este componente YA redirigía siempre a `/acceso` en la práctica.
 * Con `PortalTemaMarco` borrado, la última línea (`return <PortalTemaMarco
 * .../>`) tampoco podía compilar, así que se retira aquí junto con el resto
 * de la rama muerta. La versión "de siempre" (sin bienvenida propia, directo
 * a `/acceso`) es PR 3 si se quiere simplificar más a fondo.
 */
export function PortalRaiz({ slug }: { slug: string }) {
  const router = useRouter();
  // Auditoría integral 2026-08-21 (rendimiento, P0-2): useCore(), no useStudio() — solo campos de tema/nav ya publicados.
  const { dataLoaded } = useCore();
  const { session, isLoading } = usePortalAuth();
  const acceso = `/portal/${slug}/acceso`;

  // ⚠️ En un EFECTO, no durante el render. Llamar al router mientras se renderiza
  // es un antipatrón: React puede reintentar ese render, y entonces la
  // navegación se dispara más de una vez. Se hace después, que es cuando el
  // componente ya existe.
  const listoParaRedirigir = !isLoading && !session && dataLoaded;
  useEffect(() => {
    if (listoParaRedirigir) router.replace(acceso);
  }, [listoParaRedirigir, router, acceso]);

  return null;
}
