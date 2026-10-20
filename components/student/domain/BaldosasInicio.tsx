'use client';

import Link from 'next/link';
import { Icono, type NombreIcono } from '@/components/student/ui/Icono';

/**
 * Las cuatro baldosas de Inicio, copia de la maqueta (fundador, 19-oct-2026: «copia exacta», que sustituye a la fila del
 * 7-oct Comunidad · Instructoras · Chat · Favoritos): Reservar · Mi plan · Comunidad · Mis favoritos. Icono encima,
 * nombre debajo, sin pie; «Mis favoritos» en el tono suave del estudio, como en la maqueta.
 *
 * Instructoras y el chat con el estudio siguen en Perfil y en la ficha de cada clase. La fila de la instructora («Hoy»)
 * sigue con `FilaAccesos`: esto es solo de la alumna.
 */
export function BaldosasInicio({ hrefReservar, hrefMiPlan, hrefComunidad, hrefFavoritas }: {
  hrefReservar: string; hrefMiPlan: string; hrefComunidad: string; hrefFavoritas: string;
}) {
  const baldosas: Array<{ href: string; titulo: string; icono: NombreIcono; suave?: boolean }> = [
    { href: hrefReservar, titulo: 'Reservar', icono: 'calendario' },
    { href: hrefMiPlan, titulo: 'Mi plan', icono: 'bono' },
    { href: hrefComunidad, titulo: 'Comunidad', icono: 'instructoras' },
    { href: hrefFavoritas, titulo: 'Mis favoritos', icono: 'favorito', suave: true },
  ];
  return (
    <nav aria-label="Accesos rápidos">
      <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, margin: 0, padding: 0, listStyle: 'none' }}>
        {baldosas.map((b) => (
          <li key={b.titulo} style={{ minWidth: 0, display: 'flex' }}>
            <Link href={b.href} className={'tap baldosa-maqueta' + (b.suave ? ' baldosa-maqueta--suave' : '')}>
              <Icono nombre={b.icono} tamano={26} />
              <span style={{ hyphens: 'auto', overflowWrap: 'break-word', lineHeight: 1.15 }}>{b.titulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
