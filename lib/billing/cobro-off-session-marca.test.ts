import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACCION_MARCA_TRAS_DESENLACE, claveCobroOffSession, clasificarReservaPerdida, decidirMarcaHuerfana, desenlaceDeEstadoPi,
  marcarAdeudoEnCurso, MINUTOS_HUERFANA, MINUTOS_REENTRADA, reservarCobroOffSession, SEGUNDOS_VIDA_MAXIMA_LLAMADA,
  soltarMarcaCobroOffSession, VENTANA_PI_ANTES_MS, VENTANA_PI_DESPUES_MS, ventanaDelIntento,
  type FilaReciboReserva, type PiDeMarca,
} from './cobro-off-session-marca.ts';

// La marca de «cobro con tarjeta o domiciliación guardada en marcha»: lo que la
// pone, lo que la quita y lo que decide el conciliador con una que se quedó
// colgada. El orden dentro de `cobrarReciboOffSession` (que importa alias de Next y
// no se carga aquí) lo fija `cobro-off-session-puertas.test.ts`.

const raiz = join(import.meta.dirname, '..', '..');
const AHORA = new Date('2026-10-02T12:00:00.000Z');
const haceMin = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();

type Filtro = [op: string, columna: string, valor: unknown];

/** Un `from('recibos')` que apunta el UPDATE y sus filtros, y devuelve `filas`. */
function fakeAdmin(respuesta: { data?: unknown[] | null; error?: { message: string } | null } = {}) {
  const llamadas: Array<{ fila: Record<string, unknown> | null; filtros: Filtro[]; columnas: string }> = [];
  const admin = {
    from() {
      const llamada = { fila: null as Record<string, unknown> | null, filtros: [] as Filtro[], columnas: '' };
      llamadas.push(llamada);
      const b = {
        update(f: Record<string, unknown>) { llamada.fila = f; return b; },
        eq(c: string, v: unknown) { llamada.filtros.push(['eq', c, v]); return b; },
        in(c: string, v: unknown) { llamada.filtros.push(['in', c, v]); return b; },
        is(c: string, v: unknown) { llamada.filtros.push(['is', c, v]); return b; },
        not(c: string, op: string, v: unknown) { llamada.filtros.push([`not.${op}`, c, v]); return b; },
        or(expr: string) { llamada.filtros.push(['or', '', expr]); return b; },
        select(c: string) {
          llamada.columnas = c;
          return Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null });
        },
      };
      return b;
    },
  };
  return { admin: admin as never, llamadas };
}
const tiene = (filtros: Filtro[], op: string, col: string, val?: unknown) =>
  filtros.some(([o, c, v]) => o === op && c === col && (val === undefined || JSON.stringify(v) === JSON.stringify(val)));

// ── La clave ─────────────────────────────────────────────────────────────────

test('la clave es la Idempotency-Key del intento: recibo + nº de intento (sin intento = 0)', () => {
  assert.equal(claveCobroOffSession('rec-1', 3), 'offsession-cobro-rec-1-i3');
  assert.equal(claveCobroOffSession('rec-1', null), 'offsession-cobro-rec-1-i0');
  assert.notEqual(claveCobroOffSession('rec-1', 1), claveCobroOffSession('rec-1', 2), 'cada reintento es un cargo nuevo');
});

// ── Reservar ─────────────────────────────────────────────────────────────────

const RESERVA = { studioId: 'st-1', reciboId: 'rec-1', clave: 'offsession-cobro-rec-1-i2', intentos: 2, ahoraISO: AHORA.toISOString() } as const;

test('reservar (a mano): PENDIENTE o FALLIDO, sin marca, sin datáfono, sin reembolso, con el mismo nº de intento', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ id: 'rec-1', cobro_off_session_desde: '2026-10-02T12:00:00+00:00' }] });
  const r = await reservarCobroOffSession(admin, { ...RESERVA, via: 'STAFF' });
  assert.deepEqual(r, { tipo: 'RESERVADA', marca: { clave: RESERVA.clave, desde: '2026-10-02T12:00:00+00:00' } },
    'el momento se guarda tal como lo devuelve la base de datos: con él se suelta');
  const { fila, filtros } = llamadas[0];
  assert.deepEqual(fila, { cobro_off_session_clave: RESERVA.clave, cobro_off_session_desde: RESERVA.ahoraISO });
  assert.ok(tiene(filtros, 'eq', 'id', 'rec-1') && tiene(filtros, 'eq', 'studio_id', 'st-1'), 'acotado al estudio');
  for (const col of ['cobro_off_session_clave', 'cobro_mostrador_pi', 'reembolso_stripe_id', 'reembolso_solicitado_en']) {
    assert.ok(tiene(filtros, 'is', col, null), `${col} a null`);
  }
  assert.ok(tiene(filtros, 'eq', 'intentos_reintento', 2), 'la clave sale de ese nº de intento');
  assert.ok(tiene(filtros, 'in', 'estado', ['PENDIENTE', 'FALLIDO']));
  assert.ok(filtros.some(([o, , v]) => o === 'or' && v === 'tras_cancelar_cuota.is.null,tras_cancelar_cuota.neq.ANULADO'));
  assert.equal(tiene(filtros, 'is', 'checkout_session_id', null), false, 'a mano no: la columna no se limpia al caducar la sesión');
});

test('reservar (cobro diario): PENDIENTE con reintento programado, sin «sin reintentos» y sin pago online abierto', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ id: 'rec-1', cobro_off_session_desde: RESERVA.ahoraISO }] });
  await reservarCobroOffSession(admin, { ...RESERVA, via: 'AUTOMATICO' });
  const { filtros } = llamadas[0];
  assert.ok(tiene(filtros, 'eq', 'estado', 'PENDIENTE'));
  assert.ok(tiene(filtros, 'not.is', 'proximo_reintento', null));
  assert.ok(filtros.some(([o, , v]) => o === 'or' && v === 'tras_cancelar_cuota.is.null,tras_cancelar_cuota.eq.REINTENTAR'));
  assert.ok(tiene(filtros, 'is', 'checkout_session_id', null), 'D-1 en el propio UPDATE');
});

test('reservar con el nº de intento sin rellenar compara con null, no con 0', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [] });
  const r = await reservarCobroOffSession(admin, { ...RESERVA, intentos: null, via: 'STAFF' });
  assert.deepEqual(r, { tipo: 'PERDIDA' });
  assert.ok(tiene(llamadas[0].filtros, 'is', 'intentos_reintento', null));
});

test('reservar: un error de la base de datos no es «perdida» (no se llegó a Stripe)', async () => {
  const { admin } = fakeAdmin({ error: { message: 'timeout' } });
  assert.deepEqual(await reservarCobroOffSession(admin, { ...RESERVA, via: 'STAFF' }), { tipo: 'ERROR', error: 'timeout' });
});

// ── La reserva no ganó: ¿por qué? ────────────────────────────────────────────

const fila = (extra: Partial<FilaReciboReserva> = {}): FilaReciboReserva => ({
  estado: 'PENDIENTE', intentos_reintento: 2, proximo_reintento: '2026-10-02T09:00:00Z', tras_cancelar_cuota: null,
  cobro_off_session_clave: null, cobro_off_session_desde: null, cobro_mostrador_pi: null, checkout_session_id: null,
  reembolso_stripe_id: null, reembolso_solicitado_en: null, ...extra,
});
const perdida = (f: FilaReciboReserva | null, via: 'STAFF' | 'AUTOMATICO' = 'STAFF', cuota: { estado: string } | null = null) =>
  clasificarReservaPerdida(f, { clave: RESERVA.clave, via, cuota, ahora: AHORA });

test('reserva perdida: el recibo ya no está, o la regla de siempre ya no deja cobrarlo', () => {
  assert.deepEqual(perdida(null), { tipo: 'NO_ENCONTRADO' });
  assert.deepEqual(perdida(fila({ estado: 'COBRADO' })), { tipo: 'SIN_PERMISO', motivo: 'NO_PENDIENTE' });
  assert.deepEqual(perdida(fila({ estado: 'ANULADO' })), { tipo: 'SIN_PERMISO', motivo: 'ANULADO' });
  assert.deepEqual(perdida(fila({ proximo_reintento: null }), 'AUTOMATICO'), { tipo: 'SIN_PERMISO', motivo: 'SIN_REINTENTO_PROGRAMADO' });
  assert.deepEqual(perdida(fila(), 'STAFF', { estado: 'PAUSADA' }), { tipo: 'SIN_PERMISO', motivo: 'CUOTA_PAUSADA' });
  assert.deepEqual(perdida(fila({ reembolso_solicitado_en: '2026-10-01T00:00:00Z' })), { tipo: 'SIN_PERMISO', motivo: 'NO_PENDIENTE' });
});

test('reserva perdida: el MISMO intento todavía joven vuelve a entrar con la marca que ya hay', () => {
  const desde = haceMin(MINUTOS_REENTRADA - 1);
  assert.deepEqual(perdida(fila({ cobro_off_session_clave: RESERVA.clave, cobro_off_session_desde: desde })),
    { tipo: 'REENTRANTE', marca: { clave: RESERVA.clave, desde } });
});

test('reserva perdida: pasada la reentrada, el mismo intento ya no entra (decide el conciliador)', () => {
  const r = perdida(fila({ cobro_off_session_clave: RESERVA.clave, cobro_off_session_desde: haceMin(MINUTOS_REENTRADA + 1) }));
  assert.deepEqual(r, { tipo: 'EN_MARCHA', por: 'OFF_SESSION' });
});

test('reserva perdida: otro intento, el datáfono o (en el cobro diario) un pago online en marcha', () => {
  assert.deepEqual(perdida(fila({ cobro_off_session_clave: 'offsession-cobro-rec-1-i1', cobro_off_session_desde: haceMin(1) })),
    { tipo: 'EN_MARCHA', por: 'OFF_SESSION' });
  assert.deepEqual(perdida(fila({ cobro_mostrador_pi: 'pi_tpv' })), { tipo: 'EN_MARCHA', por: 'MOSTRADOR' });
  assert.deepEqual(perdida(fila({ checkout_session_id: 'cs_1' }), 'AUTOMATICO'), { tipo: 'EN_MARCHA', por: 'PAGO_ONLINE' });
});

test('reserva perdida sin cobro en marcha (cambió el nº de intento): no se cobra nada y se repite luego', () => {
  assert.deepEqual(perdida(fila({ intentos_reintento: 3 })), { tipo: 'CAMBIO' });
  // A mano, un pago online abierto no frena la reserva: si el UPDATE no ganó, es otra cosa.
  assert.deepEqual(perdida(fila({ checkout_session_id: 'cs_1' }), 'STAFF'), { tipo: 'CAMBIO' });
});

// ── Soltar, y el adeudo en curso ─────────────────────────────────────────────

test('soltar: solo la marca de ESTE intento (clave y momento), sin tocar el estado', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ id: 'rec-1' }] });
  const ok = await soltarMarcaCobroOffSession(admin, { studioId: 'st-1', reciboId: 'rec-1', marca: { clave: 'k', desde: 'd' } });
  assert.equal(ok, true);
  const { fila: f, filtros } = llamadas[0];
  assert.deepEqual(f, { cobro_off_session_clave: null, cobro_off_session_desde: null });
  assert.ok(tiene(filtros, 'eq', 'cobro_off_session_clave', 'k') && tiene(filtros, 'eq', 'cobro_off_session_desde', 'd'));
  assert.ok(tiene(filtros, 'eq', 'studio_id', 'st-1'));
  assert.equal(filtros.some(([, c]) => c === 'estado'), false);
});

test('adeudo SEPA en processing: EN_CURSO con su cargo y la marca fuera, en el mismo UPDATE', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ id: 'rec-1' }] });
  const r = await marcarAdeudoEnCurso(admin, { studioId: 'st-1', reciboId: 'rec-1', paymentIntentId: 'pi_sepa' });
  assert.deepEqual(r, { error: null, tocadas: 1 });
  assert.deepEqual(llamadas[0].fila, {
    estado: 'EN_CURSO', metodo_cobro: 'SEPA', sepa_estado: 'processing', stripe_payment_intent_id: 'pi_sepa',
    cobro_off_session_clave: null, cobro_off_session_desde: null,
  });
  assert.ok(tiene(llamadas[0].filtros, 'in', 'estado', ['PENDIENTE', 'FALLIDO']));
});

// ── Desenlaces ───────────────────────────────────────────────────────────────

test('desenlace → marca: lo que cobra la quita en su cierre, lo que no entra la suelta, lo desconocido la mantiene', () => {
  assert.deepEqual(ACCION_MARCA_TRAS_DESENLACE, {
    COBRADO: 'LA_QUITA_EL_CIERRE', ADEUDO_EN_CURSO: 'LA_QUITA_EL_CIERRE',
    SIN_COBRAR: 'SOLTAR', RECHAZADO: 'SOLTAR', DESCONOCIDO: 'MANTENER',
  });
});

test('estado del cargo: una tarjeta en processing no es un rechazo (hay dinero en vuelo)', () => {
  assert.equal(desenlaceDeEstadoPi('succeeded', false), 'COBRADO');
  assert.equal(desenlaceDeEstadoPi('processing', true), 'ADEUDO_EN_CURSO');
  assert.equal(desenlaceDeEstadoPi('processing', false), 'DESCONOCIDO');
  assert.equal(desenlaceDeEstadoPi('requires_capture', false), 'DESCONOCIDO');
  for (const s of ['requires_action', 'requires_payment_method', 'requires_confirmation', 'canceled']) {
    assert.equal(desenlaceDeEstadoPi(s, false), 'SIN_COBRAR', s);
    assert.equal(ACCION_MARCA_TRAS_DESENLACE[desenlaceDeEstadoPi(s, true)], 'SOLTAR', s);
  }
});

// ── Marcas colgadas (conciliador) ────────────────────────────────────────────

const DESDE = haceMin(MINUTOS_HUERFANA + 5);
const enSegundos = (iso: string, deltaMs = 0) => Math.floor((new Date(iso).getTime() + deltaMs) / 1000);
const pi = (extra: Partial<PiDeMarca> & { origen?: string; reciboId?: string } = {}): PiDeMarca => ({
  id: extra.id ?? 'pi_1', status: extra.status ?? 'succeeded', created: extra.created ?? enSegundos(DESDE, 1000),
  metadata: { reciboId: extra.reciboId ?? 'rec-1', origen: extra.origen ?? 'tarjeta_recibo' },
});
const huerfana = (pis: PiDeMarca[], estado = 'PENDIENTE', desde = DESDE) =>
  decidirMarcaHuerfana({ id: 'rec-1', estado, desde }, pis, AHORA);

test('colgada joven: espera (quien llamó, o su reintento, aún puede resolverla)', () => {
  assert.deepEqual(huerfana([], 'PENDIENTE', haceMin(MINUTOS_HUERFANA - 1)), { tipo: 'ESPERAR' });
});

test('colgada en un recibo que ya no se cobra: se suelta sin preguntar', () => {
  assert.deepEqual(huerfana([pi()], 'COBRADO'), { tipo: 'SOLTAR' });
  assert.deepEqual(huerfana([pi()], 'ANULADO'), { tipo: 'SOLTAR' });
});

test('colgada con el cargo cobrado: se cierra el recibo con ese cargo (tarjeta o SEPA)', () => {
  assert.deepEqual(huerfana([pi()]), { tipo: 'COBRADO', paymentIntentId: 'pi_1', metodo: 'TARJETA' });
  assert.deepEqual(huerfana([pi({ origen: 'sepa_recibo' })]), { tipo: 'COBRADO', paymentIntentId: 'pi_1', metodo: 'SEPA' });
});

test('colgada con un adeudo SEPA en vuelo: EN_CURSO; una tarjeta procesando se queda esperando', () => {
  assert.deepEqual(huerfana([pi({ status: 'processing', origen: 'sepa_recibo' })]), { tipo: 'ADEUDO_EN_CURSO', paymentIntentId: 'pi_1' });
  assert.deepEqual(huerfana([pi({ status: 'processing' })]), { tipo: 'MANTENER', motivo: 'CARGO_PROCESANDO' });
});

test('colgada sin ningún cargo con dinero: se suelta (3DS, rechazado, cancelado o nunca creado)', () => {
  assert.deepEqual(huerfana([]), { tipo: 'SOLTAR' });
  assert.deepEqual(huerfana([pi({ status: 'requires_action' }), pi({ id: 'pi_2', status: 'requires_payment_method' })]), { tipo: 'SOLTAR' });
});

test('solo cuenta un cargo de ESTE recibo, de su tarjeta o domiciliación guardada y dentro de la ventana del intento', () => {
  assert.deepEqual(huerfana([pi({ reciboId: 'rec-otro' })]), { tipo: 'SOLTAR' });
  assert.deepEqual(huerfana([pi({ origen: 'recibo_checkout' })]), { tipo: 'SOLTAR' }, 'un pago online no es este intento');
  assert.deepEqual(huerfana([pi({ created: enSegundos(DESDE, -VENTANA_PI_ANTES_MS - 60_000) })]), { tipo: 'SOLTAR' }, 'de un intento anterior');
  assert.deepEqual(huerfana([pi({ created: enSegundos(DESDE, VENTANA_PI_DESPUES_MS + 60_000) })]), { tipo: 'SOLTAR' });
  assert.equal(huerfana([pi({ created: enSegundos(DESDE, VENTANA_PI_DESPUES_MS - 60_000) })]).tipo, 'COBRADO', 'el reintento tardío del mismo intento');
});

test('dos cargos con dinero del mismo intento: no se decide solo', () => {
  assert.deepEqual(huerfana([pi(), pi({ id: 'pi_2' })]), { tipo: 'MANTENER', motivo: 'VARIOS_CARGOS' });
});

// ── Los tiempos ──────────────────────────────────────────────────────────────

test('quien llamó y el conciliador nunca actúan a la vez: la colgada empieza después de la reentrada más una llamada entera', () => {
  assert.ok(MINUTOS_HUERFANA * 60 > MINUTOS_REENTRADA * 60 + SEGUNDOS_VIDA_MAXIMA_LLAMADA);
  // El cargo de un intento puede nacer en su último reintento: la ventana lo cubre.
  assert.ok(VENTANA_PI_DESPUES_MS >= (MINUTOS_REENTRADA * 60 + SEGUNDOS_VIDA_MAXIMA_LLAMADA) * 1000);
  const v = ventanaDelIntento(DESDE);
  assert.ok(v.gte < enSegundos(DESDE) && v.lte > enSegundos(DESDE));
});

test('la vida máxima de una llamada es la de la ruta de Inngest, la más larga de las que cobran', () => {
  const ruta = readFileSync(join(raiz, 'app', 'api', 'inngest', 'route.ts'), 'utf8');
  const m = ruta.match(/export const maxDuration = (\d+);/);
  assert.ok(m, 'la ruta de Inngest ya no exporta maxDuration');
  assert.ok(Number(m[1]) <= SEGUNDOS_VIDA_MAXIMA_LLAMADA, `maxDuration ${m[1]} > ${SEGUNDOS_VIDA_MAXIMA_LLAMADA}: sube MINUTOS_HUERFANA`);
  for (const r of ['app/api/stripe/charge-off-session/route.ts', 'app/api/cobros/cobrar-online/route.ts', 'app/api/penalizaciones/aprobar/route.ts']) {
    const md = readFileSync(join(raiz, r), 'utf8').match(/export const maxDuration = (\d+);/);
    if (md) assert.ok(Number(md[1]) <= SEGUNDOS_VIDA_MAXIMA_LLAMADA, `${r}: maxDuration ${md[1]}`);
  }
});
