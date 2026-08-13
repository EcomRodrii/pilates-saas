import type { Socio, Suscripcion, DestinatariosCampana } from '@/lib/types';

// Resuelve las destinatarias de una campaña a partir de su segmento. Pura y
// compartida entre cliente (lib/studio-context.tsx, para el recuento
// inmediato) y servidor (lib/inngest/campanas.ts, para el envío real) — antes
// vivía solo en el cliente, y el envío server-side habría tenido que
// reimplementar el mismo criterio por separado, con riesgo de divergir en
// silencio. Ver docs/marketing-integrations-arquitectura.md §5.
export function resolverDestinatariasCampana(
  destinatarios: DestinatariosCampana,
  datos: { socios: Socio[]; suscripciones: Suscripcion[] },
): Socio[] {
  const { socios, suscripciones } = datos;
  const conSusActiva = new Set(
    suscripciones.filter(s => s.estado === 'ACTIVA').map(s => s.socioId)
  );
  switch (destinatarios) {
    case 'ACTIVAS': return socios.filter(s => s.activo !== false);
    case 'INACTIVAS': return socios.filter(s => s.activo === false);
    case 'SIN_PLAN': return socios.filter(s => !conSusActiva.has(s.id));
    case 'BONO': return socios.filter(s => conSusActiva.has(s.id));
    case 'VIP': return socios.filter(s => s.tags?.includes('VIP'));
    case 'TODAS':
    default: return socios;
  }
}
