import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secretoValido } from './secreto.ts';
import { comprobarFlujos, DEFINICIONES } from './comprobaciones.ts';
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
