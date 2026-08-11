// ─────────────────────────────────────────────────────────────────────────────
// Comprobaciones de salud de los flujos críticos (SERVER-ONLY).
//
// Qué es esto y qué NO es. No mira si el servidor responde —para eso está
// /api/health— sino si el sistema ha HECHO lo que tenía que hacer. La diferencia
// importa: los fallos que ha tenido este producto no han sido caídas, han sido
// cosas que se quedaron a medias sin que nadie se enterara (un cobro sin
// entregar, una notificación que no salió, un truncado silencioso a 1.000
// filas). Un "200 OK" no dice nada de ninguna de las tres.
//
// Cada comprobación es un INVARIANTE: algo que en un sistema sano vale cero.
// Todas se eligieron con el mismo criterio —que su valor > 0 signifique algo
// concreto y accionable, no "revisa los logs"— y se contrastaron contra
// producción antes de escribirlas, para no meter ninguna que nazca en rojo por
// ruido. Todas daban 0 salvo `webhooks-sin-completar`, que daba 2 y resultó ser
// un problema real (ver su nota).
//
// Muchas son además DETECTORES DE CRON MUERTO: si un cron deja de ejecutarse,
// su invariante empieza a crecer solo. Eso cubre el hueco de "el cron falló y
// nadie lo supo", que no se ve en Sentry porque no hay excepción — simplemente
// no pasa nada.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';

export type EstadoSalud = 'ok' | 'aviso' | 'fallo';

export interface Comprobacion {
  id: string;
  /** Qué mide, en lenguaje de negocio. */
  que: string;
  /** Qué le pasa a una persona real si esto está en rojo. */
  impacto: string;
  estado: EstadoSalud;
  valor: number;
  umbralAviso: number;
  umbralFallo: number;
  error?: string;
}

function clasificar(valor: number, umbralAviso: number, umbralFallo: number): EstadoSalud {
  if (valor >= umbralFallo) return 'fallo';
  if (valor >= umbralAviso) return 'aviso';
  return 'ok';
}

interface Definicion {
  id: string;
  que: string;
  impacto: string;
  umbralAviso: number;
  umbralFallo: number;
  contar: (admin: SupabaseClient, ahora: Date) => PromiseLike<{ count: number | null; error: { message: string } | null }>;
}

const menos = (ahora: Date, minutos: number) => new Date(ahora.getTime() - minutos * 60_000).toISOString();

export const DEFINICIONES: Definicion[] = [
  {
    id: 'reservas-pendientes-sin-expirar',
    que: 'Reservas pendientes de aprobación cuya clase ya empezó hace más de 15 minutos.',
    impacto:
      'La socia no recibe el aviso de que su plaza decayó. La corrección está a salvo (la guardia vive en la RPC), ' +
      'pero que esto crezca significa que el cron de reservas pendientes no está corriendo.',
    umbralAviso: 1,
    umbralFallo: 10,
    contar: (admin, ahora) => admin
      .from('reservas')
      .select('id, sesiones!inner(inicio)', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE_APROBACION')
      .lte('sesiones.inicio', menos(ahora, 15)),
  },
  {
    id: 'ofertas-lista-espera-sin-expirar',
    que: 'Ofertas de plaza de lista de espera caducadas hace más de 15 minutos y sin resolver.',
    impacto:
      'La plaza se queda bloqueada por alguien que ya no puede aceptarla, y la siguiente de la cola no llega a ' +
      'enterarse de que había hueco. Indica que el cron de ofertas no está corriendo.',
    umbralAviso: 1,
    umbralFallo: 10,
    contar: (admin, ahora) => admin
      .from('reservas')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'LISTA_ESPERA')
      .not('oferta_expira_en', 'is', null)
      .lte('oferta_expira_en', menos(ahora, 15)),
  },
  {
    id: 'webhooks-sin-completar',
    que: 'Eventos de Stripe reclamados hace más de 1 hora y nunca marcados como procesados.',
    impacto:
      'Cada uno es un pago que el webhook empezó a procesar y no terminó: la socia pagó y puede no haber recibido ' +
      'su bono. Lo rescata el conciliador, pero esto es la señal de que el camino principal está roto.',
    // ⚠️ Nace en AVISO a propósito, no en verde: al escribir esto había 2 filas
    // reales, ambas del ámbito `connect:` (el que entrega el bono), atascadas
    // desde el 9-ago. Sus gemelas `billing:` sí completaron. La causa está
    // localizada: `app/api/stripe/webhook/route.ts` devuelve 403 cuando la
    // cuenta Connect no cuadra con `metadata.studioId`, y ese `return` NO marca
    // el evento como procesado — así que Stripe reintenta, vuelve a dar 403, y
    // el evento se queda en `procesando` para siempre. Ver C-1 del informe.
    umbralAviso: 1,
    umbralFallo: 5,
    contar: (admin, ahora) => admin
      .from('webhook_events')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'procesando')
      .lte('reclamado_en', menos(ahora, 60)),
  },
  {
    id: 'penalizaciones-atascadas',
    que: 'Penalizaciones detectadas hace más de 1 hora que siguen sin procesarse.',
    impacto:
      'O no se está cobrando lo que la propietaria configuró, o no se le está pidiendo su aprobación. ' +
      'Su cron corre cada 10 minutos, así que pasada 1 hora ya son 6 tics perdidos.',
    umbralAviso: 1,
    umbralFallo: 10,
    contar: (admin, ahora) => admin
      .from('penalizaciones')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'DETECTADA')
      .lte('detectada_en', menos(ahora, 60)),
  },
  {
    id: 'recibos-cobrados-sin-fecha',
    que: 'Recibos en estado COBRADO sin fecha de cobro.',
    impacto:
      'Estado incoherente en el histórico de dinero: la contabilidad y el cierre para la gestoría cuadran mal. ' +
      'No debería poder existir ni uno.',
    // Cualquier fila aquí es un fallo, no un aviso: no hay un "poco incoherente".
    umbralAviso: 1,
    umbralFallo: 1,
    contar: (admin) => admin
      .from('recibos')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'COBRADO')
      .is('fecha_cobro', null),
  },
];

export interface InformeSalud {
  estado: EstadoSalud;
  comprobadoEn: string;
  comprobaciones: Comprobacion[];
}

// El peor estado manda: un solo fallo pone el conjunto en fallo.
function peor(estados: EstadoSalud[]): EstadoSalud {
  if (estados.includes('fallo')) return 'fallo';
  if (estados.includes('aviso')) return 'aviso';
  return 'ok';
}

export async function comprobarFlujos(admin: SupabaseClient, ahora = new Date()): Promise<InformeSalud> {
  const comprobaciones = await Promise.all(
    DEFINICIONES.map(async (d): Promise<Comprobacion> => {
      const base = { id: d.id, que: d.que, impacto: d.impacto, umbralAviso: d.umbralAviso, umbralFallo: d.umbralFallo };
      try {
        const { count, error } = await d.contar(admin, ahora);
        if (error) {
          // Una comprobación que no se puede ejecutar NO es "ok". Se marca como
          // fallo: no saber si algo está roto es un problema por sí mismo, y
          // tragárselo aquí sería el mismo error que esto viene a detectar.
          return { ...base, estado: 'fallo', valor: -1, error: error.message };
        }
        const valor = count ?? 0;
        return { ...base, estado: clasificar(valor, d.umbralAviso, d.umbralFallo), valor };
      } catch (e) {
        return { ...base, estado: 'fallo', valor: -1, error: e instanceof Error ? e.message : 'error desconocido' };
      }
    }),
  );

  return {
    estado: peor(comprobaciones.map(c => c.estado)),
    comprobadoEn: ahora.toISOString(),
    comprobaciones,
  };
}
