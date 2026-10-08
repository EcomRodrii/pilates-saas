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
// Relativo y con `.ts` explícita: el alias `@/` no lo resuelve el runner de
// `node --test`, y este módulo sí tiene test unitario propio (salud.test.ts).
import { PREFIJO_RESERVA_WEB } from '../lista-espera/esperas-sin-plaza.ts';

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

// La misma ventana que barre `barrerEsperasSinPlaza` (VENTANA_NO_SHOWS_DIAS, el
// cron del que cuelga). Duplicada aquí y no importada porque ese módulo es
// `server-only` con medio repo detrás, y esto solo necesita un número.
const VENTANA_ESPERAS_DIAS = 30;

/**
 * Penalizaciones RECIBO_CREADO con el recibo sin programar. Exportado porque el
 * cron de penalizaciones la cuenta también en cada pasada y manda el número a
 * Sentry (sin cron nuevo: Inngest va cerca del límite del plan).
 */
export const ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR = 'penalizaciones-recibo-sin-programar';

/**
 * Penalizaciones COBRADA con el recibo DEVUELTO. Exportado por lo mismo que la
 * de arriba: el cron de penalizaciones la cuenta en cada pasada, DESPUÉS de su
 * barrido, y manda el número a Sentry.
 */
export const ID_PENALIZACIONES_COBRADAS_SIN_DINERO = 'penalizaciones-cobradas-con-recibo-devuelto';

/**
 * Qué mandar a Sentry con el resultado de una comprobación. `null` = en verde,
 * nada que mandar. Solo el número y el id de la comprobación: nunca filas, ids
 * de socias ni de estudios. Mensaje estable para que Sentry agrupe en un issue.
 */
export function avisoParaSentry(
  d: { id: string; umbralAviso: number; umbralFallo: number },
  r: { count: number | null; error: { message: string } | null },
): { nivel: 'warning' | 'error'; mensaje: string; extra: { comprobacion: string; valor: number; error?: string } } | null {
  const mensaje = `[salud] ${d.id}`;
  // Igual que en `comprobarFlujos`: no poder contar es un fallo, no un verde.
  if (r.error) return { nivel: 'error', mensaje, extra: { comprobacion: d.id, valor: -1, error: r.error.message } };
  const valor = r.count ?? 0;
  const estado = clasificar(valor, d.umbralAviso, d.umbralFallo);
  if (estado === 'ok') return null;
  return { nivel: estado === 'fallo' ? 'error' : 'warning', mensaje, extra: { comprobacion: d.id, valor } };
}

/**
 * Denuncias de la app que ya le tocan a Tentare (contra el estudio, o el estudio
 * no las revisó en 24 h) y siguen sin decidir. Las 24 h son las de
 * `HORAS_REVISION_ESTUDIO` (lib/moderacion/reglas.ts): duplicadas como número
 * por lo mismo que `VENTANA_ESPERAS_DIAS`; un test las ata.
 */
export const ID_DEVOLUCION_POS_SIN_REFLEJAR = 'devolucion-pos-sin-reflejar-en-recibo';
export const ID_DENUNCIAS_ESPERANDO_A_TENTARE = 'denuncias-esperando-a-tentare';
/** Las mismas, con más de 48 h desde que se hicieron: tampoco las ha revisado Tentare. */
export const ID_DENUNCIAS_SIN_REVISAR_48H = 'denuncias-sin-revisar-48h';
const HORAS_REVISION_ESTUDIO = 24;

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
    id: 'esperas-pagadas-sin-cerrar',
    que: 'Reservas PAGADAS desde el widget que siguen en lista de espera con la clase ya terminada hace más de un día.',
    impacto:
      'Cada una es alguien que pagó, nunca entró en la clase y no ha recibido el aviso de que su dinero sigue ' +
      'disponible — justo el correo que la pantalla de pago le prometió. Indica que el barrido de esperas del cron ' +
      'de no-shows (diario, 23:00) no está corriendo.',
    umbralAviso: 1,
    umbralFallo: 5,
    // ⚠️ Mide EXACTAMENTE el conjunto que `barrerEsperasSinPlaza` puede vaciar,
    // no uno mayor: una fila fuera de su ventana de 30 días, o de una clase
    // cancelada, sería una luz roja que ningún barrido podría apagar nunca.
    // Por eso repite sus tres filtros (prefijo, no cancelada, ventana) y toma
    // el prefijo de la MISMA constante, no de un literal copiado.
    contar: (admin, ahora) => admin
      .from('reservas')
      .select('id, sesiones!inner(fin, cancelada)', { count: 'exact', head: true })
      .eq('estado', 'LISTA_ESPERA')
      // Solo el camino del dinero: una espera sin pago detrás no es un problema.
      .like('id', `${PREFIJO_RESERVA_WEB}%`)
      .eq('sesiones.cancelada', false)
      .gte('sesiones.fin', new Date(ahora.getTime() - VENTANA_ESPERAS_DIAS * 86_400_000).toISOString())
      // Un día entero de margen: el barrido es diario, así que una clase que
      // terminó hace tres horas todavía no ha tenido su turno.
      .lte('sesiones.fin', menos(ahora, 24 * 60)),
  },
  {
    id: 'webhooks-sin-completar',
    que: 'Eventos de Stripe reclamados hace más de 1 hora y nunca marcados como procesados.',
    impacto:
      'Cada uno es un pago que el webhook empezó a procesar y no terminó: la socia pagó y puede no haber recibido ' +
      'su bono. Si era una ENTREGA de plan o recibo, lo rescata el conciliador. Si era un reembolso, una disputa, ' +
      'un cobro SEPA o un fallo de pago, NO lo rescata nadie: reenvía el evento a mano desde el Dashboard de Stripe.',
    // ⚠️ Nace en AVISO a propósito, no en verde: al escribir esto había 2 filas
    // reales, ambas del ámbito `connect:` (el que entrega el bono), atascadas
    // desde el 9-ago. Sus gemelas `billing:` sí completaron. La causa está
    // localizada: `app/api/stripe/webhook/route.ts` devuelve 403 cuando la
    // cuenta Connect no cuadra con `metadata.studioId`, y ese `return` NO marca
    // el evento como procesado — pero STRIPE NO REINTENTA (responde 200 antes de
    // procesar en after()). El evento se queda en `procesando` para siempre y
    // solo lo rescata el conciliador (I-5). Ver C-1 del informe.
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
    id: ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR,
    que: 'Penalizaciones con el cobro ya decidido (RECIBO_CREADO: cobro automático, o un adeudo que falló y se reintenta) detectadas hace más de 1 hora cuyo recibo sigue PENDIENTE sin reintento programado.',
    impacto:
      'Nadie las va a cobrar ni a reintentar: el cron de penalizaciones solo mira las DETECTADA y el dunning solo cobra ' +
      'recibos con reintento programado. Pasa si el proceso murió entre enlazar el recibo y programarlo, si no se pudo ' +
      'confirmar que el recibo quedaba sin programar, o si ni siquiera se pudo devolver la penalización a DETECTADA. ' +
      'Revisa el recibo en Cobros: cóbralo o anúlalo.',
    // Una fila ya es aviso: en un sistema sano esto vive milisegundos (entre
    // enlazar y armar dentro de la misma pasada), nunca una hora.
    umbralAviso: 1,
    umbralFallo: 5,
    // Desde `detectada_en` y no desde el recibo: `recibos` no guarda cuándo se
    // creó. Detectada hace más de 1 h y aún así sin programar ya no es tránsito.
    contar: (admin, ahora) => admin
      .from('penalizaciones')
      .select('id, recibos!inner(estado, proximo_reintento)', { count: 'exact', head: true })
      .eq('estado', 'RECIBO_CREADO')
      .eq('recibos.estado', 'PENDIENTE')
      .is('recibos.proximo_reintento', null)
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
  {
    id: ID_PENALIZACIONES_COBRADAS_SIN_DINERO,
    que: 'Penalizaciones COBRADA cuyo recibo está DEVUELTO.',
    impacto:
      'La liquidación de la instructora suma toda penalización COBRADA, así que le está imputando un dinero que ya ' +
      'volvió a la socia (reembolso, disputa perdida o recibo marcado como devuelto). Si la nómina se paga así, se le ' +
      'paga de más. Revisa la penalización y la liquidación de ese mes antes de pagarla.',
    // Una fila ya es fallo: quien marca el recibo DEVUELTO pone al día la
    // penalización en la misma petición (`marcarPenalizacionReembolsada`), así
    // que esto no tiene tránsito que esperar. Y el cron la cuenta después de su
    // barrido: si aun así queda alguna, no la ha arreglado nadie.
    umbralAviso: 1,
    umbralFallo: 1,
    contar: (admin) => admin
      .from('penalizaciones')
      .select('id, recibos!inner(estado)', { count: 'exact', head: true })
      .eq('estado', 'COBRADA')
      .eq('recibos.estado', 'DEVUELTO'),
  },
  {
    id: 'ledger-no-concilia',
    que: 'Bonos o recuperaciones cuyo saldo ya no coincide con la suma de sus movimientos en el ledger de derechos.',
    impacto:
      'El saldo de una alumna se movió sin que el ledger lo explique (o el ledger no pudo anotarlo), y a partir de ahí ' +
      '«¿por qué tiene estas sesiones?» ya no tiene respuesta fiable. En esta fase el ledger va en sombra y no cambia ' +
      'ningún saldo: no se pierde ninguna sesión, pero hay que mirar qué camino lo causó (los movimientos sin ' +
      'contexto, `AJUSTE_SIN_CONTEXTO`, lo dicen) antes de que el ledger pase a mandar.',
    // Un solo descuadre ya es un fallo: el ledger suma el saldo POR CONSTRUCCIÓN (un trigger sobre cada cambio de
    // saldo), así que no hay tránsito que esperar. Vale 0 salvo que un trigger haya fallado.
    umbralAviso: 1,
    umbralFallo: 1,
    contar: (admin) => admin
      .from('ledger_conciliacion')
      .select('derecho_id', { count: 'exact', head: true }),
  },
  {
    id: ID_DEVOLUCION_POS_SIN_REFLEJAR,
    que: 'Ventas del TPV devueltas por entero cuyo recibo sigue COBRADO.',
    impacto:
      'El dinero se devolvió en la caja, pero el recibo de la alumna sigue contando como ingreso: las cifras de Cobros y ' +
      'Finanzas suman un ingreso que ya no existe. El trigger que lo refleja traga sus errores a propósito (no puede tumbar ' +
      'la devolución, que ya salió), así que sin esta comprobación el fallo solo quedaría como un aviso en el log de ' +
      'Postgres. Se arregla mirando el recibo y devolviéndolo desde Cobros.',
    umbralAviso: 1,
    umbralFallo: 1,
    // Dos consultas y no un embed: `ventas_pos.recibo_id` no tiene clave foránea hacia `recibos`. Acotada a los últimos 60 días
    // y a 1.000 ventas: una devolución sin reflejar no caduca sola, pero esto solo busca las recientes.
    contar: async (admin, ahora) => {
      const { data: ventas, error } = await admin
        .from('ventas_pos')
        .select('recibo_id')
        .not('devuelta_en', 'is', null)
        .not('recibo_id', 'is', null)
        .gte('devuelta_en', menos(ahora, 60 * 24 * 60))
        .limit(1000);
      if (error) return { count: null, error };
      const ids = [...new Set((ventas ?? []).map(v => v.recibo_id as string))];
      if (ids.length === 0) return { count: 0, error: null };
      return admin.from('recibos').select('id', { count: 'exact', head: true }).in('id', ids).eq('estado', 'COBRADO');
    },
  },
  {
    id: ID_DENUNCIAS_ESPERANDO_A_TENTARE,
    que: 'Denuncias de la app que ya le tocan a Tentare (van contra el propio estudio, o el estudio no las revisó en 24 h) y siguen sin decidir.',
    impacto:
      'Una alumna o una instructora denunció un mensaje o un comentario y nadie lo ha mirado: el contenido sigue a la ' +
      'vista y quien denunció no sabe nada. Apple exige actuar sobre una denuncia en 24 h (guía 1.2); se revisan en ' +
      '/interno/denuncias.',
    umbralAviso: 1,
    umbralFallo: 5,
    contar: (admin, ahora) => admin
      .from('denuncias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE')
      .or(`destino.eq.TENTARE,creada_en.lte.${menos(ahora, HORAS_REVISION_ESTUDIO * 60)}`),
  },
  {
    id: ID_DENUNCIAS_SIN_REVISAR_48H,
    que: 'Denuncias de la app sin decidir más de 48 horas después de hacerse: ni el estudio ni Tentare las han revisado.',
    impacto:
      'Ya se ha pasado el plazo que se promete a quien denuncia y el que pide Apple para la app (guía 1.2). Una sola ' +
      'basta para que la revisión de la App Store lo tome como moderación que no funciona.',
    umbralAviso: 1,
    umbralFallo: 1,
    contar: (admin, ahora) => admin
      .from('denuncias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'PENDIENTE')
      .lte('creada_en', menos(ahora, 48 * 60)),
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
