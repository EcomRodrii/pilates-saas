import type { Socio, Suscripcion, Recibo, DestinatariosCampana } from '@/lib/types';

const MS_DIA = 86400000;

// Ventana fija para "bono próximo a caducar" — a propósito NO es la ventana
// adaptativa por ritmo real de F3 (lib/decision/especialistas/finanzas.ts):
// esa responde "avisa a la propietaria de ESTA socia concreta como insight
// accionable", esto responde "quién entra en un SEGMENTO para una campaña
// masiva" — sin index de reservas/frecuencia por socia, mismo suelo (14
// días) que ya usa F3 como mínimo seguro. Ver
// docs/marketing-integrations-arquitectura.md §4/§6.
const DIAS_BONO_CADUCA_PRONTO = 14;

// Resuelve las destinatarias de una campaña a partir de su segmento. Pura y
// compartida entre cliente (lib/studio-context.tsx, para el recuento
// inmediato) y servidor (lib/inngest/campanas.ts, para el envío real) — antes
// vivía solo en el cliente, y el envío server-side habría tenido que
// reimplementar el mismo criterio por separado, con riesgo de divergir en
// silencio. Ver docs/marketing-integrations-arquitectura.md §5.
export function resolverDestinatariasCampana(
  destinatarios: DestinatariosCampana,
  datos: { socios: Socio[]; suscripciones: Suscripcion[]; recibos?: Recibo[] },
  now: Date = new Date(),
): Socio[] {
  const { socios, suscripciones, recibos = [] } = datos;
  const conSusActiva = new Set(
    suscripciones.filter(s => s.estado === 'ACTIVA').map(s => s.socioId)
  );
  switch (destinatarios) {
    case 'ACTIVAS': return socios.filter(s => s.activo !== false);
    case 'INACTIVAS': return socios.filter(s => s.activo === false);
    case 'SIN_PLAN': return socios.filter(s => !conSusActiva.has(s.id));
    case 'BONO': return socios.filter(s => conSusActiva.has(s.id));
    case 'VIP': return socios.filter(s => s.tags?.includes('VIP'));

    case 'BONO_CADUCA_PRONTO': {
      // sesionesRestantes !== null: mismo proxy "es un bono por sesiones, no
      // un plan mensual ilimitado" que ya usan BONO_AGOTADO/BONO_QUEDA_1 en
      // lib/engines/marketing-automation-engine.ts, sin necesitar planesTarifa.
      const idsBonoCaduca = new Set(
        suscripciones
          .filter(s => s.estado === 'ACTIVA' && s.sesionesRestantes !== null && s.sesionesRestantes > 0 && s.fechaFin)
          .filter(s => {
            const dias = Math.ceil((new Date(s.fechaFin!).getTime() - now.getTime()) / MS_DIA);
            return dias >= 0 && dias <= DIAS_BONO_CADUCA_PRONTO;
          })
          .map(s => s.socioId),
      );
      return socios.filter(s => idsBonoCaduca.has(s.id));
    }

    case 'PAGO_FALLIDO': {
      const idsPagoFallido = new Set(recibos.filter(r => r.estado === 'FALLIDO').map(r => r.socioId));
      return socios.filter(s => idsPagoFallido.has(s.id));
    }

    case 'CUMPLE_ESTE_MES': {
      const mesActual = now.getUTCMonth();
      return socios.filter(s => {
        if (!s.fechaNacimiento) return false;
        // fechaNacimiento es 'YYYY-MM-DD' — mes por índice de string, sin
        // pasar por Date (evita el desfase de zona horaria en el día 1/31).
        return Number(s.fechaNacimiento.slice(5, 7)) - 1 === mesActual;
      });
    }

    case 'TODAS':
    default: return socios;
  }
}
