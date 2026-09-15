import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { secretoValido } from './secreto.ts';
import {
  avisoParaSentry, comprobarFlujos, DEFINICIONES, ID_PENALIZACIONES_COBRADAS_SIN_DINERO,
  ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR,
} from './comprobaciones.ts';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── La puerta ────────────────────────────────────────────────────────────────

test('secretoValido: acepta exactamente el secreto correcto', () => {
  assert.equal(secretoValido('Bearer s3cr3to', 's3cr3to'), true);
});

test('secretoValido: rechaza secreto incorrecto, prefijo y sufijo', () => {
  assert.equal(secretoValido('Bearer otro-cosa', 's3cr3to'), false);
  assert.equal(secretoValido('Bearer s3cr3t', 's3cr3to'), false);
  assert.equal(secretoValido('Bearer s3cr3too', 's3cr3to'), false);
  assert.equal(secretoValido('s3cr3to', 's3cr3to'), false, 'sin el prefijo Bearer no vale');
});

test('secretoValido: sin cabecera no autoriza', () => {
  assert.equal(secretoValido(null, 's3cr3to'), false);
  assert.equal(secretoValido('', 's3cr3to'), false);
});

// ⚠️ El caso que de verdad importa: si CRON_SECRET no está configurado, el
// endpoint NO puede quedar abierto. Sin la guardia de secreto vacío,
// `Bearer ` + '' compararía dos strings iguales y cualquiera entraría.
test('secretoValido: con el secreto sin configurar NO autoriza a nadie', () => {
  assert.equal(secretoValido('Bearer ', ''), false);
  assert.equal(secretoValido('Bearer cualquiera', ''), false);
  assert.equal(secretoValido(null, ''), false);
});

// ── Las comprobaciones ───────────────────────────────────────────────────────

// Doble mínimo: cada comprobación termina en un `{ count, error }`, así que
// basta con un objeto que devuelva eso para ejercitar toda la agregación sin
// tocar la red.
function adminFalso(porTabla: Record<string, { count: number | null; error: { message: string } | null }>) {
  const respuesta = (tabla: string) => porTabla[tabla] ?? { count: 0, error: null };
  const encadenable = (tabla: string) => {
    const r = respuesta(tabla);
    const self: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lte', 'gte', 'like', 'not', 'is', 'limit']) self[m] = () => self;
    // `then` lo hace awaitable: es lo que consume `contar`.
    self.then = (res: (v: typeof r) => unknown) => Promise.resolve(r).then(res);
    return self;
  };
  return { from: (tabla: string) => encadenable(tabla) } as unknown as SupabaseClient;
}

test('todo a cero → ok', async () => {
  const informe = await comprobarFlujos(adminFalso({}));
  assert.equal(informe.estado, 'ok');
  assert.equal(informe.comprobaciones.length, DEFINICIONES.length);
  assert.ok(informe.comprobaciones.every(c => c.estado === 'ok' && c.valor === 0));
});

test('un valor por encima del umbral de aviso → aviso, no fallo', async () => {
  const informe = await comprobarFlujos(adminFalso({ webhook_events: { count: 2, error: null } }));
  const c = informe.comprobaciones.find(x => x.id === 'webhooks-sin-completar')!;
  assert.equal(c.valor, 2);
  assert.equal(c.estado, 'aviso');
  assert.equal(informe.estado, 'aviso', 'el conjunto hereda el peor estado');
});

test('el peor estado manda: un fallo tiñe todo el informe', async () => {
  const informe = await comprobarFlujos(adminFalso({ webhook_events: { count: 99, error: null } }));
  assert.equal(informe.comprobaciones.find(x => x.id === 'webhooks-sin-completar')!.estado, 'fallo');
  assert.equal(informe.estado, 'fallo');
});

// ⚠️ Lo contrario es el bug clásico de los health checks: una comprobación que
// revienta se cuenta como "no hay nada malo" y el panel sale verde mientras el
// sistema arde. No saber es un fallo, no un ok.
test('una comprobación que falla NO cuenta como ok', async () => {
  const informe = await comprobarFlujos(adminFalso({ recibos: { count: null, error: { message: 'permission denied' } } }));
  const c = informe.comprobaciones.find(x => x.id === 'recibos-cobrados-sin-fecha')!;
  assert.equal(c.estado, 'fallo');
  assert.equal(c.error, 'permission denied');
  assert.equal(informe.estado, 'fallo');
});

test('recibos incoherentes: una sola fila ya es fallo, no aviso', async () => {
  const informe = await comprobarFlujos(adminFalso({ recibos: { count: 1, error: null } }));
  assert.equal(informe.comprobaciones.find(x => x.id === 'recibos-cobrados-sin-fecha')!.estado, 'fallo');
});

test('cada comprobación explica su impacto en lenguaje de negocio', () => {
  for (const d of DEFINICIONES) {
    assert.ok(d.impacto.length > 40, `${d.id}: el impacto tiene que decir a quién afecta, no ser una etiqueta`);
    assert.ok(d.umbralFallo >= d.umbralAviso, `${d.id}: el umbral de fallo no puede ser menor que el de aviso`);
  }
});

// ── Penalizaciones con el recibo sin programar ──────────────────────────────

/** Graba la cadena de llamadas de una sola consulta, para ver QUÉ filtra. */
function adminQueGraba(resultado: { count: number | null; error: { message: string } | null }) {
  const llamadas: Array<[string, ...unknown[]]> = [];
  const self: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'lte', 'gte', 'like', 'not', 'is', 'limit']) {
    self[m] = (...args: unknown[]) => { llamadas.push([m, ...args]); return self; };
  }
  self.then = (res: (v: typeof resultado) => unknown) => Promise.resolve(resultado).then(res);
  const admin = { from: (tabla: string) => { llamadas.push(['from', tabla]); return self; } } as unknown as SupabaseClient;
  return { admin, llamadas };
}

test('recibo sin programar: cuenta RECIBO_CREADO con su recibo PENDIENTE y sin reintento, detectadas hace más de 1 h', async () => {
  const def = DEFINICIONES.find(d => d.id === ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR);
  assert.ok(def, 'la comprobación existe junto a las demás');
  const ahora = new Date('2026-09-14T12:00:00.000Z');
  const { admin, llamadas } = adminQueGraba({ count: 3, error: null });
  const r = await def.contar(admin, ahora);
  assert.equal(r.count, 3);
  assert.deepEqual(llamadas[0], ['from', 'penalizaciones']);
  const [, columnas, opciones] = llamadas.find(l => l[0] === 'select')!;
  assert.match(String(columnas), /recibos!inner\(/, 'solo las que tienen recibo');
  assert.deepEqual(opciones, { count: 'exact', head: true }, 'solo el número, nunca filas');
  assert.ok(llamadas.some(l => l[0] === 'eq' && l[1] === 'estado' && l[2] === 'RECIBO_CREADO'));
  assert.ok(llamadas.some(l => l[0] === 'eq' && l[1] === 'recibos.estado' && l[2] === 'PENDIENTE'));
  assert.ok(llamadas.some(l => l[0] === 'is' && l[1] === 'recibos.proximo_reintento' && l[2] === null));
  assert.ok(llamadas.some(l => l[0] === 'lte' && l[1] === 'detectada_en' && l[2] === '2026-09-14T11:00:00.000Z'));
});

test('recibo sin programar: una sola fila ya es aviso en el informe', async () => {
  const informe = await comprobarFlujos(adminFalso({ penalizaciones: { count: 1, error: null } }));
  const c = informe.comprobaciones.find(x => x.id === ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR)!;
  assert.equal(c.valor, 1);
  assert.equal(c.estado, 'aviso');
});

test('aviso para Sentry: nada en verde; solo el número (sin filas ni ids) en aviso o fallo; error si no se pudo contar', () => {
  const def = DEFINICIONES.find(d => d.id === ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR)!;
  assert.equal(avisoParaSentry(def, { count: 0, error: null }), null);
  assert.equal(avisoParaSentry(def, { count: null, error: null }), null);

  const aviso = avisoParaSentry(def, { count: 2, error: null });
  assert.equal(aviso?.nivel, 'warning');
  assert.deepEqual(aviso?.extra, { comprobacion: ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR, valor: 2 });
  // Mensaje estable: el número va en `extra`, para que Sentry agrupe en un issue.
  assert.equal(aviso?.mensaje, `[salud] ${ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR}`);

  assert.equal(avisoParaSentry(def, { count: def.umbralFallo, error: null })?.nivel, 'error');

  const roto = avisoParaSentry(def, { count: null, error: { message: 'timeout' } });
  assert.equal(roto?.nivel, 'error');
  assert.equal(roto?.extra.valor, -1);
});

// ── Penalizaciones cobradas con el recibo devuelto ──────────────────────────

test('cobradas sin dinero: cuenta COBRADA con su recibo DEVUELTO, solo el número', async () => {
  const def = DEFINICIONES.find(d => d.id === ID_PENALIZACIONES_COBRADAS_SIN_DINERO);
  assert.ok(def, 'la comprobación existe junto a las demás');
  const { admin, llamadas } = adminQueGraba({ count: 2, error: null });
  const r = await def.contar(admin, new Date('2026-09-15T12:00:00.000Z'));
  assert.equal(r.count, 2);
  assert.deepEqual(llamadas[0], ['from', 'penalizaciones']);
  const [, columnas, opciones] = llamadas.find(l => l[0] === 'select')!;
  assert.match(String(columnas), /recibos!inner\(/, 'solo las que tienen recibo');
  assert.deepEqual(opciones, { count: 'exact', head: true }, 'solo el número, nunca filas');
  assert.ok(llamadas.some(l => l[0] === 'eq' && l[1] === 'estado' && l[2] === 'COBRADA'));
  assert.ok(llamadas.some(l => l[0] === 'eq' && l[1] === 'recibos.estado' && l[2] === 'DEVUELTO'));
});

test('cobradas sin dinero: una sola fila ya es fallo, y a Sentry va como error', async () => {
  const informe = await comprobarFlujos(adminFalso({ penalizaciones: { count: 1, error: null } }));
  assert.equal(informe.comprobaciones.find(x => x.id === ID_PENALIZACIONES_COBRADAS_SIN_DINERO)!.estado, 'fallo');
  const def = DEFINICIONES.find(d => d.id === ID_PENALIZACIONES_COBRADAS_SIN_DINERO)!;
  assert.equal(avisoParaSentry(def, { count: 1, error: null })?.nivel, 'error');
});

test('el cron de penalizaciones manda a Sentry las dos comprobaciones, y las cobradas sin dinero DESPUÉS de su barrido', () => {
  // Nadie sondea /api/health/flujos: si el cron no la cuenta, no avisa a nadie.
  const fuente = readFileSync(new URL('../inngest/penalizaciones.ts', import.meta.url), 'utf8');
  assert.ok(fuente.includes('const VIGILADAS'), 'la lista de comprobaciones vigiladas existe');
  const vigiladas = fuente.slice(fuente.indexOf('const VIGILADAS'), fuente.indexOf('async function vigilarPenalizaciones'));
  assert.ok(vigiladas.includes('ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR'));
  assert.ok(vigiladas.includes('ID_PENALIZACIONES_COBRADAS_SIN_DINERO'));
  const barrido = fuente.indexOf('await seguirRecibosResueltos(admin)');
  const vigilancia = fuente.indexOf('await vigilarPenalizaciones(admin)');
  assert.ok(barrido > 0 && vigilancia > barrido, 'la vigilancia va después del barrido: lo que quede no lo arregló nadie');
});
