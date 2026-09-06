'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useAsync } from '@/lib/student/useAsync';
import { fetchConversaciones, useMiAuthUserId } from '@/lib/student/mensajeria';
import { selloLista, tieneSinLeer, unaLinea } from '@/lib/mensajeria/presentacion';

// Punto de entrada a Mensajes desde la Home. A diferencia de `DelEstudio`
// (que se oculta si no hay tablón), esta SIEMPRE se pinta si la petición fue
// bien: sin conversaciones todavía, es el único sitio de la Home desde el que
// una socia nueva descubre que puede escribirle al estudio, y ocultarla
// dejaría "Mensajes" sin ninguna puerta de entrada hasta que el estudio le
// escribiera primero.
export function MensajesCard({ studioId, nombreEstudio, href }: { studioId: string; nombreEstudio: string; href: string }) {
  const miId = useMiAuthUserId();
  const cargar = useCallback(async () => (await fetchConversaciones(studioId)) ?? [], [studioId]);
  const { data, estado } = useAsync(cargar, () => false);
  if (estado !== 'ready' && estado !== 'empty') return null;

  const conversaciones = data ?? [];
  const conSinLeer = conversaciones.filter((c) => tieneSinLeer(c, miId));
  const destacada = conSinLeer[0] ?? conversaciones[0] ?? null;
  const nombre = destacada?.tipo === 'ALUMNA_MOSTRADOR' ? nombreEstudio : 'Tu instructora';

  return (
    <Link href={href} className="card card--tap a-up" data-testid="mensajes-card" style={{ display: 'block', padding: '13px 15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <p className="t-label" style={{ margin: 0 }}>Mensajes</p>
        <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>
          {conSinLeer.length > 0 ? `${conSinLeer.length} sin leer →` : destacada ? 'Ver todo →' : 'Escribir →'}
        </span>
      </div>
      <p style={{ margin: '7px 0 0', fontSize: 13.5, lineHeight: 1.5, fontWeight: conSinLeer.length > 0 ? 700 : 400, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {destacada ? (unaLinea(destacada.ultimo_cuerpo) || 'Sin mensajes todavía') : '¿Alguna duda? Escríbele al estudio.'}
      </p>
      {destacada && (
        <p className="t-mono" style={{ margin: '6px 0 0', fontSize: 9.5, color: 'var(--subtle-foreground)' }}>{nombre} · {selloLista(destacada.ultimo_mensaje_en ?? destacada.creado_en)}</p>
      )}
    </Link>
  );
}
