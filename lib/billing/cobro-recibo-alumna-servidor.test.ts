import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cobroDeReciboEnServidor, contextoCobroAlumna } from './cobro-recibo-alumna-servidor.ts';
import { leTocaPagarlaAElla } from './cobro-recibo-alumna.ts';

// Las lecturas de «quién cobra» con un cliente falso: qué se lee, que filtra por estudio, y que una lectura fallida
// es `null`/`ok: false` (quien llama falla cerrado), nunca «le toca a ella».

type Filas = Record<string, unknown>[];
interface Tabla { filas: Filas; error?: { message: string } | null }

function clienteFalso(tablas: Record<string, Tabla>) {
  const lecturas: { tabla: string; filtros: [string, unknown][] }[] = [];
  const admin = {
    from(tabla: string) {
      const filtros: [string, unknown][] = [];
      lecturas.push({ tabla, filtros });
      const t = tablas[tabla] ?? { filas: [] };
      const filtradas = () => t.filas.filter((f) => filtros.every(([col, v]) =>
        Array.isArray(v) ? v.includes(f[col]) : f[col] === undefined || f[col] === v));
      const res = () => (t.error ? { data: null, error: t.error } : { data: filtradas(), error: null });
      const b = {
        select: () => b,
        eq: (col: string, v: unknown) => { filtros.push([col, v]); return b; },
        in: (col: string, v: unknown[]) => { filtros.push([col, v]); return b; },
        limit: () => b,
        maybeSingle: async () => (t.error ? { data: null, error: t.error } : { data: filtradas()[0] ?? null, error: null }),
        then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(res()).then(ok, ko),
      };
      return b;
    },
  };
  return { admin: admin as unknown as SupabaseClient, lecturas };
}

const HOY = '2026-10-12';
const RECIBO = {
  id: 'rec-renov-sus-1-2026-10', socio_id: 'soc-1', studio_id: 'est-1', estado: 'PENDIENTE', importe: 89, importe_devuelto: 0,
  es_renovacion: true, proximo_reintento: null, fecha_vencimiento: '2026-10-04', suscripcion_id: 'sus-1',
};
const CUOTA = { id: 'sus-1', studio_id: 'est-1', socio_id: 'soc-1', estado: 'ACTIVA', fecha_fin: '2026-10-04', planes_tarifa: { tipo: 'MENSUAL' } };
const ESTUDIO_CON_REMESAS = { id: 'est-1', stripe_account_id: 'acct_1', sepa_acreedor_id: 'ES00ZZZ', sepa_iban: 'ES00', sepa_titular: 'Estudio' };
const ESTUDIO_SIN_REMESAS = { id: 'est-1', stripe_account_id: 'acct_1', sepa_acreedor_id: null, sepa_iban: null, sepa_titular: null };
const SOCIA_SIN_METODO = { id: 'soc-1', studio_id: 'est-1', metodo_pago_preferido: null, stripe_payment_method_id: null, sepa_payment_method_id: null };
const MANDATO = { socio_id: 'soc-1', studio_id: 'est-1', estado: 'VIGENTE' };

test('domiciliada sin tarjeta en un estudio con remesas: su renovación la cobra el banco, no ella (el aviso no sale)', async () => {
  const { admin } = clienteFalso({
    recibos: { filas: [RECIBO] }, studios: { filas: [ESTUDIO_CON_REMESAS] }, socios: { filas: [SOCIA_SIN_METODO] },
    mandatos_sepa: { filas: [MANDATO] }, suscripciones: { filas: [CUOTA] },
  });
  const r = await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY });
  assert.deepEqual(r, { ok: true, cobro: { como: 'BANCO', via: 'remesa', desde: null }, socioId: 'soc-1' });
  assert.equal(leTocaPagarlaAElla(r.ok ? r.cobro : null), false);
});

test('sin mandato (o el estudio sin remesas), la misma renovación le toca a ella', async () => {
  for (const [estudio, mandatos] of [[ESTUDIO_CON_REMESAS, []], [ESTUDIO_SIN_REMESAS, [MANDATO]]] as const) {
    const { admin } = clienteFalso({
      recibos: { filas: [RECIBO] }, studios: { filas: [estudio] }, socios: { filas: [SOCIA_SIN_METODO] },
      mandatos_sepa: { filas: [...mandatos] }, suscripciones: { filas: [CUOTA] },
    });
    const r = await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY });
    assert.deepEqual(r, { ok: true, cobro: { como: 'APP' }, socioId: 'soc-1' });
  }
});

test('un mandato que no está VIGENTE no la mete en la remesa: le toca a ella', async () => {
  const { admin } = clienteFalso({
    recibos: { filas: [RECIBO] }, studios: { filas: [ESTUDIO_CON_REMESAS] }, socios: { filas: [SOCIA_SIN_METODO] },
    mandatos_sepa: { filas: [{ ...MANDATO, estado: 'REVOCADO' }] }, suscripciones: { filas: [CUOTA] },
  });
  assert.deepEqual(await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }), { ok: true, cobro: { como: 'APP' }, socioId: 'soc-1' });
});

test('domiciliada con la cuota aún sin vencer: irá en la remesa cuando venza (y con un pago abierto por ella, lo paga ella)', async () => {
  const base = {
    studios: { filas: [ESTUDIO_CON_REMESAS] }, socios: { filas: [SOCIA_SIN_METODO] },
    mandatos_sepa: { filas: [MANDATO] }, suscripciones: { filas: [{ ...CUOTA, fecha_fin: '2026-10-31' }] },
  };
  const sinVencer = clienteFalso({ ...base, recibos: { filas: [RECIBO] } });
  assert.deepEqual(await cobroDeReciboEnServidor(sinVencer.admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }),
    { ok: true, cobro: { como: 'BANCO', via: 'remesa', desde: null, cuandoVenza: true }, socioId: 'soc-1' });
  const conCheckout = clienteFalso({ ...base, recibos: { filas: [{ ...RECIBO, checkout_session_id: 'cs_1' }] } });
  assert.deepEqual(await cobroDeReciboEnServidor(conCheckout.admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }),
    { ok: true, cobro: { como: 'APP' }, socioId: 'soc-1' });
});

test('el recibo se lee con las columnas de «cobro en marcha» que miran la remesa y el dunning', async () => {
  const { COLUMNAS_RECIBO_COBRO_ALUMNA } = await import('./cobro-recibo-alumna-servidor.ts');
  const { COLUMNAS_COBRO_EN_MARCHA } = await import('./remesa-sepa-reglas.ts');
  const cols = COLUMNAS_RECIBO_COBRO_ALUMNA.split(',').map((c) => c.trim());
  for (const c of [...COLUMNAS_COBRO_EN_MARCHA, 'cobro_off_session_clave', 'estado', 'tras_cancelar_cuota', 'suscripcion_id']) {
    assert.ok(cols.includes(c), `falta ${c}`);
  }
});

test('con tarjeta guardada y el reintento programado la cobra su tarjeta', async () => {
  const { admin } = clienteFalso({
    recibos: { filas: [{ ...RECIBO, proximo_reintento: '2026-10-13T08:30:00Z' }] }, studios: { filas: [ESTUDIO_SIN_REMESAS] },
    socios: { filas: [{ ...SOCIA_SIN_METODO, stripe_payment_method_id: 'pm_1' }] }, suscripciones: { filas: [CUOTA] },
  });
  const r = await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY });
  assert.deepEqual(r, { ok: true, cobro: { como: 'TARJETA', desde: '2026-10-13' }, socioId: 'soc-1' });
});

test('una lectura que falla no es «le toca a ella»: ok false (o contexto null)', async () => {
  for (const rota of ['recibos', 'studios', 'socios', 'mandatos_sepa', 'suscripciones'] as const) {
    const tablas: Record<string, Tabla> = {
      recibos: { filas: [RECIBO] }, studios: { filas: [ESTUDIO_CON_REMESAS] }, socios: { filas: [SOCIA_SIN_METODO] },
      mandatos_sepa: { filas: [MANDATO] }, suscripciones: { filas: [CUOTA] },
    };
    tablas[rota] = { filas: [], error: { message: 'timeout' } };
    const { admin } = clienteFalso(tablas);
    assert.deepEqual(await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }), { ok: false }, rota);
  }
  const { admin } = clienteFalso({ penalizaciones: { filas: [], error: { message: 'x' } } });
  const ctx = await contextoCobroAlumna(admin, {
    studioId: 'est-1', socioId: 'soc-1', estudio: ESTUDIO_SIN_REMESAS, socio: {}, hoy: HOY,
    recibos: [{ id: 'rec-penaliz-1', estado: 'PENDIENTE' }],
  });
  assert.equal(ctx, null);
});

test('un recibo de otro estudio o sin alumna: no se sabe, ok false', async () => {
  const otro = clienteFalso({ recibos: { filas: [{ ...RECIBO, studio_id: 'est-2' }] }, studios: { filas: [ESTUDIO_SIN_REMESAS] } });
  assert.deepEqual(await cobroDeReciboEnServidor(otro.admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }), { ok: false });
  const sinSocia = clienteFalso({ recibos: { filas: [{ ...RECIBO, socio_id: null }] }, studios: { filas: [ESTUDIO_SIN_REMESAS] } });
  assert.deepEqual(await cobroDeReciboEnServidor(sinSocia.admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY }), { ok: false });
});

test('todas las lecturas van acotadas al estudio; sin deuda no se lee nada más', async () => {
  const { admin, lecturas } = clienteFalso({
    recibos: { filas: [RECIBO] }, studios: { filas: [ESTUDIO_CON_REMESAS] }, socios: { filas: [SOCIA_SIN_METODO] },
    mandatos_sepa: { filas: [MANDATO] }, suscripciones: { filas: [CUOTA] },
  });
  await cobroDeReciboEnServidor(admin, { studioId: 'est-1', reciboId: RECIBO.id, hoy: HOY });
  for (const l of lecturas) {
    const porEstudio = l.filtros.some(([c, v]) => (c === 'studio_id' || (l.tabla === 'studios' && c === 'id')) && v === 'est-1');
    assert.ok(porEstudio, `${l.tabla} sin filtro de estudio`);
  }
  const vacio = clienteFalso({});
  const ctx = await contextoCobroAlumna(vacio.admin, {
    studioId: 'est-1', socioId: 'soc-1', estudio: ESTUDIO_CON_REMESAS, socio: {}, hoy: HOY, recibos: [{ id: 'a', estado: 'COBRADO' }],
  });
  assert.ok(ctx);
  assert.equal(vacio.lecturas.length, 0);
});
