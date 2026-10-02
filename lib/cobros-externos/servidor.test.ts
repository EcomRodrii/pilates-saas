import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  confirmarMovimiento, descartarMovimiento, enlazarMovimiento, importarLote, marcarDobleCobro, reabrirMovimiento,
  recuperarColgados, reemparejarPendientes, type DependenciasBandeja, type SesionBandeja,
} from './servidor.ts';
import type { ParamsConfirmarCobro, ResultadoConfirmarCobro } from '../billing/confirmar-cobro.ts';
import type { MovimientoNormalizado, ResultadoLectura } from './tipos.ts';

// Estudios, alumnas, recibos y movimientos INVENTADOS. La base de datos es un
// doble en memoria con lo que importa de verdad aquí: filtros por estudio y
// estado, y el índice único «un recibo, un movimiento» (CONFIRMANDO, CONFIRMADO
// y ENLAZADO), que es lo que para a dos movimientos sobre el mismo recibo.

type Fila = Record<string, unknown>;
type Op = { tipo: 'eq' | 'neq' | 'in' | 'is' | 'lt' | 'lte' | 'gte' | 'contains'; col: string; v: unknown };

const numerico = (x: unknown) => (typeof x === 'number' || (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x))));
const igual = (a: unknown, b: unknown) => a === b || (numerico(a) && numerico(b) && Number(a) === Number(b));

function cumple(f: Fila, ops: Op[]): boolean {
  return ops.every(o => {
    const v = f[o.col];
    switch (o.tipo) {
      case 'eq': return igual(v, o.v);
      case 'neq': return !igual(v, o.v);
      case 'in': return (o.v as unknown[]).some(x => igual(v, x));
      case 'is': return v === o.v || (o.v === null && v === undefined);
      case 'lt': return v != null && String(v) < String(o.v);
      case 'lte': return v != null && String(v) <= String(o.v);
      case 'gte': return v != null && String(v) >= String(o.v);
      case 'contains': return !!v && typeof v === 'object' && Object.entries(o.v as Fila).every(([k, x]) => (v as Fila)[k] === x);
    }
  });
}

function baseFalsa(inicial: Record<string, Fila[]>) {
  const tablas: Record<string, Fila[]> = Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v.map(f => ({ ...f }))]));
  const escrituras: { tabla: string; tipo: string; fila: Fila }[] = [];
  const tabla = (t: string) => (tablas[t] ??= []);

  // El índice único de la migración.
  const violaIndice = (f: Fila, salvo: Fila | null) =>
    !!f.recibo_id && ['CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO'].includes(f.estado as string)
    && tabla('cobros_externos').some(o => o !== salvo && o.recibo_id === f.recibo_id && ['CONFIRMANDO', 'CONFIRMADO', 'ENLAZADO'].includes(o.estado as string));

  function from(t: string) {
    const ops: Op[] = [];
    let modo: 'select' | 'update' | 'insert' | 'upsert' = 'select';
    let patch: Fila = {};
    let nuevas: Fila[] = [];
    let opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let limite = Infinity;
    const ejecutar = () => {
      if (modo === 'select') return { data: tabla(t).filter(f => cumple(f, ops)).slice(0, limite).map(f => ({ ...f })), error: null };
      if (modo === 'update') {
        const afectadas = tabla(t).filter(f => cumple(f, ops));
        for (const f of afectadas) {
          const nueva = { ...f, ...patch };
          if (t === 'cobros_externos' && violaIndice(nueva, f)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        for (const f of afectadas) { Object.assign(f, patch); escrituras.push({ tabla: t, tipo: 'update', fila: { ...f } }); }
        return { data: afectadas.map(f => ({ ...f })), error: null };
      }
      const claves = (opciones.onConflict ?? '').split(',').filter(Boolean);
      const insertadas: Fila[] = [];
      for (const n of nuevas) {
        if (claves.length && tabla(t).some(f => claves.every(c => f[c] === n[c]))) {
          if (opciones.ignoreDuplicates) continue;
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        if (t === 'cobros_externos_lotes' && tabla(t).some(f => f.studio_id === n.studio_id && f.huella_fichero === n.huella_fichero)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        tabla(t).push({ ...n });
        insertadas.push({ ...n });
        escrituras.push({ tabla: t, tipo: modo, fila: { ...n } });
      }
      return { data: insertadas, error: null };
    };
    const q = {
      select: (_c?: string) => q,
      update: (p: Fila) => { modo = 'update'; patch = p; return q; },
      insert: (n: Fila | Fila[]) => { modo = 'insert'; nuevas = Array.isArray(n) ? n : [n]; return q; },
      upsert: (n: Fila[], o: typeof opciones) => { modo = 'upsert'; nuevas = n; opciones = o; return q; },
      eq: (col: string, v: unknown) => { ops.push({ tipo: 'eq', col, v }); return q; },
      neq: (col: string, v: unknown) => { ops.push({ tipo: 'neq', col, v }); return q; },
      in: (col: string, v: unknown[]) => { ops.push({ tipo: 'in', col, v }); return q; },
      is: (col: string, v: unknown) => { ops.push({ tipo: 'is', col, v }); return q; },
      lt: (col: string, v: unknown) => { ops.push({ tipo: 'lt', col, v }); return q; },
      lte: (col: string, v: unknown) => { ops.push({ tipo: 'lte', col, v }); return q; },
      gte: (col: string, v: unknown) => { ops.push({ tipo: 'gte', col, v }); return q; },
      contains: (col: string, v: unknown) => { ops.push({ tipo: 'contains', col, v }); return q; },
      order: () => q,
      limit: (n: number) => { limite = n; return q; },
      abortSignal: () => q,
      maybeSingle: async () => {
        const r = ejecutar();
        if (r.error) return r;
        return { data: (r.data as Fila[])[0] ?? null, error: null };
      },
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
    };
    return q;
  }
  return { admin: { from } as unknown as SupabaseClient, tablas, escrituras };
}

const SESION: SesionBandeja = { userId: '00000000-0000-4000-8000-000000000001', studioId: 'studio-1', rol: 'PROPIETARIO', nombre: 'Recepción' };
const AHORA = new Date('2026-10-05T10:00:00Z');

function movimiento(p: Fila = {}): Fila {
  return {
    id: 'cex-1', studio_id: 'studio-1', lote_id: null, fuente: 'norma43', clave_idempotencia: 'n43:inventada#1', id_externo: null,
    tipo: 'COBRO', metodo: 'TRANSFERENCIA', importe_centimos: 5900, fecha_operacion: '2026-10-01', hora_operacion: null,
    fecha_valor: null, referencia: null, tarjeta_ultimos4: null, tarjeta_marca: null, terminal_ref: null,
    pagador_nombre: 'maria garcia lopez', concepto: 'CUOTA OCTUBRE', estado: 'POR_REVISAR', decision: null,
    posible_duplicado_de: null, recibo_id: null, socio_id: null, resuelto_como: null, resuelto_por: null, resuelto_en: null,
    bloqueado_en: null, descartado_motivo: null, error_ultimo: null, creado_en: '2026-10-02T08:00:00Z',
    ...p,
  };
}

function recibo(p: Fila = {}): Fila {
  return {
    id: 'rec-1', studio_id: 'studio-1', socio_id: 'soc-1', suscripcion_id: 'sus-1', importe: 59, importe_devuelto: 0,
    estado: 'PENDIENTE', fecha_vencimiento: '2026-10-01', fecha_cobro: null, metodo_cobro: null, conciliado_por: null,
    stripe_payment_intent_id: null, cobro_mostrador_pi: null, reembolso_stripe_id: null, reembolso_solicitado_en: null,
    concepto: 'Cuota mensual octubre', checkout_session_id: null,
    ...p,
  };
}

/** Un `confirmarCobro` falso que, como el real, cobra el recibo en la base. */
function dobles(base: ReturnType<typeof baseFalsa>, resultado?: ResultadoConfirmarCobro | 'lanza') {
  const llamadas: ParamsConfirmarCobro[] = [];
  const efectos: unknown[] = [];
  const deps: Partial<DependenciasBandeja> & Pick<DependenciasBandeja, 'antesDeCobrar'> = {
    ahora: () => AHORA,
    antesDeCobrar: async () => ({ ok: true, checkoutLeido: null }),
    registrar: async () => {},
    aplicarEfectosCobro: (async (_a: unknown, p: unknown) => {
      efectos.push({ ...(p as object), estadoDelMovimiento: base.tablas.cobros_externos?.[0]?.estado });
      return { pasos: [], selladoOk: true };
    }) as unknown as DependenciasBandeja['aplicarEfectosCobro'],
    confirmarCobro: (async (_a: unknown, p: ParamsConfirmarCobro) => {
      llamadas.push(p);
      if (resultado === 'lanza') throw new Error('se cortó');
      const r = resultado ?? { ok: true, transicion: 'aplicada', selladoOk: true };
      if (r.ok && r.transicion === 'aplicada') {
        const rec = base.tablas.recibos.find(f => f.id === p.reciboId);
        if (rec) Object.assign(rec, { estado: 'COBRADO', fecha_cobro: p.fechaCobro, conciliado_por: 'externo', metodo_cobro: p.metodo });
      }
      return r;
    }) as unknown as DependenciasBandeja['confirmarCobro'],
  };
  return { deps, llamadas, efectos };
}

const mov1 = (b: ReturnType<typeof baseFalsa>, id = 'cex-1') => b.tablas.cobros_externos.find(f => f.id === id) as Fila;

// ── Confirmar ────────────────────────────────────────────────────────────────

test('confirmar: cobra por confirmarCobro con la fecha REAL, el importe exacto y la factura del canal', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps, llamadas } = dobles(base);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.deepEqual(r, { ok: true, estado: 'CONFIRMADO' });
  assert.equal(llamadas.length, 1);
  const p = llamadas[0];
  assert.equal(p.origen, 'externo');
  assert.equal(p.fechaCobro, '2026-10-01', 'el día que pagó, no el de hoy');
  assert.equal(p.importeEsperado, '59.00');
  assert.equal(p.facturaId, 'fac-ext-rec-1');
  assert.equal(p.metodo, 'TRANSFERENCIA');
  assert.equal(p.paymentIntentId, null);
  assert.equal(p.sinCobroDeMostrador, true);
  assert.equal(p.checkoutLeido, null);
  assert.equal('cobradoEn' in p, false, 'Norma 43 no trae hora: ninguna inventada');
  const m = mov1(base);
  assert.equal(m.estado, 'CONFIRMADO');
  assert.equal(m.recibo_id, 'rec-1');
  assert.equal(m.socio_id, 'soc-1');
  assert.equal(m.resuelto_por, SESION.userId);
  assert.equal(m.bloqueado_en, null);
  assert.equal(base.escrituras.some(e => e.tabla === 'recibos'), false, 'el recibo solo lo escribe confirmarCobro');
});

test('confirmar con hora en el fichero: se pasa el instante real del pago', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento({ hora_operacion: '18:32:00', metodo: 'TARJETA' })], recibos: [recibo()] });
  const { deps, llamadas } = dobles(base);
  await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(llamadas[0].cobradoEn, '2026-10-01T16:32:00.000Z');
  assert.equal(llamadas[0].metodo, 'TARJETA');
});

test('pago ya confirmado: pedirlo otra vez no vuelve a cobrar', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps, llamadas } = dobles(base);
  await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 1);
});

test('dos movimientos sobre el mismo recibo: el índice para al segundo ANTES de confirmarCobro', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento(), movimiento({ id: 'cex-2', clave_idempotencia: 'n43:inventada#2' })],
    recibos: [recibo()],
  });
  const { deps, llamadas } = dobles(base);
  await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-2', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.codigo, 'OCUPADO');
  assert.equal(llamadas.length, 1, 'confirmarCobro no se llama para el segundo');
  assert.equal(mov1(base, 'cex-2').estado, 'POR_REVISAR');
});

test('importe distinto, cita o fecha futura: no se toca nada', async () => {
  for (const [rec, mov, codigo] of [
    [recibo({ importe: 59.01 }), movimiento(), 'NO_COBRABLE'],
    [recibo({ id: 'rec-cita-1' }), movimiento(), 'NO_COBRABLE'],
    [recibo(), movimiento({ fecha_operacion: '2026-10-09' }), 'DATOS'],
  ] as const) {
    const base = baseFalsa({ cobros_externos: [mov], recibos: [rec] });
    const { deps, llamadas } = dobles(base);
    const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: rec.id as string, avisarSocia: false }, deps);
    assert.equal(!r.ok && r.codigo, codigo);
    assert.equal(llamadas.length, 0);
    assert.equal(mov1(base).estado, 'POR_REVISAR');
    assert.equal(base.escrituras.length, 0);
  }
});

test('un pago en marcha que no se puede cerrar: no se cobra y el movimiento vuelve a revisión con el motivo', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps, llamadas } = dobles(base);
  deps.antesDeCobrar = async () => ({ ok: false, mensaje: 'Tiene un enlace de pago abierto y no hemos podido cerrarlo.' });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
  assert.equal(llamadas.length, 0);
  const m = mov1(base);
  assert.equal(m.estado, 'POR_REVISAR');
  assert.equal(m.recibo_id, null, 'suelta el recibo: otro movimiento podrá cobrarlo');
  assert.match(String(m.error_ultimo), /enlace de pago/);
});

test('el enlace de pago leído viaja al compare-and-set', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps, llamadas } = dobles(base);
  deps.antesDeCobrar = async () => ({ ok: true, checkoutLeido: 'cs_cerrada' });
  await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(llamadas[0].checkoutLeido, 'cs_cerrada');
});

test('en serie por suscripción: con otro cobro de la misma suscripción a medias, se espera', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento(), movimiento({ id: 'cex-9', clave_idempotencia: 'n43:otra#1', estado: 'CONFIRMANDO', recibo_id: 'rec-9', bloqueado_en: '2026-10-05T09:59:50Z' })],
    recibos: [recibo(), recibo({ id: 'rec-9', fecha_vencimiento: '2026-11-01' })],
  });
  const { deps, llamadas } = dobles(base);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'OCUPADO');
  assert.equal(llamadas.length, 0);
  assert.equal(mov1(base).estado, 'POR_REVISAR');
});

test('ya estaba cobrado a mano, sin Stripe, y cuadra → ENLAZADO', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'BIZUM', conciliado_por: 'manual' })] });
  const { deps } = dobles(base, { ok: true, transicion: 'ya_estaba', selladoOk: true });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(r.ok && r.estado, 'ENLAZADO');
  assert.equal(mov1(base).estado, 'ENLAZADO');
});

test('ya estaba cobrado por Stripe → DOBLE_COBRO, con su recibo', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'TARJETA', conciliado_por: 'webhook', stripe_payment_intent_id: 'pi_inventado' })] });
  const { deps } = dobles(base, { ok: true, transicion: 'ya_estaba', selladoOk: true });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(r.ok && r.estado, 'DOBLE_COBRO');
  const m = mov1(base);
  assert.equal(m.estado, 'DOBLE_COBRO');
  assert.equal(m.recibo_id, 'rec-1');
});

test('confirmarCobro dice que no: vuelve a revisión con el motivo', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps } = dobles(base, { ok: false, codigo: 'NO_COBRABLE', error: 'Este recibo no admite este cobro (estado: ANULADO).', estado: 'ANULADO' });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
  assert.equal(mov1(base).estado, 'POR_REVISAR');
  assert.match(String(mov1(base).error_ultimo), /ANULADO/);
});

// ── Recuperar lo colgado ─────────────────────────────────────────────────────

test('se corta a medias: se queda en el cerrojo y la recuperación lo cierra con sus efectos', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps } = dobles(base, 'lanza');
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'PERSISTENCIA');
  assert.equal(mov1(base).estado, 'CONFIRMANDO', 'sin saber si cobró, no se suelta');

  // El cobro sí llegó a escribirse antes de que muriera la función.
  Object.assign(base.tablas.recibos[0], { estado: 'COBRADO', conciliado_por: 'externo', metodo_cobro: 'TRANSFERENCIA', fecha_cobro: '2026-10-01' });
  const { deps: tarde, efectos } = dobles(base);
  tarde.ahora = () => new Date(AHORA.getTime() + 60_000);
  assert.equal(await recuperarColgados(base.admin, SESION, tarde), 0, 'antes de 2 minutos no se toca');
  tarde.ahora = () => new Date(AHORA.getTime() + 3 * 60_000);
  assert.equal(await recuperarColgados(base.admin, SESION, tarde), 1);
  assert.equal(mov1(base).estado, 'CONFIRMADO');
  assert.equal(efectos.length, 1);
  const e = efectos[0] as { reparacion: boolean; avisarSocia: boolean; facturaId: string; origen: string; estadoDelMovimiento: string };
  assert.equal(e.estadoDelMovimiento, 'CONFIRMANDO', 'los efectos van ANTES del cierre: si muere entre medias, se vuelven a intentar');
  assert.equal(e.reparacion, true);
  assert.equal(e.avisarSocia, false);
  assert.equal(e.facturaId, 'fac-ext-rec-1');
  assert.equal(e.origen, 'externo');
});

test('colgado con el recibo aún sin cobrar → vuelve a revisión', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento({ estado: 'CONFIRMANDO', recibo_id: 'rec-1', bloqueado_en: '2026-10-05T09:50:00Z' })],
    recibos: [recibo()],
  });
  const { deps, efectos } = dobles(base);
  assert.equal(await recuperarColgados(base.admin, SESION, deps), 1);
  assert.equal(mov1(base).estado, 'POR_REVISAR');
  assert.equal(mov1(base).recibo_id, null);
  assert.equal(efectos.length, 0);
});

// ── Enlazar, descartar, reabrir, doble cobro ─────────────────────────────────

test('enlazar con un cobro apuntado a mano: no escribe en recibos', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'TRANSFERENCIA', conciliado_por: 'manual' })] });
  const r = await enlazarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1' }, { registrar: async () => {} });
  assert.equal(r.ok && r.estado, 'ENLAZADO');
  assert.equal(mov1(base).recibo_id, 'rec-1');
  assert.equal(base.escrituras.some(e => e.tabla === 'recibos'), false);
});

test('enlazar con un cobro de Stripe, o de otro importe: no', async () => {
  for (const rec of [
    recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'TARJETA', conciliado_por: 'webhook', stripe_payment_intent_id: 'pi_inventado' }),
    recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'TRANSFERENCIA', conciliado_por: 'manual', importe: 60 }),
    recibo(),
  ]) {
    const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [rec] });
    const r = await enlazarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1' }, { registrar: async () => {} });
    assert.equal(!r.ok && r.codigo, 'NO_COBRABLE');
    assert.equal(mov1(base).estado, 'POR_REVISAR');
  }
});

test('enlazar con un cobro ya enlazado a otro movimiento: lo para el índice', async () => {
  const cobrado = recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-02', metodo_cobro: 'TRANSFERENCIA', conciliado_por: 'manual' });
  const base = baseFalsa({
    cobros_externos: [movimiento(), movimiento({ id: 'cex-2', clave_idempotencia: 'n43:inventada#2', estado: 'ENLAZADO', recibo_id: 'rec-1' })],
    recibos: [cobrado],
  });
  const r = await enlazarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1' }, { registrar: async () => {} });
  assert.equal(!r.ok && r.codigo, 'OCUPADO');
});

test('doble cobro → descartar como devuelto: guarda de qué recibo era; y reabrir un descartado', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-01', conciliado_por: 'webhook', stripe_payment_intent_id: 'pi_inventado' })] });
  const anotadas: string[] = [];
  const registrar: DependenciasBandeja['registrar'] = async (_a, e) => { anotadas.push(e.contexto.accion); };
  assert.equal((await marcarDobleCobro(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1' }, { registrar })).ok, true);
  assert.equal(mov1(base).estado, 'DOBLE_COBRO');
  const r = await descartarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', motivo: 'DEVUELTO_A_LA_ALUMNA' }, { registrar });
  assert.equal(r.ok && r.estado, 'DESCARTADO');
  assert.equal(mov1(base).recibo_id, 'rec-1');
  assert.equal(mov1(base).descartado_motivo, 'DEVUELTO_A_LA_ALUMNA');
  assert.equal((await reabrirMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1' }, { registrar })).ok, true);
  assert.equal(mov1(base).estado, 'POR_REVISAR');
  assert.equal(mov1(base).recibo_id, null);
  assert.deepEqual(anotadas, ['COBRO_EXTERNO_DOBLE_COBRO', 'COBRO_EXTERNO_DESCARTADO', 'COBRO_EXTERNO_REABIERTO']);
});

test('lo confirmado no se descarta ni se reabre desde la bandeja', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento({ estado: 'CONFIRMADO', recibo_id: 'rec-1' })], recibos: [recibo()] });
  assert.equal((await descartarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', motivo: 'OTRO' }, { registrar: async () => {} })).ok, false);
  assert.equal((await reabrirMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1' }, { registrar: async () => {} })).ok, false);
  assert.equal(mov1(base).estado, 'CONFIRMADO');
});

test('otro estudio: su movimiento no existe para esta sesión', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento({ studio_id: 'studio-2' })], recibos: [recibo({ studio_id: 'studio-2' })] });
  const { deps, llamadas } = dobles(base);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'NO_ENCONTRADO');
  assert.equal(llamadas.length, 0);
});

// ── Subir ────────────────────────────────────────────────────────────────────

function mn(p: Partial<MovimientoNormalizado>): MovimientoNormalizado {
  return {
    fuente: 'norma43', claveIdempotencia: 'n43:a#1', idExterno: null, tipo: 'COBRO', metodo: 'BIZUM', importeCentimos: 5900,
    fechaOperacion: '2026-10-01', horaOperacion: null, fechaValor: '2026-10-01', referencia: null, tarjetaUltimos4: null,
    tarjetaMarca: null, terminalRef: null, pagadorNombre: 'maria garcia lopez', concepto: 'BIZUM CUOTA OCTUBRE', ...p,
  };
}
const lectura = (movimientos: MovimientoNormalizado[]): ResultadoLectura => ({
  movimientos, cargos: 2, errores: [], cuentaFinal: '1234', periodoDesde: '2026-10-01', periodoHasta: '2026-10-02',
});

test('subir: el mismo fichero dos veces no entra dos veces; uno que se solapa solo añade lo nuevo', async () => {
  const base = baseFalsa({ cobros_externos: [], cobros_externos_lotes: [], recibos: [recibo()], socios: [{ id: 'soc-1', studio_id: 'studio-1', nombre: 'María', apellidos: 'García López' }] });
  const a = mn({});
  const liquidacion = mn({ claveIdempotencia: 'n43:b#1', tipo: 'LIQUIDACION', metodo: 'TARJETA', importeCentimos: 31250, pagadorNombre: null });
  const r1 = await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: 'extracto.n43', lectura: lectura([a, liquidacion]) });
  assert.ok(r1.ok);
  assert.equal(r1.ok && r1.resumen.nuevos, 2);
  assert.equal(r1.ok && r1.resumen.noDeAlumnas, 1);
  assert.equal(r1.ok && r1.resumen.porNivel.UNICA_CLARA, 1);
  const filas = base.tablas.cobros_externos;
  assert.equal(filas.find(f => f.clave_idempotencia === 'n43:a#1')?.estado, 'POR_REVISAR');
  assert.equal(filas.find(f => f.clave_idempotencia === 'n43:b#1')?.estado, 'IMPORTADO', 'la liquidación del datáfono no entra en la bandeja');

  const r2 = await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: 'extracto (1).n43', lectura: lectura([a, liquidacion]) });
  assert.equal(r2.ok && r2.resumen.yaSubido, true);
  assert.equal(base.tablas.cobros_externos.length, 2);

  const c = mn({ claveIdempotencia: 'n43:c#1', importeCentimos: 4500, fechaOperacion: '2026-10-02' });
  const r3 = await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: null, lectura: { ...lectura([a, c]), periodoHasta: '2026-10-03' } });
  assert.equal(r3.ok && r3.resumen.nuevos, 1);
  assert.equal(r3.ok && r3.resumen.yaImportados, 1);
  assert.equal(base.tablas.cobros_externos.length, 3);
});

test('subir: la decisión guardada no lleva nombres, solo ids y códigos', async () => {
  const base = baseFalsa({ cobros_externos: [], cobros_externos_lotes: [], recibos: [recibo()], socios: [{ id: 'soc-1', studio_id: 'studio-1', nombre: 'María', apellidos: 'García López' }] });
  await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: null, lectura: lectura([mn({})]) });
  const decision = JSON.stringify(base.tablas.cobros_externos[0].decision);
  assert.match(decision, /rec-1/);
  assert.equal(/Mar[ií]a|Garc[ií]a/i.test(decision), false);
});

// ── Lo que encontró la revisión de dinero ────────────────────────────────────

test('confirmarCobro devuelve PERSISTENCIA (un 504 tras el commit): NO se suelta, se queda para la recuperación', async () => {
  const base = baseFalsa({ cobros_externos: [movimiento()], recibos: [recibo()] });
  const { deps } = dobles(base, { ok: false, codigo: 'PERSISTENCIA', error: 'upstream timeout' });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'PERSISTENCIA');
  assert.equal(mov1(base).estado, 'CONFIRMANDO');
  assert.equal(mov1(base).recibo_id, 'rec-1', 'el recibo sigue atado: ningún otro movimiento puede cobrarlo');
});

test('ya_estaba porque lo escribió una confirmación anterior de este mismo pago: se cierra con sus efectos', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento()],
    recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-01', conciliado_por: 'externo', metodo_cobro: 'TRANSFERENCIA' })],
  });
  const { deps, efectos } = dobles(base, { ok: true, transicion: 'ya_estaba', selladoOk: true });
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(r.ok && r.estado, 'CONFIRMADO');
  assert.equal(mov1(base).estado, 'CONFIRMADO');
  assert.equal(efectos.length, 1);
});

test('recuperación: lo cobró y luego se devolvió → se cierra sin efectos (el cobro existió)', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento({ estado: 'CONFIRMANDO', recibo_id: 'rec-1', bloqueado_en: '2026-10-05T09:50:00Z' })],
    recibos: [recibo({ estado: 'DEVUELTO', fecha_cobro: '2026-10-01', conciliado_por: 'externo', importe_devuelto: 59 })],
  });
  const { deps, efectos } = dobles(base);
  assert.equal(await recuperarColgados(base.admin, SESION, deps), 1);
  assert.equal(mov1(base).estado, 'CONFIRMADO');
  assert.equal(efectos.length, 0);
});

test('recuperación: la entrada del libro va a nombre de quien EMPEZÓ la confirmación, con su rol en el estudio', async () => {
  const quien = '00000000-0000-4000-8000-000000000002';
  const base = baseFalsa({
    cobros_externos: [movimiento({ estado: 'CONFIRMANDO', recibo_id: 'rec-1', bloqueado_en: '2026-10-05T09:50:00Z', resuelto_por: quien })],
    recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-01', conciliado_por: 'externo', metodo_cobro: 'TRANSFERENCIA' })],
    studios: [{ id: 'studio-1', owner_auth_user_id: SESION.userId }],
    instructores: [{ id: 'ins-1', studio_id: 'studio-1', auth_user_id: quien, rol: 'RECEPCION' }],
    auditoria_estudio: [],
  });
  const { deps } = dobles(base);
  await recuperarColgados(base.admin, SESION, deps);
  const entradas = base.tablas.auditoria_estudio;
  assert.equal(entradas.length, 1);
  assert.equal(entradas[0].actor_uid, quien, 'no quien abrió la bandeja');
  assert.equal(entradas[0].actor_rol, 'RECEPCION');
  assert.equal((entradas[0].contexto as Fila).accion, 'COBRO_EXTERNO_CONFIRMADO');
  assert.equal((entradas[0].contexto as Fila).recuperado, true);
  assert.equal((entradas[0].contexto as Fila).iniciado_por, quien);
  // Una segunda pasada no duplica nada: el movimiento ya está cerrado.
  await recuperarColgados(base.admin, SESION, deps);
  assert.equal(base.tablas.auditoria_estudio.length, 1);
});

test('el mismo pago por otra fuente ya cobró un recibo: no salda otro sin decir que son dos pagos', async () => {
  const csv = movimiento({ id: 'cex-csv', fuente: 'csv', clave_idempotencia: 'tab:inventada', estado: 'CONFIRMADO', recibo_id: 'rec-sep', hora_operacion: null });
  const base = baseFalsa({
    cobros_externos: [movimiento(), csv],
    recibos: [recibo(), recibo({ id: 'rec-sep', estado: 'COBRADO', fecha_vencimiento: '2026-09-01' })],
  });
  const { deps, llamadas } = dobles(base);
  const r = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, deps);
  assert.equal(!r.ok && r.codigo, 'POSIBLE_DUPLICADO');
  assert.equal(llamadas.length, 0);
  assert.equal(mov1(base).estado, 'POR_REVISAR');
  const r2 = await confirmarMovimiento(base.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false, aunqueDuplicado: true }, deps);
  assert.equal(r2.ok && r2.estado, 'CONFIRMADO');
});

test('subir: el posible duplicado se marca en los dos movimientos', async () => {
  const base = baseFalsa({
    cobros_externos: [movimiento({ id: 'cex-csv', fuente: 'csv', clave_idempotencia: 'tab:inventada' })],
    cobros_externos_lotes: [], recibos: [recibo()], socios: [],
  });
  const r = await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: null, lectura: lectura([mn({ metodo: 'TRANSFERENCIA' })]) });
  assert.equal(r.ok && r.resumen.posiblesDuplicados, 1);
  const nuevo = base.tablas.cobros_externos.find(f => f.fuente === 'norma43') as Fila;
  assert.equal(nuevo.posible_duplicado_de, 'cex-csv');
  assert.equal(mov1(base, 'cex-csv').posible_duplicado_de, nuevo.id);
});

test('recuperación sin poder saber quién lo empezó: se anota igual, a nombre de quien abre la bandeja y diciéndolo', () => {
  return (async () => {
    const base = baseFalsa({
      cobros_externos: [movimiento({ estado: 'CONFIRMANDO', recibo_id: 'rec-1', bloqueado_en: '2026-10-05T09:50:00Z', resuelto_por: '00000000-0000-4000-8000-000000000009' })],
      recibos: [recibo({ estado: 'COBRADO', fecha_cobro: '2026-10-01', conciliado_por: 'externo', metodo_cobro: 'TRANSFERENCIA' })],
      studios: [{ id: 'studio-1', owner_auth_user_id: SESION.userId }], instructores: [], auditoria_estudio: [],
    });
    const { deps } = dobles(base);
    await recuperarColgados(base.admin, SESION, deps);
    const [e] = base.tablas.auditoria_estudio;
    assert.equal(e.actor_uid, SESION.userId);
    assert.equal((e.contexto as Fila).iniciado_por, '00000000-0000-4000-8000-000000000009');
  })();
});

test('recepción no fecha un cobro antes del mes pasado; la propietaria sí', async () => {
  const viejo = movimiento({ fecha_operacion: '2026-08-20' });
  const r1 = baseFalsa({ cobros_externos: [viejo], recibos: [recibo({ fecha_vencimiento: '2026-08-20' })] });
  const d1 = dobles(r1);
  const r = await confirmarMovimiento(r1.admin, { sesion: { ...SESION, rol: 'RECEPCION' }, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, d1.deps);
  assert.equal(!r.ok && r.codigo, 'DATOS');
  assert.equal(d1.llamadas.length, 0);
  const r2 = baseFalsa({ cobros_externos: [viejo], recibos: [recibo({ fecha_vencimiento: '2026-08-20' })] });
  const d2 = dobles(r2);
  assert.equal((await confirmarMovimiento(r2.admin, { sesion: SESION, movimientoId: 'cex-1', reciboId: 'rec-1', avisarSocia: false }, d2.deps)).ok, true);
});

test('volver a emparejar no reescribe una decisión que no ha cambiado (aunque jsonb reordene sus claves)', async () => {
  const base = baseFalsa({ cobros_externos: [], cobros_externos_lotes: [], recibos: [recibo()], socios: [{ id: 'soc-1', studio_id: 'studio-1', nombre: 'María', apellidos: 'García López' }] });
  await importarLote(base.admin, { sesion: SESION, fuente: 'norma43', nombreFichero: null, lectura: lectura([mn({})]) });
  // Como la devuelve jsonb: mismas claves, otro orden.
  const fila = base.tablas.cobros_externos[0];
  const d = fila.decision as Record<string, unknown>;
  fila.decision = { nivel: d.nivel, dobleCobro: d.dobleCobro, version: d.version, candidatas: d.candidatas };
  const antes = base.escrituras.length;
  assert.equal(await reemparejarPendientes(base.admin, 'studio-1'), 0);
  assert.equal(base.escrituras.length, antes);
  // Aparece su recibo de renovación después: ahora sí cambia.
  base.tablas.recibos.push(recibo({ id: 'rec-renov', socio_id: 'soc-1', fecha_vencimiento: '2026-10-02' }));
  assert.equal(await reemparejarPendientes(base.admin, 'studio-1'), 1);
});
