'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getClasesFijas } from '@/lib/student/datos';
import { franjaDeRepeticion } from '@/lib/student/clases-fijas';
import { TEXTOS_PLAZA_FIJA as T } from '@/lib/student/plaza-fija-textos';
import { Icono } from '@/components/student/ui/Icono';

// «Repetir cada semana», en la ficha de una clase normal. NO es una segunda acción de la pantalla: solo LLEVA a la ficha de
// la clase fija (`/clases-fijas/[sesionId]`), donde se pide (decisión de los estudios, 23-sep: con las dos acciones juntas
// las alumnas no sabían cuál tocar). Solo aparece si la clase se repite y el estudio ofrece clases fijas; sin eso, o si no
// se ha podido saber, no pinta nada —nunca un aviso de error por algo que no ha pedido— y no frena la reserva: el catálogo se
// pide aparte, sin bloquear la ficha.
export function RepetirCadaSemana({ fecha, hora, salaId }: { fecha: string; hora: string; salaId: string }) {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const cargar = useCallback(
    async () => franjaDeRepeticion(await getClasesFijas(estudio.slug), { fecha, hora, salaId }),
    [estudio.slug, fecha, hora, salaId],
  );
  const { data } = useAsync(cargar, (d) => !d);
  if (!data) return null;

  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  const estado = data.estado?.estado ?? null;
  const cuerpo = estado === 'TIENE_PLAZA' ? T.repetirTiene
    : estado === 'PEDIDA' ? T.repetirPedida
    : estado === 'SOLO_CON_CUOTA' ? T.repetirSoloConCuota
    : T.repetirPuede(dia, hora);

  return (
    <Link
      href={href(`/clases-fijas/${data.sesionId}`)} data-testid="repetir-cada-semana" className="card card--tap"
      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}
    >
      <span aria-hidden className="avatar" style={{ ['--size' as string]: '36px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>
        <Icono nombre="plaza" tamano={18} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-body)' }}>{T.repetirTitulo}</span>
        <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{cuerpo}</span>
      </span>
      <Icono nombre="chevron-derecha" tamano={18} />
    </Link>
  );
}
