// Avisos de integrador de USC (webhook tipo 4): lectura, decisión, vigente,
// vista de la propietaria, interruptor, buzón contra una base de mentira y
// guardias estáticas (orden de la ruta, migración, nada de datos en logs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esAvisoIntegradorUsc, leerAvisoIntegradorUsc } from './avisos.ts';
import { decidirEstadoAviso, normalizarNombre, textoHuellaAviso, vigentePorProveedor } from './avisos-decision.ts';
import { vistaDeAvisos, type FilaAvisoVista } from './avisos-vista.ts';
import { registrarAvisoIntegrador, MAX_AVISOS_POR_HORA } from './avisos-servidor.ts';
import { uscAvisosIntegradorEncendido, uscAvisosRecepcionEncendida } from '../../interruptor-por-estudio.ts';

const leer = (f: string) => readFileSync(new URL(`../../../${f}`, import.meta.url), 'utf8');
const P1 = '9cea2ae4-51b0-4a19-869e-88c5bfdb7f96';
const L1 = '74fa66ee-31d8-4e60-939d-7a5642e824d6';
const AHORA = Date.parse('2026-10-15T12:00:00Z');

// Los cinco cuerpos de la documentación pública de USC.
const ASOCIADO = { ClientId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', ProviderId: P1, ProviderName: 'Estudio Ejemplo', StartDate: '2026-10-01T00:00:00+00:00', EndDate: null, ModifiedDate: '2026-10-10T09:30:19.329208+00:00', Type: 'IntegratorAssociated' };
const ACTUALIZADO = { ClientId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', ProviderId: P1, StartDate: '2026-10-01T00:00:00+00:00', EndDate: '2026-12-31T00:00:00+00:00', ModifiedDate: '2026-10-12T12:01:06.7062314+00:00', Type: 'IntegratorUpdated' };
const RETIRADO = { ClientId: '3fa85f64-5717-4562-b3fc-2c963f66afa6', ProviderId: P1, StartDate: null, EndDate: null, ModifiedDate: '2026-10-13T12:02:22.8877275+00:00', Type: 'IntegratorRemoved' };
const UBI_ALTA = { ProviderId: P1, LocationId: L1, Name: 'Sede Ejemplo', StartDate: '2026-10-01T00:00:00+00:00', Status: 'active', Type: 'IntegratorLocationAdded' };
const UBI_BAJA = { ProviderId: P1, LocationId: L1, EndDate: '2026-10-20T00:00:00+00:00', Status: 'terminated', Type: 'IntegratorLocationTerminated' };

test('lectura: los cinco cuerpos de la doc se entienden; los de ubicación, sin ClientId ni ModifiedDate', () => {
  for (const c of [ASOCIADO, ACTUALIZADO, RETIRADO, UBI_ALTA, UBI_BAJA]) {
    const r = leerAvisoIntegradorUsc(c, AHORA);
    assert.equal(r.ok, true, JSON.stringify(c));
    assert.ok(esAvisoIntegradorUsc(c));
  }
  const a = leerAvisoIntegradorUsc(ASOCIADO, AHORA);
  assert.equal(a.ok && a.aviso.providerName, 'Estudio Ejemplo');
  const u = leerAvisoIntegradorUsc(UBI_ALTA, AHORA);
  assert.ok(u.ok && u.aviso.locationId === L1 && u.aviso.modificado === null && u.aviso.providerName === null);
  // ProviderName solo se toma del alta.
  const r = leerAvisoIntegradorUsc({ ...ACTUALIZADO, ProviderName: 'Otro' }, AHORA);
  assert.ok(r.ok && r.aviso.providerName === null);
});

test('lectura: lo que no cuadra se descarta (tipo, UUID, fecha, futuro lejano)', () => {
  assert.equal(leerAvisoIntegradorUsc({ ...ASOCIADO, Type: 'Otra' }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc({ ...ASOCIADO, ProviderId: 'x/../y' }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc({ ...ASOCIADO, ModifiedDate: 'ayer' }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc({ ...ASOCIADO, ModifiedDate: undefined }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc({ ...RETIRADO, ModifiedDate: '2099-01-01T00:00:00Z' }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc({ ...UBI_ALTA, LocationId: 'no' }, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc(null, AHORA).ok, false);
  assert.equal(leerAvisoIntegradorUsc([ASOCIADO], AHORA).ok, false);
  assert.equal(esAvisoIntegradorUsc({ ...ASOCIADO, BookingStatus: 'Booked' }), false);
});

test('nombre normalizado y huella estable', () => {
  assert.equal(normalizarNombre('  Estudio  Ejémplo, S.L. '), 'ESTUDIO EJEMPLO S L');
  assert.equal(normalizarNombre('Pilates-Núñez'), normalizarNombre('pilates nunez'));
  const a = leerAvisoIntegradorUsc(ASOCIADO, AHORA); const b = leerAvisoIntegradorUsc(ASOCIADO, AHORA);
  const c = leerAvisoIntegradorUsc({ ...ASOCIADO, ModifiedDate: '2026-10-11T00:00:00Z' }, AHORA);
  assert.ok(a.ok && b.ok && c.ok);
  assert.equal(textoHuellaAviso(a.aviso), textoHuellaAviso(b.aviso));
  assert.notEqual(textoHuellaAviso(a.aviso), textoHuellaAviso(c.aviso));
});

test('decisión: 0 o 2+ coincidencias no ofrecen nada; 1 es candidato; nada se aplica solo', () => {
  const base = { tipo: 'IntegratorAssociated' as const, providerId: P1, confirmadoPor: null };
  assert.deepEqual(decidirEstadoAviso({ ...base, coincidencias: [] }), { estado: 'SIN_ASIGNAR', candidato: null });
  assert.deepEqual(decidirEstadoAviso({ ...base, coincidencias: [{ studioId: 'a', providerIdActual: null }, { studioId: 'b', providerIdActual: null }] }), { estado: 'SIN_ASIGNAR', candidato: null });
  assert.deepEqual(decidirEstadoAviso({ ...base, coincidencias: [{ studioId: 'a', providerIdActual: null }] }), { estado: 'PENDIENTE', candidato: 'a' });
});

test('decisión: otro proveedor ya puesto = conflicto, el mismo = informativo, ya confirmado por otro = conflicto', () => {
  const base = { tipo: 'IntegratorAssociated' as const, providerId: P1 };
  assert.equal(decidirEstadoAviso({ ...base, confirmadoPor: null, coincidencias: [{ studioId: 'a', providerIdActual: 'otro' }] }).estado, 'CONFLICTO');
  assert.equal(decidirEstadoAviso({ ...base, confirmadoPor: null, coincidencias: [{ studioId: 'a', providerIdActual: P1.toUpperCase() }] }).estado, 'INFORMATIVO');
  assert.equal(decidirEstadoAviso({ ...base, confirmadoPor: 'b', coincidencias: [{ studioId: 'a', providerIdActual: null }] }).estado, 'CONFLICTO');
});

test('decisión: Updated, Removed y de ubicación solo informan al estudio que ya tiene ese proveedor', () => {
  for (const tipo of ['IntegratorUpdated', 'IntegratorRemoved', 'IntegratorLocationAdded', 'IntegratorLocationTerminated'] as const) {
    assert.deepEqual(decidirEstadoAviso({ tipo, providerId: P1, confirmadoPor: null, coincidencias: [] }), { estado: 'SIN_ASIGNAR', candidato: null });
    assert.deepEqual(decidirEstadoAviso({ tipo, providerId: P1, confirmadoPor: 'a', coincidencias: [] }), { estado: 'INFORMATIVO', candidato: 'a' });
  }
});

function permutaciones<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map(r => [x, ...r]));
}

test('vigente: las mismas filas en cualquier orden de llegada dan el mismo aviso vigente', () => {
  const filas = [
    { tipo: 'IntegratorAssociated' as const, modificado: '2026-10-10T00:00:00Z', recibidoEn: '2026-10-10T00:00:01Z' },
    { tipo: 'IntegratorUpdated' as const, modificado: '2026-10-12T00:00:00Z', recibidoEn: '2026-10-12T00:00:01Z' },
    { tipo: 'IntegratorRemoved' as const, modificado: '2026-10-13T00:00:00Z', recibidoEn: '2026-10-13T00:00:01Z' },
    { tipo: 'IntegratorLocationAdded' as const, modificado: null, recibidoEn: '2026-10-14T00:00:00Z' },
  ];
  for (const p of permutaciones(filas)) assert.equal(vigentePorProveedor(p)?.tipo, 'IntegratorRemoved');
  assert.equal(vigentePorProveedor([filas[3]]), null);
});

const fila = (tipo: FilaAvisoVista['tipo'], extra: Partial<FilaAvisoVista> = {}): FilaAvisoVista => ({
  tipo, provider_id: P1, provider_nombre: 'Estudio Ejemplo', estado: 'PENDIENTE',
  modificado_usc: '2026-10-10T00:00:00Z', fin: null, recibido_en: '2026-10-10T00:00:01Z', ...extra,
});

test('vista: pendiente solo con USC activada y sin proveedor puesto; nunca enseña ids', () => {
  const sin = { providerId: null, integracionActiva: true };
  const v = vistaDeAvisos([fila('IntegratorAssociated')], sin, AHORA);
  assert.deepEqual(v, { situacion: 'pendiente', nombre: 'Estudio Ejemplo', fin: null });
  assert.ok(!JSON.stringify(v).includes(P1));
  assert.equal(vistaDeAvisos([fila('IntegratorAssociated')], { providerId: null, integracionActiva: false }, AHORA), null);
  assert.equal(vistaDeAvisos([fila('IntegratorAssociated', { estado: 'RECHAZADO' })], sin, AHORA)?.situacion, 'rechazado');
  assert.equal(vistaDeAvisos([fila('IntegratorAssociated', { estado: 'SIN_ASIGNAR' })], sin, AHORA), null);
});

test('vista: conflicto, baja y fin; un aviso falso viejo no queda para siempre', () => {
  const alta = fila('IntegratorAssociated');
  assert.equal(vistaDeAvisos([alta], { providerId: 'otro', integracionActiva: true }, AHORA)?.situacion, 'conflicto');
  const suyo = { providerId: P1, integracionActiva: true };
  assert.equal(vistaDeAvisos([alta], suyo, AHORA), null);
  assert.equal(vistaDeAvisos([alta, fila('IntegratorRemoved', { modificado_usc: '2026-10-13T00:00:00Z', recibido_en: '2026-10-13T00:00:00Z' })], suyo, AHORA)?.situacion, 'baja');
  const fin = vistaDeAvisos([alta, fila('IntegratorUpdated', { modificado_usc: '2026-10-12T00:00:00Z', recibido_en: '2026-10-12T00:00:00Z', fin: '2026-12-31T00:00:00Z' })], suyo, AHORA);
  assert.equal(fin?.situacion, 'fin');
  // Un Removed sin su proveedor puesto no dice nada; uno de hace un año ya no cuenta.
  assert.equal(vistaDeAvisos([alta, fila('IntegratorRemoved', { modificado_usc: '2026-10-13T00:00:00Z' })], { providerId: null, integracionActiva: true }, AHORA), null);
  assert.equal(vistaDeAvisos([fila('IntegratorAssociated', { recibido_en: '2025-01-01T00:00:00Z' })], { providerId: null, integracionActiva: true }, AHORA), null);
});

test('interruptor: vacío apagado; on y estudios:… con las dos lecturas', () => {
  assert.equal(uscAvisosRecepcionEncendida(undefined), false);
  assert.equal(uscAvisosRecepcionEncendida(''), false);
  assert.equal(uscAvisosRecepcionEncendida('basura'), false);
  assert.equal(uscAvisosRecepcionEncendida('estudios:'), false);
  assert.equal(uscAvisosRecepcionEncendida('on'), true);
  assert.equal(uscAvisosRecepcionEncendida(' estudios: a , b '), true);
  assert.equal(uscAvisosIntegradorEncendido('a', 'on'), true);
  assert.equal(uscAvisosIntegradorEncendido('a', 'estudios:a,b'), true);
  assert.equal(uscAvisosIntegradorEncendido('c', 'estudios:a,b'), false);
  assert.equal(uscAvisosIntegradorEncendido('a', undefined), false);
});

// Una base de datos de mentira que cuenta llamadas.
function baseDeMentira(o: { estudios?: { id: string; nombre: string }[]; integraciones?: { studio_id: string; config: unknown }[]; confirmado?: string | null; filasHora?: number; falla?: boolean }) {
  const inserts: Record<string, unknown>[] = [];
  let llamadas = 0;
  const admin = {
    from(tabla: string) {
      llamadas++;
      const q: Record<string, unknown> = {};
      const fin = (): { data: unknown; error: unknown; count?: number } => {
        if (o.falla && tabla === 'studios') return { data: null, error: { message: 'caída' } };
        if (tabla === 'studios') return { data: o.estudios ?? [], error: null };
        if (tabla === 'integraciones') return { data: o.integraciones ?? [], error: null };
        return { data: o.confirmado ? { estudio_candidato_id: o.confirmado } : null, error: null, count: o.filasHora ?? 0 };
      };
      for (const m of ['select', 'eq', 'gte']) q[m] = () => q;
      q.maybeSingle = async () => fin();
      q.upsert = async (fila: Record<string, unknown>) => { inserts.push(fila); return { error: null }; };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(fin()).then(res);
      return q;
    },
  };
  return { admin: admin as unknown as SupabaseClient, inserts, llamadas: () => llamadas };
}

test('buzón: un alta con un solo estudio del mismo nombre queda PENDIENTE para él y no toca ninguna configuración', async () => {
  const b = baseDeMentira({ estudios: [{ id: 'a', nombre: 'ESTUDIO ejemplo' }, { id: 'b', nombre: 'Otro' }], integraciones: [{ studio_id: 'a', config: { modo: 'manual' } }] });
  const r = await registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA });
  assert.deepEqual(r, { resultado: 'guardado', estado: 'PENDIENTE' });
  assert.equal(b.inserts.length, 1);
  assert.equal(b.inserts[0].estudio_candidato_id, 'a');
  assert.equal(b.inserts[0].estado, 'PENDIENTE');
});

test('buzón: un nombre repetido entre estudios no ofrece el proveedor a nadie', async () => {
  const b = baseDeMentira({ estudios: [{ id: 'a', nombre: 'Estudio Ejemplo' }, { id: 'b', nombre: 'estudio ejemplo' }] });
  const r = await registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA });
  assert.deepEqual(r, { resultado: 'guardado', estado: 'SIN_ASIGNAR' });
  assert.equal(b.inserts[0].estudio_candidato_id, null);
});

test('buzón: otro estudio ya con ese proveedor, o confirmado, hace conflicto; nunca sobrescribe', async () => {
  const b = baseDeMentira({
    estudios: [{ id: 'a', nombre: 'Estudio Ejemplo' }],
    integraciones: [{ studio_id: 'z', config: { providerId: P1.toUpperCase() } }],
  });
  assert.deepEqual(await registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA }), { resultado: 'guardado', estado: 'CONFLICTO' });
  const c = baseDeMentira({ estudios: [{ id: 'a', nombre: 'Estudio Ejemplo' }], confirmado: 'z' });
  assert.deepEqual(await registrarAvisoIntegrador(c.admin, ASOCIADO, { ahora: AHORA }), { resultado: 'guardado', estado: 'CONFLICTO' });
});

test('buzón: formato malo, cliente ajeno y exceso por hora se ignoran sin guardar; un error de la base de datos lanza (500)', async () => {
  let b = baseDeMentira({});
  assert.deepEqual(await registrarAvisoIntegrador(b.admin, { Type: 'IntegratorAssociated' }, { ahora: AHORA }), { resultado: 'ignorado', motivo: 'formato' });
  assert.equal(b.llamadas(), 0);
  assert.deepEqual(await registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA, clientIdPropio: 'otro-client' }), { resultado: 'ignorado', motivo: 'cliente-ajeno' });
  b = baseDeMentira({ filasHora: MAX_AVISOS_POR_HORA });
  assert.deepEqual(await registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA }), { resultado: 'ignorado', motivo: 'limite' });
  assert.equal(b.inserts.length, 0);
  b = baseDeMentira({ falla: true });
  await assert.rejects(() => registrarAvisoIntegrador(b.admin, ASOCIADO, { ahora: AHORA }), /avisos/);
});

test('guardia: en la ruta, USC se consulta ANTES de reclamar y de guardar la configuración, y el estudio sale de la sesión', () => {
  const ruta = leer('app/api/plataformas/usc/avisos/route.ts');
  const confirmar = ruta.slice(ruta.indexOf('// Confirmar.'));
  const orden = ['credencialesUsc()', 'ubicacionesUsc(creds', "estado: 'CONFIRMADO'", 'dbGuardarIntegracion('].map(t => confirmar.indexOf(t));
  assert.ok(orden.every(i => i >= 0), String(orden));
  assert.deepEqual([...orden].sort((x, y) => x - y), orden);
  assert.match(ruta, /\.eq\('estudio_candidato_id', studioId\)/);
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);
  assert.ok(ruta.indexOf("sesion.rol !== 'PROPIETARIO'") < ruta.indexOf('uscAvisosIntegradorEncendido(sesion.studioId)'));
  // Nada del navegador decide el proveedor ni la ubicación.
  assert.ok(!/cuerpo\??\.(providerId|locationId)/.test(ruta));
  assert.ok(!/studioId\s*=\s*cuerpo/.test(ruta));
  assert.ok(!ruta.includes('providerId:') || !/NextResponse\.json\([^)]*providerId/.test(ruta));
});

test('guardia: ni el buzón ni el webhook registran el cuerpo, ProviderName ni nombres de ubicación', () => {
  for (const f of ['lib/plataformas/usc/avisos-servidor.ts', 'lib/plataformas/usc/avisos.ts', 'lib/plataformas/usc/avisos-vista.ts']) {
    assert.ok(!/console\./.test(leer(f)), f);
  }
  const wh = leer('app/api/plataformas/usc/webhook/route.ts');
  const bloque = wh.slice(wh.indexOf('esAvisoIntegradorUsc(cuerpo)'), wh.indexOf('const lectura'));
  for (const m of bloque.matchAll(/console\.error\(([^\n]*)\)/g)) {
    assert.ok(!/cuerpo|providerName|ProviderName/.test(m[1]), m[1]);
  }
});

test('migración: tabla del buzón con RLS, doble factor, sin permisos al navegador y guarda', () => {
  const sql = leer('supabase/migrations/20261015100000_usc_avisos_integrador.sql');
  assert.match(sql, /enable row level security/);
  assert.match(sql, /create policy exige_doble_factor on public\.usc_avisos_integrador as restrictive/);
  assert.match(sql, /revoke all on public\.usc_avisos_integrador from anon, authenticated/);
  assert.match(sql, /grant all on public\.usc_avisos_integrador to service_role/);
  assert.match(sql, /has_table_privilege\('anon'/);
  assert.match(sql, /huella text not null unique/);
  assert.match(sql, /create unique index if not exists usc_avisos_proveedor_confirmado[\s\S]*where tipo = 'IntegratorAssociated' and estado = 'CONFIRMADO'/);
  // Solo aditiva.
  assert.ok(!/drop |alter table public\.(?!usc_avisos)/i.test(sql));
});

test('webhook: sin el interruptor de recepción el aviso se ignora como siempre; sin credenciales se rechaza todo', () => {
  const wh = leer('app/api/plataformas/usc/webhook/route.ts');
  assert.match(wh, /if \(!uscAvisosRecepcionEncendida\(\)\) return NextResponse\.json\(\{ ok: true, ignorado: 'integracion' \}\);/);
  // La firma se comprueba antes de leer nada.
  assert.ok(wh.indexOf('verificarSecretoWebhookUsc') < wh.indexOf('req.text()'));
});
