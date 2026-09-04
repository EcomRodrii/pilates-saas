'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { medirSiCorresponde } from '@/lib/ahrefs-cliente';

/**
 * Punto de montaje de Ahrefs Web Analytics. Toda la decisión —y el porqué de
 * no pegar el `<script>` en el `<head>` como dice la guía de Ahrefs— vive en
 * `lib/ahrefs-cliente.ts`.
 *
 * Va en el root layout, no en cada página de marketing: el registro de
 * `esNoIndexable()` ya sabe qué es público y qué no, y repartir la etiqueta por
 * los layouts de cada sección la habría dejado a merced de que alguien se
 * acuerde al añadir una sección nueva.
 *
 * Se reevalúa en cada cambio de ruta porque la primera vista puede ser una que
 * NO toca medir —`/login`, el portal de una alumna, el panel— y la visitante
 * llegar a la landing después. `medirSiCorresponde` es idempotente.
 */
export function AhrefsAnalytics() {
  const pathname = usePathname();
  useEffect(() => { medirSiCorresponde(pathname ?? '/'); }, [pathname]);
  return null;
}
