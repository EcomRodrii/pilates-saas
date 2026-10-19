'use client';

import { useCallback } from 'react';
import { useAsync } from '@/lib/student/useAsync';
import { getMensajeDestacado } from '@/lib/student/datos';
import { Icono } from '@/components/student/ui/Icono';

// El mensaje destacado del estudio, arriba del inicio (decisión 11A de «Mi app y
// mi web» v2, 15-oct-2026): un cierre, un cambio de horario, una bienvenida.
//
// ⚠️ Sin texto NO se pinta nada, como «Descubre»: es contenido opcional del
// estudio, y una franja vacía le diría a la alumna que le falta algo. El fundador
// retiró «Del estudio» por llenar la home de bloques; una franja que solo existe
// cuando el estudio tiene algo que decir no suma ninguno.
//
// El texto lo escribe el estudio y se pinta como TEXTO (React lo escapa): nada de
// enlaces ni HTML. Los saltos de línea que escribió se respetan.

/** La franja tal cual. La usa también la vista previa del panel: es la pieza de verdad. */
export function FranjaMensaje({ texto }: { texto: string }) {
  return (
    <p
      role="note"
      aria-label="Aviso del estudio"
      data-testid="mensaje-destacado"
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start', margin: 0,
        padding: '12px 14px', borderRadius: 'var(--radius-card)',
        background: 'var(--card)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)',
        boxShadow: 'var(--shadow-card)', color: 'var(--foreground)',
        fontSize: 'var(--t-small)', fontWeight: 500, lineHeight: 1.45,
      }}
    >
      <span aria-hidden style={{ display: 'flex', flexShrink: 0, marginTop: 1, color: 'var(--accent)' }}>
        <Icono nombre="megafono" tamano={18} />
      </span>
      <span style={{ minWidth: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{texto}</span>
    </p>
  );
}

export function MensajeDestacado({ slug }: { slug: string }) {
  const cargar = useCallback(() => getMensajeDestacado(slug), [slug]);
  const { data, estado } = useAsync(cargar);
  // Ni esqueleto: sale del mismo payload que el resto de la home.
  if (estado !== 'ready' || !data) return null;
  return (
    <div className="px a-up" style={{ marginTop: 14 }}>
      <FranjaMensaje texto={data} />
    </div>
  );
}
