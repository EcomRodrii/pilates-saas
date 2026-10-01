import type { Socio, Suscripcion, Recibo, DestinatariosCampana } from '@/lib/types';
import { cumpleMesDia } from '../socios/datos-privados.ts';
import { situacionRecibo } from '../billing/situacion-recibo.ts';
import { ETIQUETA_ESTADO, estadosDeEtapa, type EstadoClienta, type ResultadoEstado } from '../clientas/estado.ts';

const MS_DIA = 86400000;

// Ventana fija para "bono próximo a caducar" — a propósito NO es la ventana
// adaptativa por ritmo real de F3 (lib/decision/especialistas/finanzas.ts):
// esa responde "avisa a la propietaria de ESTA socia concreta como insight
// accionable", esto responde "quién entra en un SEGMENTO para una campaña
// masiva" — sin index de reservas/frecuencia por socia, mismo suelo (14
// días) que ya usa F3 como mínimo seguro. Ver
// docs/marketing-integrations-arquitectura.md §4/§6.
const DIAS_BONO_CADUCA_PRONTO = 14;

// ─── Cómo se LLAMAN estos segmentos en pantalla ─────────────────────────────
//
// Vive aquí, junto a la función que los resuelve, y no suelto en el JSX de cada
// pantalla: el selector de audiencia del Feed de Comunidad enseñaba
// `BONO_CADUCA_PRONTO` tal cual —el nombre del enum— a la propietaria, y
// /marketing tenía su propia lista de <option> escrita a mano que ya podía
// divergir de esta.
//
// `descripcion` no es decoración: "Con bono" no dice a quién le llega el post y
// "Quien tiene un plan o bono activo ahora mismo" sí. Es la diferencia entre
// elegir a ciegas y elegir.
export const SEGMENTOS_AUDIENCIA: {
  id: DestinatariosCampana; etiqueta: string; descripcion: string;
}[] = [
  { id: 'TODAS', etiqueta: 'Todas', descripcion: 'Cualquier clienta de tu ficha, esté activa o no' },
  // Las cuatro siguientes cuentan con el ESTADO de cada clienta (el mismo que
  // enseña Clientas): «activas» son sus «Activa», no «las que no están de baja».
  { id: 'ACTIVAS', etiqueta: 'Solo socias activas', descripcion: 'Las que pueden reservar con su plan o han venido en el último mes' },
  { id: 'INACTIVAS', etiqueta: 'Las que se enfriaron', descripcion: 'Sin renovar, inactivas o dadas de baja' },
  { id: 'SIN_PLAN', etiqueta: 'Sin plan ni bono', descripcion: 'No tienen ningún plan ni bono con el que reservar ahora mismo' },
  { id: 'BONO', etiqueta: 'Con plan o bono', descripcion: 'Pueden reservar ahora mismo con un plan o bono' },
  { id: 'VIP', etiqueta: 'VIP', descripcion: 'Las que has marcado con la etiqueta VIP' },
  { id: 'BONO_CADUCA_PRONTO', etiqueta: 'Se les caduca el bono', descripcion: 'Les quedan sesiones y menos de 14 días' },
  { id: 'PAGO_FALLIDO', etiqueta: 'Con un pago fallido', descripcion: 'Tienen algún recibo sin cobrar' },
  { id: 'CUMPLE_ESTE_MES', etiqueta: 'Cumpleañeras del mes', descripcion: 'Cumplen años este mes' },
];

// ─── Segmentos con parámetro ────────────────────────────────────────────────
//
// `ETAPA:<estado>` y `ETIQUETA:<tag>`. No son un segment builder genérico
// (ver el corte del §4 del documento de arquitectura): son las DOS formas de
// elegir destinatarias que la pantalla de Mensajería ya ofrecía por su cuenta,
// mandando los emails uno a uno desde el navegador —sin filtro de
// consentimiento, sin enlace de baja y sin quedar registrado—. Al unificar esa
// pantalla con el motor de campañas había que traérselas, no tirarlas.

/** «ETAPA:EN_RIESGO» → 'EN_RIESGO'. `null` si no es de esa forma. */
export function etapaDeSegmento(id: DestinatariosCampana): string | null {
  return id.startsWith('ETAPA:') ? id.slice('ETAPA:'.length) : null;
}

/** «ETIQUETA:VIP» → 'VIP'. `null` si no es de esa forma. */
export function etiquetaDeSegmento(id: DestinatariosCampana): string | null {
  return id.startsWith('ETIQUETA:') ? id.slice('ETIQUETA:'.length) : null;
}

// `ETAPA:<x>` lleva hoy un ESTADO (Activa, De prueba…). Las campañas guardadas
// con la etapa antigua (`lead_stage`) se siguen entendiendo: `estadosDeEtapa`
// las traduce (LEAD → Interesada, PRUEBA → De prueba, PERDIDA → Inactiva o De
// baja); «En riesgo» no tiene equivalente y se sigue leyendo de la columna.
const ETAPAS_ANTIGUAS_LEGIBLES: Record<string, string> = {
  LEAD: 'Interesada',
  PRUEBA: 'De prueba',
  PERDIDA: 'Inactiva o de baja',
  EN_RIESGO: 'En riesgo (marcada a mano)',
};

/** La etiqueta humana de un segmento; el propio código si alguna vez no está. */
export function etiquetaSegmento(id: DestinatariosCampana): string {
  const etapa = etapaDeSegmento(id);
  if (etapa) return `Estado: ${ETIQUETA_ESTADO[etapa as EstadoClienta] ?? ETAPAS_ANTIGUAS_LEGIBLES[etapa] ?? etapa}`;
  const tag = etiquetaDeSegmento(id);
  if (tag) return `Etiqueta: ${tag}`;
  return SEGMENTOS_AUDIENCIA.find(s => s.id === id)?.etiqueta ?? id;
}

// Resuelve las destinatarias de una campaña a partir de su segmento. Pura y
// compartida entre cliente (lib/studio-context.tsx, para el recuento
// inmediato) y servidor (lib/inngest/campanas.ts, para el envío real) — antes
// vivía solo en el cliente, y el envío server-side habría tenido que
// reimplementar el mismo criterio por separado, con riesgo de divergir en
// silencio. Ver docs/marketing-integrations-arquitectura.md §5.
/**
 * ¿Hace falta el estado de cada clienta para resolver este segmento? Así quien
 * llama solo lo calcula cuando hace falta (la app de la socia, en cada carga).
 */
export function segmentoNecesitaEstado(destinatarios: DestinatariosCampana): boolean {
  return etapaDeSegmento(destinatarios) !== null
    || destinatarios === 'ACTIVAS' || destinatarios === 'INACTIVAS'
    || destinatarios === 'SIN_PLAN' || destinatarios === 'BONO';
}

const SE_ENFRIARON = new Set<EstadoClienta>(['SIN_RENOVAR', 'INACTIVA', 'DE_BAJA']);

export function resolverDestinatariasCampana(
  destinatarios: DestinatariosCampana,
  datos: {
    socios: Socio[];
    suscripciones: Suscripcion[];
    recibos?: Recibo[];
    /**
     * El estado de cada clienta (lib/clientas/estado.ts). Obligatorio a
     * propósito: sin él, «activas» volvía a significar «las que no están de
     * baja». `null` solo si quien llama sabe que su segmento no lo usa
     * (`segmentoNecesitaEstado`); si aun así lo usa, no resuelve a NADIE —
     * nunca a quien no toca.
     */
    estados: ReadonlyMap<string, ResultadoEstado> | null;
  },
  now: Date = new Date(),
): Socio[] {
  const { socios, recibos = [], estados } = datos;
  const estadoDe = (s: Socio) => estados?.get(s.id);

  // Los dos con parámetro van ANTES del switch: no son valores del enum, así
  // que el `default` los trataría como TODAS — mandar una campaña pensada para
  // seis personas «En riesgo» a las 300 socias del estudio.
  const etapa = etapaDeSegmento(destinatarios);
  if (etapa) {
    const queEstados = estadosDeEtapa(etapa);
    // «En riesgo» se marcaba a mano y no tiene estado: se sigue leyendo de la columna.
    if (queEstados === 'COLUMNA_LEGADA') return socios.filter(s => s.leadStage === etapa);
    if (!estados) return [];
    return socios.filter(s => { const e = estadoDe(s); return !!e && queEstados.has(e.estado); });
  }
  const tag = etiquetaDeSegmento(destinatarios);
  if (tag) return socios.filter(s => (s.tags ?? []).includes(tag));

  if (segmentoNecesitaEstado(destinatarios) && !estados) return [];
  switch (destinatarios) {
    case 'ACTIVAS': return socios.filter(s => estadoDe(s)?.estado === 'ACTIVA');
    case 'INACTIVAS': return socios.filter(s => { const e = estadoDe(s); return !!e && SE_ENFRIARON.has(e.estado); });
    // «Con plan o bono» = puede reservar ahora mismo con alguno (incluida su
    // prueba): la misma regla que decide si reserva, no «tiene una fila ACTIVA».
    case 'SIN_PLAN': return socios.filter(s => estadoDe(s)?.derecho !== true);
    case 'BONO': return socios.filter(s => estadoDe(s)?.derecho === true);
    case 'VIP': return socios.filter(s => s.tags?.includes('VIP'));

    case 'BONO_CADUCA_PRONTO': {
      const { suscripciones } = datos;
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
      // Impagado: rechazado o devuelto por el banco (lib/billing/situacion-recibo.ts).
      const idsPagoFallido = new Set(recibos.filter(r => situacionRecibo(r) === 'IMPAGADO').map(r => r.socioId));
      return socios.filter(s => idsPagoFallido.has(s.id));
    }

    case 'CUMPLE_ESTE_MES': {
      const mesActual = now.getUTCMonth();
      return socios.filter(s => {
        // 'MM-DD' sin año: es lo único que ve un MANAGER (M1 RGPD, la fecha
        // completa llega `null`). Mes por índice de string, sin pasar por Date
        // (evita el desfase de zona horaria en el día 1/31).
        const md = cumpleMesDia(s);
        return md !== null && Number(md.slice(0, 2)) - 1 === mesActual;
      });
    }

    case 'TODAS':
    default: return socios;
  }
}
