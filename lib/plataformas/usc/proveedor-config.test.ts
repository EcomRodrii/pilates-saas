import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  prepararConfigUsc, uscVerificada, parUsc, MENSAJE_IDS_USC_NO_VALIDOS, type DepsConfigUsc,
} from './proveedor-config.ts';

const P = '2bf3717c-348d-4e41-a2db-d32c35ae294c';
const L = 'b4302549-7d29-4d3e-9605-79ff8867f9d9';
const CRED = { base: 'https://usc.invalid', clientId: 'x', secreto: 'y' };

function deps(o: Partial<DepsConfigUsc> & { llamadas?: { n: number } } = {}): DepsConfigUsc {
  return {
    credenciales: () => null,
    ubicaciones: async () => { if (o.llamadas) o.llamadas.n++; return { ok: true, valor: [{ id: L, nombre: 'x', estado: 'Active' }] }; },
    ocupado: async () => false,
    ...o,
  };
}

test('par normalizado: minúsculas y sin espacios; falta uno o no es UUID = null', () => {
  assert.deepEqual(parUsc({ providerId: ` ${P.toUpperCase()} `, locationId: L }), { providerId: P, locationId: L });
  assert.equal(parUsc({ providerId: P }), null);
  assert.equal(parUsc({ providerId: 'abc', locationId: L }), null);
});

test('sin credenciales: se guarda pero NO verificado, y se descarta la marca que mande el navegador', async () => {
  const r = await prepararConfigUsc({
    enviada: { modo: 'api', providerId: P.toUpperCase(), locationId: L, verificadoPar: `${P}/${L}` }, guardada: {}, deps: deps(),
  });
  assert.ok(r.ok);
  assert.equal(r.verificada, false);
  assert.equal(r.config.verificadoPar, undefined);
  assert.equal(r.config.providerId, P);
  assert.equal(uscVerificada(r.config), false);
});

test('con credenciales: valida contra /locations y marca el par', async () => {
  const llamadas = { n: 0 };
  const r = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ credenciales: () => CRED, llamadas }) });
  assert.ok(r.ok && r.verificada);
  assert.equal(llamadas.n, 1);
  assert.equal(uscVerificada(r.config), true);
});

test('con credenciales: ubicación ajena al proveedor, inactiva o proveedor desconocido = mismo rechazo neutro', async () => {
  const casos: DepsConfigUsc['ubicaciones'][] = [
    async () => ({ ok: true, valor: [{ id: '11111111-1111-1111-1111-111111111111', nombre: '', estado: 'Active' }] }),
    async () => ({ ok: true, valor: [{ id: L, nombre: '', estado: 'Terminated' }] }),
    async () => ({ ok: false, error: 'USC 404' }),
  ];
  for (const ubicaciones of casos) {
    const r = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ credenciales: () => CRED, ubicaciones }) });
    assert.deepEqual(r, { ok: false, status: 409, error: MENSAJE_IDS_USC_NO_VALIDOS });
  }
});

test('ID ya de otro estudio: el mismo mensaje neutro, sin llamar a USC', async () => {
  const llamadas = { n: 0 };
  const r = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ ocupado: async () => true, credenciales: () => CRED, llamadas }) });
  assert.deepEqual(r, { ok: false, status: 409, error: MENSAJE_IDS_USC_NO_VALIDOS });
  assert.equal(llamadas.n, 0);
  assert.ok(!/estudio|otro/i.test(MENSAJE_IDS_USC_NO_VALIDOS));
});

test('si no se puede comprobar (USC caído o base de datos) no se guarda nada: 503', async () => {
  const a = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ credenciales: () => CRED, ubicaciones: async () => ({ ok: false, error: 'USC 500' }) }) });
  assert.ok(!a.ok && a.status === 503);
  const b = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ ocupado: async () => { throw new Error('x'); } }) });
  assert.ok(!b.ok && b.status === 503);
});

test('un par guardado sin verificar se verifica al volver a guardar con credenciales; 401/429 no culpan al estudio', async () => {
  const guardada = { providerId: P, locationId: L };
  const r = await prepararConfigUsc({ enviada: { ...guardada }, guardada, deps: deps({ credenciales: () => CRED }) });
  assert.ok(r.ok && r.verificada && uscVerificada(r.config));
  for (const error of ['USC 401', 'USC 403', 'USC 429']) {
    const x = await prepararConfigUsc({ enviada: { providerId: P, locationId: L }, guardada: {}, deps: deps({ credenciales: () => CRED, ubicaciones: async () => ({ ok: false, error }) }) });
    assert.ok(!x.ok && x.status === 503, error);
  }
});

test('formato: falta uno de los dos o no es UUID = 400; sin ninguno (volver a manual) pasa', async () => {
  const a = await prepararConfigUsc({ enviada: { providerId: P }, guardada: {}, deps: deps() });
  assert.ok(!a.ok && a.status === 400);
  const b = await prepararConfigUsc({ enviada: { modo: 'manual' }, guardada: {}, deps: deps() });
  assert.ok(b.ok);
});

test('mismo par que ya tenía: no se vuelve a comprobar y conserva su marca; si cambia, se invalida', async () => {
  const llamadas = { n: 0 };
  const guardada = { providerId: P, locationId: L, verificadoPar: `${P}/${L}` };
  const igual = await prepararConfigUsc({
    enviada: { ...guardada, modo: 'manual' }, guardada,
    deps: deps({ credenciales: () => CRED, llamadas, ocupado: async () => { throw new Error('no debe consultarse'); } }),
  });
  assert.ok(igual.ok && igual.verificada);
  assert.equal(llamadas.n, 0);
  const otro = '33333333-3333-3333-3333-333333333333';
  const cambia = await prepararConfigUsc({ enviada: { providerId: otro, locationId: L }, guardada, deps: deps() });
  assert.ok(cambia.ok && !cambia.verificada);
  assert.equal(uscVerificada({ providerId: otro, locationId: L, verificadoPar: `${P}/${L}` }), false);
});

const leer = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');

test('ruta PUT: lista blanca, studioId de la sesión, solo PROPIETARIO, USC pasa por prepararConfigUsc', () => {
  const ruta = leer('app/api/integrations/config/route.ts');
  const put = ruta.slice(ruta.indexOf('export async function PUT'));
  assert.match(put, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(put, /TIPOS_CON_CAMPOS\.includes\(tipo\)/);
  assert.ok(!/cuerpo\??\.studioId|searchParams/.test(put));
  assert.match(put, /dbGuardarIntegracion\(sesion\.studioId,/);
  assert.match(put, /tipo === 'URBAN_SPORTS_CLUB'[\s\S]*prepararConfigUsc\(/);
  assert.ok(put.indexOf('prepararConfigUsc(') < put.indexOf('dbGuardarIntegracion('));
  const ini = ruta.indexOf('TIPOS_CON_CAMPOS: ');
  const lista = ruta.slice(ini, ruta.indexOf('];', ini));
  for (const t of ['STRIPE', 'GMAIL', 'GOOGLE_CALENDAR', 'ZOOM', 'KLAVIYO', 'ZAPIER']) assert.ok(!lista.includes(`'${t}'`), t);
});

test('el cron de horario no llama a USC con IDs sin verificar', () => {
  const src = leer('lib/plataformas/usc/horario-servidor.ts');
  assert.match(src, /if \(!cfg\) continue;[^\n]*\n[^\n]*\n\s*if \(!uscVerificada\(config\)\) continue;/);
});

test('migración: dos índices únicos parciales, solo aditiva, con guarda de duplicados', () => {
  const sql = leer('supabase/migrations/20261015110000_usc_proveedor_unico.sql');
  assert.match(sql, /create unique index if not exists integraciones_usc_provider_id_key[\s\S]*lower\(btrim\(config->>'providerId'\)\)[\s\S]*where tipo = 'URBAN_SPORTS_CLUB'/);
  assert.match(sql, /create unique index if not exists integraciones_usc_location_id_key/);
  assert.match(sql, /raise exception 'integraciones: hay un providerId de USC repetido/);
  assert.ok(!/\bdrop\b|\bdelete\b|\bupdate\b|alter table/i.test(sql.replace(/--[^\n]*/g, '')));
});

test('dbGuardarIntegracion: un 23505 de USC no dice de quién es el ID', () => {
  const src = leer('lib/db/supabase-data-admin.ts');
  assert.match(src, /datos\.tipo === 'URBAN_SPORTS_CLUB'\) return \{ ok: false, conflict: true, error: MENSAJE_IDS_USC_NO_VALIDOS \}/);
});
