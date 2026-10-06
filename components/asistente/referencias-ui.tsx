'use client';

import { createContext, useContext } from 'react';
import Link from 'next/link';
import type { Referencia } from '@/lib/asistente/estado-ui';

// Los nombres de las personas solo viven en el navegador: llegan aparte (evento
// `referencias`) y se pintan donde el servidor puso `[ALUMNA_3]` o una ref en
// una tarjeta. Una ref sin nombre todavía se pinta genérica, nunca vacía.

export const ReferenciasCtx = createContext<Record<string, Referencia>>({});

const GENERICO: Record<string, string> = { ALUMNA: 'Una alumna', EQUIPO: 'Alguien del equipo', PERSONA: 'Esa persona' };

export function nombreDe(ref: string, refs: Record<string, Referencia>): Referencia {
  return refs[ref] ?? { nombre: GENERICO[ref.split('_')[0]] ?? 'Alguien', href: null };
}

/** Un nombre como chip: enlaza a la ficha si la hay. `enTexto` lo ajusta a la línea de la respuesta. */
export function NombrePersona({ referencia: r, enTexto = false }: { referencia: string; enTexto?: boolean }) {
  const refs = useContext(ReferenciasCtx);
  const { nombre, href } = nombreDe(r, refs);
  const clase = enTexto
    ? 'inline-flex items-baseline rounded-md bg-muted px-1 font-medium text-foreground'
    : 'truncate font-semibold text-foreground';
  if (!href) return <span className={clase} data-ref={r}>{nombre}</span>;
  return (
    <Link href={href} className={`${clase} decoration-from-font underline-offset-2 hover:underline`} aria-label={`${nombre}, abrir ficha`} data-ref={r}>
      {nombre}
    </Link>
  );
}
