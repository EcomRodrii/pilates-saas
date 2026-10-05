import type { EstadoPagoPOS } from './tipos.ts';
import { entornoDespliegue } from '../billing/modo-stripe.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El datáfono SumUp Solo (Cloud API de SumUp): las reglas y el cliente HTTP.
//
// Decisión del fundador (4-oct-2026): después del datáfono de Stripe, SumUp. «En
// la Caja pulsas Cobrar, eliges Datáfono, el SumUp Solo pide la tarjeta y la venta
// queda cobrada sola, con el dinero en la cuenta de SumUp del estudio».
//
// Este módulo no toca la base de datos ni decide nada del cobro: traduce. Lo usan
// (en PRs siguientes) la Caja, el aviso de SumUp y el barrido de cobros pendientes.
//
// ⚠️ La referencia de un cobro de SumUp EN VUELO se guarda en las MISMAS columnas
// que la de Stripe (`recibos.cobro_mostrador_pi`, `ventas_pos.stripe_payment_intent_id`)
// con el prefijo `sumup:`. Es a propósito: diez guardas del repo miran esas
// columnas para saber que «hay un cobro en marcha», y una columna aparte habría
// que repetirla en todas (olvidar una es un doble cobro). El código que todavía
// no distinga el prefijo llama a Stripe con un id ajeno y FALLA, que es fallar
// cerrado. Quién es quién lo dice `proveedorDeReferencia`, nunca la configuración
// actual del estudio: si cambia de datáfono con un cobro en vuelo, el cobro viejo
// se sigue preguntando a quien lo empezó.
// ─────────────────────────────────────────────────────────────────────────────

export const PREFIJO_SUMUP = 'sumup:';

/**
 * SumUp da al cobro un minuto para empezar en el datáfono. Sin transacción pasado
 * ese minuto y un margen, el cobro no llegó a empezar.
 */
export const SEGUNDOS_PARA_EMPEZAR = 60;
const SEGUNDOS_DE_MARGEN = 60;

/** `sumup:<segundos epoch>:<client_transaction_id>`: quién cobra, desde cuándo y con qué id. */
export function referenciaSumup(clientTransactionId: string, emitidaEn: Date): string {
  return `${PREFIJO_SUMUP}${Math.floor(emitidaEn.getTime() / 1000)}:${clientTransactionId}`;
}

export function leerReferenciaSumup(ref: string | null | undefined): { emitidaEn: Date; clientTransactionId: string } | null {
  if (!ref?.startsWith(PREFIJO_SUMUP)) return null;
  const m = /^sumup:(\d{9,11}):([A-Za-z0-9-]{8,64})$/.exec(ref);
  if (!m) return null;
  return { emitidaEn: new Date(Number(m[1]) * 1000), clientTransactionId: m[2] };
}

/**
 * Fuera de producción, SumUp no cobra salvo que se active a propósito para probar
 * con una cuenta de prueba (`SUMUP_PERMITIR_FUERA_DE_PRODUCCION=1`). Es el mismo
 * miedo que `comprobarModoStripe`: un `npm run dev` con las variables de producción
 * copiadas mandaría cobros al datáfono real de un estudio. SumUp no tiene claves
 * «de test» que lo delaten: la cuenta de pruebas es una cuenta más.
 */
export function sumupPuedeCobrarAqui(env: NodeJS.ProcessEnv = process.env): boolean {
  return entornoDespliegue(env) === 'produccion' || env.SUMUP_PERMITIR_FUERA_DE_PRODUCCION === '1';
}

/**
 * ¿Se ofrece SumUp a ESTE estudio? Hasta probarlo con el Solo de prueba, solo a
 * los que se pongan en `SUMUP_SOLO_ESTUDIOS` (ids separados por comas, o `*` para
 * todos). Sin la variable, a nadie. Solo decide si se puede CONECTAR: un estudio
 * que ya tiene su Solo sigue cobrando con él.
 */
export function sumupParaEstudio(studioId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const lista = (env.SUMUP_SOLO_ESTUDIOS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  return lista.includes('*') || lista.includes(studioId);
}

/** Por qué no se pudo conectar la cuenta de SumUp (viaja en la URL de vuelta como código). */
export type FalloConexionSumup = 'cancelado' | 'caducado' | 'cobro-en-marcha' | 'no-disponible' | 'fallo';

/**
 * El texto de cada fallo. Fijo: lo que llegue en la URL de vuelta nunca se enseña
 * tal cual (cualquiera puede mandar un enlace al panel con el texto que quiera).
 */
export function textoFalloConexionSumup(codigo: string | null): string {
  switch (codigo) {
    case 'cancelado': return 'Has cancelado la conexión en SumUp. Puedes volver a intentarlo cuando quieras.';
    case 'caducado': return 'La conexión con SumUp ha caducado. Vuelve a pulsar «Conectar mi cuenta de SumUp».';
    case 'cobro-en-marcha': return 'Hay un cobro en marcha con el datáfono de SumUp. Cuando termine, vuelve a conectar la cuenta.';
    case 'no-disponible': return 'El datáfono de SumUp todavía no está disponible para tu estudio.';
    default: return 'No se ha podido conectar la cuenta de SumUp. Inténtalo de nuevo.';
  }
}

/**
 * Los permisos que Tentare pide a la cuenta de SumUp del estudio. Tienen que estar
 * también marcados en la app OAuth de Tentare en SumUp (Ajustes → Para
 * desarrolladores → Aplicaciones de OAuth2 → Acceso a datos):
 *  · `payments`: cobrar y devolver. Restringido: SumUp lo aprueba a mano.
 *  · `readers.read` / `readers.write`: ver el Solo y emparejarlo. Sin ellos no hay
 *    forma de conectar el datáfono (lo vimos al dar de alta la app, 5-oct-2026).
 *  · `transactions.history`: leer el resultado de los cobros y el historial.
 *  · `user.profile_readonly`: el código y el nombre del comercio.
 */
export const SCOPES_SUMUP = ['payments', 'readers.read', 'readers.write', 'transactions.history', 'user.profile_readonly'] as const;

export type ProveedorDeReferencia = 'sumup' | 'stripe';

/** Quién cobra lo que hay guardado. `null` = no hay cobro en vuelo. */
export function proveedorDeReferencia(ref: string | null | undefined): ProveedorDeReferencia | null {
  if (!ref) return null;
  return ref.startsWith(PREFIJO_SUMUP) ? 'sumup' : 'stripe';
}

/**
 * ¿Dos referencias son el MISMO cobro? Dos `sumup:` lo son si llevan el mismo
 * `client_transaction_id`, aunque se armaran en momentos distintos (la fecha es
 * de cuándo se guardó, no del cobro). Las demás, si son iguales.
 */
export function mismoCobro(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ra = leerReferenciaSumup(a);
  const rb = leerReferenciaSumup(b);
  if (ra && rb) return ra.clientTransactionId === rb.clientTransactionId;
  return a === b;
}

/** La clave con la que un cobro de SumUp se anota para reconciliar: una por transacción. */
export function claveReconciliacionSumup(transaccionId: string): string {
  return `sumup-txn:${transaccionId}`;
}

// ── Lo que devuelve SumUp ────────────────────────────────────────────────────

/** `GET /v2.1/merchants/{mc}/transactions`. `amount` viene en EUROS (decimal), no en céntimos. */
export interface TransaccionSumup {
  id: string;
  transaction_code?: string | null;
  amount: number;
  currency: string;
  status: string;
  client_transaction_id?: string | null;
  foreign_transaction_id?: string | null;
  /** La propina, si la hubo. Va DENTRO de `amount`. */
  tip_amount?: number | null;
  timestamp?: string | null;
  /** Lo que le ha pasado después (devoluciones, abonos…). `transaction_events` es el mismo dato. */
  events?: EventoTransaccionSumup[] | null;
  transaction_events?: EventoTransaccionSumup[] | null;
  /** SUCCESSFUL, PAID_OUT, REFUNDED, CHARGEBACK, NON_COLLECTION… */
  simple_status?: string | null;
}

/** `events[]` lo llama `type`; `transaction_events[]`, `event_type`. */
export interface EventoTransaccionSumup { type?: string | null; event_type?: string | null; amount?: number | null; status?: string | null }

function eventosDe(t: Pick<TransaccionSumup, 'events' | 'transaction_events'>): EventoTransaccionSumup[] | null {
  if (Array.isArray(t.events)) return t.events;
  if (Array.isArray(t.transaction_events)) return t.transaction_events;
  return null;
}
const tipoDe = (e: EventoTransaccionSumup) => e?.type ?? e?.event_type ?? null;

/**
 * Cuánto lleva devuelto la transacción SEGÚN SUMUP, en céntimos: sus eventos de
 * tipo REFUND que no fallaron (uno pendiente ya cuenta: el dinero está saliendo).
 * `null` = la respuesta no trae eventos: NO es «cero devuelto», es que no se sabe,
 * y quien llama no debe devolver nada.
 */
export function centimosDevueltosSumup(t: Pick<TransaccionSumup, 'events' | 'transaction_events'>): number | null {
  const eventos = eventosDe(t);
  if (!eventos) return null;
  return eventos
    .filter(e => tipoDe(e) === 'REFUND' && e.status !== 'FAILED' && typeof e.amount === 'number' && Number.isFinite(e.amount))
    .reduce((s, e) => s + Math.round(Math.abs(e.amount as number) * 100), 0);
}

/** ¿La clienta reclamó el cargo a su banco (contracargo)? Entonces no se le devuelve nada más. */
export function tieneContracargo(t: Pick<TransaccionSumup, 'events' | 'transaction_events' | 'simple_status'>): boolean {
  if (t.simple_status === 'CHARGEBACK' || t.simple_status === 'NON_COLLECTION') return true;
  return (eventosDe(t) ?? []).some(e => tipoDe(e) === 'CHARGE_BACK');
}

/**
 * Qué hacer con una devolución de la Caja de una venta cobrada con SumUp.
 *
 * SumUp no admite clave de idempotencia en las devoluciones, así que la verdad
 * de «¿ya salió este dinero?» es lo que SumUp tiene devuelto frente a lo que
 * tiene apuntado el libro de la venta:
 *  · iguales → se devuelve (si cabe en lo cobrado);
 *  · SumUp tiene devuelto EXACTAMENTE lo que se pide de más → un intento anterior
 *    devolvió el dinero y no llegó a apuntarse: no se devuelve otra vez, se apunta;
 *  · cualquier otra diferencia (una devolución hecha desde la app de SumUp, por
 *    ejemplo) → no se toca nada: que lo mire una persona.
 */
export type DecisionDevolucionSumup =
  | { tipo: 'devolver' }
  | { tipo: 'ya-devuelta' }
  | { tipo: 'no'; motivo: 'excede' | 'descuadre' };

export function decidirDevolucionSumup(p: {
  /** Lo cobrado en la transacción, en céntimos (propina incluida: es lo devolvible). */
  cobrado: number;
  devueltoSegunSumup: number;
  devueltoSegunLibro: number;
  pedido: number;
}): DecisionDevolucionSumup {
  const deMas = p.devueltoSegunSumup - p.devueltoSegunLibro;
  if (deMas === 0) return p.devueltoSegunSumup + p.pedido > p.cobrado ? { tipo: 'no', motivo: 'excede' } : { tipo: 'devolver' };
  if (deMas === p.pedido) return { tipo: 'ya-devuelta' };
  return { tipo: 'no', motivo: 'descuadre' };
}

/**
 * El estado de un cobro de SumUp en el vocabulario de la Caja. Un estado que no
 * se reconoce es ERROR, nunca PAGADO; y uno ya devuelto (REFUNDED) tampoco se da
 * por cobrado aquí: que lo mire una persona.
 *
 * @param t `null` = SumUp todavía no tiene transacción con ese id (404).
 */
export function estadoDesdeSumup(t: TransaccionSumup | null, emitidaEn: Date, ahora: Date): EstadoPagoPOS {
  if (!t) {
    const segundos = (ahora.getTime() - emitidaEn.getTime()) / 1000;
    return segundos < SEGUNDOS_PARA_EMPEZAR + SEGUNDOS_DE_MARGEN ? 'PENDIENTE' : 'EXPIRADO';
  }
  switch (t.status) {
    case 'SUCCESSFUL': return 'PAGADO';
    case 'PENDING':    return 'PROCESANDO';
    case 'FAILED':     return 'RECHAZADO';
    case 'CANCELLED':  return 'CANCELADO';
    default:           return 'ERROR';
  }
}

/**
 * Lo cobrado por lo que se pidió, en céntimos: `amount` SIN la propina. El Solo
 * puede ofrecer propina si el estudio la tiene activada en SumUp, y va dentro
 * de `amount`; la propina no es del recibo ni de la venta.
 */
export function centimosSinPropina(t: Pick<TransaccionSumup, 'amount' | 'tip_amount'>): number {
  const propina = typeof t.tip_amount === 'number' && Number.isFinite(t.tip_amount) && t.tip_amount > 0 ? t.tip_amount : 0;
  return Math.round((t.amount - propina) * 100);
}

/** ¿Cobró exactamente lo que se pidió, en euros (sin contar la propina)? Sin esto, PAGADO no vale. */
export function importeCoincide(t: Pick<TransaccionSumup, 'amount' | 'currency' | 'tip_amount'>, centimos: number): boolean {
  return t.currency === 'EUR' && Number.isFinite(t.amount) && centimosSinPropina(t) === centimos;
}

/**
 * El código que enseña el Solo para emparejarlo (Conexiones > API > Conectar):
 * 8 o 9 letras y números. No tiene la forma de las tres palabras de Stripe.
 */
export const MENSAJE_CODIGO_SUMUP_MAL_ESCRITO = 'Escribe el código tal como sale en el Solo: 8 o 9 letras y números.';
export const MENSAJE_CODIGO_SUMUP_NO_VALE = 'Ese código no vale o ha caducado. Vuelve a pulsar Conectar en el Solo y escribe el nuevo.';

export function normalizarCodigoSumup(texto: unknown): string | null {
  if (typeof texto !== 'string') return null;
  const codigo = texto.replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-Z0-9]{8,9}$/.test(codigo) ? codigo : null;
}

// ── El aviso de SumUp (webhook) ──────────────────────────────────────────────
// La firma de la `return_url` vive en `sumup-aviso.ts` (usa node:crypto, solo
// servidor). Aquí, lo que se lee del cuerpo: solo dice A QUIÉN preguntar.

/** El cuerpo de `solo.transaction.updated`. Solo dice A QUIÉN preguntar; no decide nada. */
export function leerCuerpoAviso(cuerpo: unknown): { clientTransactionId: string; merchantCode: string | null } | null {
  if (typeof cuerpo !== 'object' || cuerpo === null) return null;
  const c = cuerpo as { event_type?: unknown; payload?: { client_transaction_id?: unknown; merchant_code?: unknown } };
  if (c.event_type !== 'solo.transaction.updated') return null;
  const id = c.payload?.client_transaction_id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  return { clientTransactionId: id, merchantCode: typeof c.payload?.merchant_code === 'string' ? c.payload.merchant_code : null };
}

// ── Cliente HTTP ─────────────────────────────────────────────────────────────

export type FetchSumup = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Un error de la API de SumUp. `caducado` (401) = hay que renovar el token, no que el cobro falló. */
export class ErrorSumup extends Error {
  readonly status: number;
  readonly codigo: string | null;
  constructor(status: number, codigo: string | null, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorSumup';
    this.status = status;
    this.codigo = codigo;
  }
  get caducado(): boolean { return this.status === 401; }
}

export interface LectorSumup {
  id: string;
  nombre: string;
  /** `paired` = listo; `processing` = aún emparejando; `expired` = el código caducó. */
  estado: 'unknown' | 'processing' | 'paired' | 'expired';
  modelo: 'solo' | 'virtual-solo' | null;
}

export interface Afiliado { appId: string; key: string }

/** Un cobro hecho del historial de la cuenta (`transactions/history`). No trae nuestra referencia. */
export interface MovimientoSumup { transaccionId: string; clientTransactionId: string | null }

const BASE = 'https://api.sumup.com';

function aLectorSumup(d: unknown, nombrePorDefecto: string): LectorSumup {
  const r = (typeof d === 'object' && d !== null ? d : {}) as {
    id?: unknown; name?: unknown; status?: unknown; device?: { model?: unknown };
  };
  if (typeof r.id !== 'string') throw new ErrorSumup(502, null, 'SumUp no devolvió el lector');
  const estado = r.status === 'paired' || r.status === 'processing' || r.status === 'expired' ? r.status : 'unknown';
  const modelo = r.device?.model === 'solo' || r.device?.model === 'virtual-solo' ? r.device.model : null;
  return { id: r.id, nombre: typeof r.name === 'string' && r.name ? r.name : nombrePorDefecto, estado, modelo };
}

export function clienteSumup(o: { token: string; fetch?: FetchSumup; base?: string }) {
  // Con tiempo límite: una llamada colgada no puede comerse la función entera (y
  // con ella el «¿salió o no?» de quien la llama).
  const f: FetchSumup = o.fetch ?? ((url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20_000) }));
  const base = (o.base ?? BASE).replace(/\/$/, '');
  const mc = (merchantCode: string) => encodeURIComponent(merchantCode);

  async function pedir(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    const res = await f(`${base}${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${o.token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
    if (res.status === 204) return null;
    const datos: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const d = (typeof datos === 'object' && datos !== null ? datos : {}) as { error_code?: unknown; message?: unknown; detail?: unknown };
      const codigo = typeof d.error_code === 'string' ? d.error_code : null;
      const mensaje = typeof d.message === 'string' ? d.message : typeof d.detail === 'string' ? d.detail : `SumUp respondió ${res.status}`;
      throw new ErrorSumup(res.status, codigo, mensaje);
    }
    return datos;
  }

  const lector = (merchantCode: string, readerId: string) =>
    `/v0.1/merchants/${mc(merchantCode)}/readers/${encodeURIComponent(readerId)}`;

  return {
    /** Empareja un Solo con el código de su pantalla. */
    async emparejarLector(merchantCode: string, p: { codigo: string; nombre: string }): Promise<LectorSumup> {
      const d = await pedir('POST', `/v0.1/merchants/${mc(merchantCode)}/readers`, { pairing_code: p.codigo, name: p.nombre });
      return aLectorSumup(d, p.nombre);
    },

    /** El lector tal como lo tiene SumUp. `null` = ya no existe en la cuenta. */
    async obtenerLector(merchantCode: string, readerId: string): Promise<LectorSumup | null> {
      try {
        return aLectorSumup(await pedir('GET', lector(merchantCode, readerId)), '');
      } catch (err) {
        if (err instanceof ErrorSumup && err.status === 404) return null;
        throw err;
      }
    },

    async renombrarLector(merchantCode: string, readerId: string, nombre: string): Promise<LectorSumup> {
      return aLectorSumup(await pedir('PATCH', lector(merchantCode, readerId), { name: nombre }), nombre);
    },

    /** Lo da de baja en la cuenta. Si ya no estaba, no es un error. */
    async borrarLector(merchantCode: string, readerId: string): Promise<void> {
      try {
        await pedir('DELETE', lector(merchantCode, readerId));
      } catch (err) {
        if (!(err instanceof ErrorSumup && err.status === 404)) throw err;
      }
    },

    /** ¿Está encendido y conectado? `ocupado` = esperando tarjeta/PIN o actualizándose. */
    async estadoLector(merchantCode: string, readerId: string): Promise<{ conectado: boolean; ocupado: boolean }> {
      const d = await pedir('GET', `/v0.1/merchants/${mc(merchantCode)}/readers/${encodeURIComponent(readerId)}/status`) as {
        data?: { status?: unknown; state?: unknown };
      };
      const estado = d?.data?.state;
      return {
        conectado: d?.data?.status === 'ONLINE',
        ocupado: typeof estado === 'string' && estado !== 'IDLE',
      };
    },

    /**
     * Manda el importe al Solo. SumUp NO admite clave de idempotencia: quien llama
     * tiene que asegurarse de no abrir dos cobros (compare-and-set + nada en vuelo).
     */
    async cobrar(merchantCode: string, readerId: string, p: {
      centimos: number; descripcion: string; returnUrl: string; afiliado: Afiliado; referenciaExterna: string;
    }): Promise<{ clientTransactionId: string; checkoutId: string | null }> {
      if (!Number.isInteger(p.centimos) || p.centimos <= 0) throw new ErrorSumup(400, null, 'Importe no válido');
      const d = await pedir('POST', `/v0.1/merchants/${mc(merchantCode)}/readers/${encodeURIComponent(readerId)}/checkout`, {
        total_amount: { currency: 'EUR', minor_unit: 2, value: p.centimos },
        description: p.descripcion.slice(0, 120),
        return_url: p.returnUrl,
        affiliate: { app_id: p.afiliado.appId, key: p.afiliado.key, foreign_transaction_id: p.referenciaExterna },
      }) as { data?: { client_transaction_id?: unknown; checkout_id?: unknown }; client_transaction_id?: unknown; checkout_id?: unknown };
      // La documentación lo da en la raíz; algunas respuestas lo envuelven en `data`.
      const c = d?.data ?? d;
      if (typeof c?.client_transaction_id !== 'string') throw new ErrorSumup(502, null, 'SumUp no devolvió el id del cobro');
      return { clientTransactionId: c.client_transaction_id, checkoutId: typeof c.checkout_id === 'string' ? c.checkout_id : null };
    },

    /** Para el cobro en el Solo. Solo funciona si está esperando la tarjeta: hay que volver a preguntar. */
    async terminar(merchantCode: string, readerId: string): Promise<void> {
      await pedir('POST', `/v0.1/merchants/${mc(merchantCode)}/readers/${encodeURIComponent(readerId)}/terminate`);
    },

    /** La transacción de un cobro. `null` = SumUp aún no la tiene (no ha empezado). */
    async buscarTransaccion(merchantCode: string, clientTransactionId: string): Promise<TransaccionSumup | null> {
      try {
        const d = await pedir('GET', `/v2.1/merchants/${mc(merchantCode)}/transactions?client_transaction_id=${encodeURIComponent(clientTransactionId)}`) as Partial<TransaccionSumup>;
        if (typeof d?.id !== 'string' || typeof d.amount !== 'number' || typeof d.status !== 'string' || typeof d.currency !== 'string') {
          throw new ErrorSumup(502, null, 'Respuesta de SumUp sin la forma esperada');
        }
        return d as TransaccionSumup;
      } catch (err) {
        if (err instanceof ErrorSumup && err.status === 404) return null;
        throw err;
      }
    },

    /**
     * Los cobros hechos (SUCCESSFUL, de tipo pago) desde `desde`, los más nuevos
     * primero. Incluye los que la dueña cobre desde la app de SumUp sin Tentare.
     */
    async historial(merchantCode: string, p: { desde: Date; limite?: number }): Promise<MovimientoSumup[]> {
      const q = new URLSearchParams({ oldest_time: p.desde.toISOString(), order: 'descending', limit: String(p.limite ?? 100) });
      q.append('statuses[]', 'SUCCESSFUL');
      q.append('types[]', 'PAYMENT');
      const d = await pedir('GET', `/v2.1/merchants/${mc(merchantCode)}/transactions/history?${q.toString()}`) as { items?: unknown };
      const items = Array.isArray(d?.items) ? d.items as { transaction_id?: unknown; id?: unknown; client_transaction_id?: unknown }[] : [];
      return items.flatMap(i => {
        const id = typeof i.transaction_id === 'string' ? i.transaction_id : typeof i.id === 'string' ? i.id : null;
        if (!id) return [];
        return [{ transaccionId: id, clientTransactionId: typeof i.client_transaction_id === 'string' ? i.client_transaction_id : null }];
      });
    },

    /**
     * Devuelve parte (o todo) de una transacción. SumUp no tiene idempotencia aquí:
     * quien llama comprueba antes lo ya devuelto (`decidirDevolucionSumup`). El
     * importe va en euros, como el de las transacciones, y SIEMPRE explícito: sin
     * él SumUp devolvería la transacción entera.
     */
    async devolver(merchantCode: string, txnId: string, centimos: number): Promise<void> {
      if (!Number.isInteger(centimos) || centimos <= 0) throw new ErrorSumup(400, null, 'Importe no válido');
      await pedir('POST', `/v1.0/merchants/${mc(merchantCode)}/payments/${encodeURIComponent(txnId)}/refunds`, { amount: centimos / 100 });
    },
  };
}

export type ClienteSumup = ReturnType<typeof clienteSumup>;
