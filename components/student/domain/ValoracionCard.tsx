'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { getValoracion } from '@/lib/student/valoracion';

/**
 * La invitación a rellenar la valoración, en Inicio.
 *
 * ⚠️ NO es un modal, y esa es la decisión de producto de esta pieza. Un modal
 * al abrir la app obliga a decidir antes de dejarte ver nada, y lo que la
 * alumna viene a hacer es reservar una clase. Una tarjeta espera; un modal
 * cobra peaje. Se sigue el mismo criterio que `DelEstudio`.
 *
 * ⚠️ Se pinta SOLO si hay algo que hacer:
 *  · el estudio la tiene activada, y
 *  · no la ha completado todavía.
 * Terminada, desaparece de Inicio y se queda en Perfil, donde vive lo que ya
 * está hecho. Una tarjeta que sigue ahí después de completarla convierte el
 * logro en ruido permanente.
 *
 * Si la petición falla, no se pinta nada: es una invitación, no un dato. Un
 * error aquí no debe ensuciar la pantalla principal — que es exactamente la
 * regla que ya documenta este repo sobre `/dashboard`.
 */
export function ValoracionCard({ studioId, href }: { studioId: string; href: string }) {
  const cargar = useCallback(() => getValoracion(studioId), [studioId]);
  const { data } = useAsync(cargar, () => false);

  if (!data?.activa) return null;
  const hecha = Boolean(data.historial?.actual);
  if (hecha) return null;

  const empezada = Boolean(data.historial?.borrador);

  return (
    <Link
      href={href}
      className="card card--pad-xl card--tap stack"
      data-testid="card-valoracion"
      style={{ ['--gap' as string]: 'var(--s-3)' }}
    >
      <div className="row row--between">
        <p className="t-label">Tu punto de partida</p>
        {/* Retomar y empezar no son lo mismo, y decirlo cambia lo que cuesta
            entrar: «sigue donde lo dejaste» promete que no se pierde nada. */}
        {empezada && <span className="badge badge--wait">A medias</span>}
      </div>

      <div className="stack" style={{ ['--gap' as string]: 'var(--s-1)' }}>
        <p className="t-card-title">
          {empezada ? 'Sigue donde lo dejaste' : 'Cuéntanos cómo empiezas'}
        </p>
        <p className="t-small t-dim">
          {empezada
            ? 'Te quedan un par de preguntas. Se guarda solo.'
            : 'Unas preguntas rápidas para que tu estudio pueda adaptar mejor tus clases. Un par de minutos.'}
        </p>
      </div>

      <span className="btn btn--secondary btn--sm" style={{ alignSelf: 'flex-start' }}>
        {empezada ? 'Continuar' : 'Empezar'}
      </span>
    </Link>
  );
}
