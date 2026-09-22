'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { pedirCatalogoClasesFijas } from '@/lib/student/clases-fijas-datos';
import { TEXTOS_CLASES_FIJAS as T } from '@/lib/student/clases-fijas-textos';
import { Icono } from '@/components/student/ui/Icono';

// La puerta a «Clases fijas» desde el horario: solo aparece si el estudio ofrece
// alguna. Sin ofertas —o si no se ha podido saber— no pinta nada: nunca un aviso de
// error por algo que la alumna no ha pedido. Vive en el horario y no en Inicio a
// propósito: Inicio ya carga trece bloques, y esta llamada es una ida y vuelta más.
export function ClasesFijasEntrada() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const cargar = useCallback(async () => {
    const c = await pedirCatalogoClasesFijas(estudio.slug);
    return c ? c.ofertas.length : 0;
  }, [estudio.slug]);
  const { data } = useAsync(cargar, (n) => n === 0);
  if (!data) return null;

  return (
    <div className="px" style={{ marginTop: 12 }}>
      <Link href={href('/clases-fijas')} data-testid="entrada-clases-fijas" className="card card--tap"
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
        <span aria-hidden className="avatar" style={{ ['--size' as string]: '40px', background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>
          <Icono nombre="plaza" tamano={20} />
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontWeight: 800, fontSize: 'var(--t-body)' }}>{T.entradaTitulo}</span>
          <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{T.entradaCuerpo}</span>
        </span>
        <Icono nombre="chevron-derecha" tamano={18} />
      </Link>
    </div>
  );
}
