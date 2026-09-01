'use client';

// Indicador de plazas libres de una clase — antes texto gris plano en cada
// pantalla que lo necesitaba (portal-clases-view.tsx, portal-home-view.tsx),
// nunca usaba el color de urgencia ya calibrado (`semantic.warning`, AA en
// claro y oscuro). Mismo umbral que ya se ve en el prototipo de referencia:
// pocas plazas y completa se marcan en ámbar; con margen, texto neutro.

import { useModo } from '@/lib/portal-modo';
import { semantic, typography } from '@/lib/portal-tokens';

export function AforoIndicator({
  libres, umbralUrgencia = 2, style,
}: { libres: number; umbralUrgencia?: number; style?: React.CSSProperties }) {
  const { t } = useModo();
  const urgente = semantic.warning.text;

  if (libres <= 0) {
    return <span style={{ ...typography.caption, fontWeight: 700, color: urgente, ...style }}>Completa</span>;
  }
  if (libres <= umbralUrgencia) {
    return (
      <span style={{ ...typography.caption, fontWeight: 700, color: urgente, ...style }}>
        Queda{libres === 1 ? '' : 'n'} {libres} plaza{libres === 1 ? '' : 's'}
      </span>
    );
  }
  return <span style={{ ...typography.caption, color: t.muted, ...style }}>{libres} plazas libres</span>;
}
