import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mandaLaCadena, desplazadaPorSuCadena } from './suscripcion-desplazada-por-cadena.ts';

// ── La regla ────────────────────────────────────────────────────────────────

test('sede sin cadena: el evento de su suscripción se aplica', () => {
  assert.equal(mandaLaCadena('sub_individual', null), false);
});

test('cadena viva y el evento es de OTRA suscripción (la individual desplazada): se ignora', () => {
  for (const estado of ['active', 'trialing', 'past_due', 'unpaid']) {
    assert.equal(mandaLaCadena('sub_individual', { subscriptionId: 'sub_cadena', subscriptionStatus: estado }), true, estado);
  }
});

test('checkout de cadena abandonado (cadena sin suscripción): manda la individual', () => {
  assert.equal(mandaLaCadena('sub_individual', { subscriptionId: null, subscriptionStatus: null }), false);
});

test('cadena que ya no está viva: manda la individual', () => {
  for (const estado of ['canceled', 'incomplete', 'incomplete_expired', 'trial_expirado']) {
    assert.equal(mandaLaCadena('sub_individual', { subscriptionId: 'sub_cadena', subscriptionStatus: estado }), false, estado);
  }
});

test('el evento es de la propia suscripción de la cadena (migradas en 0066, solo con studioId): no se ignora', () => {
  assert.equal(mandaLaCadena('sub_cadena', { subscriptionId: 'sub_cadena', subscriptionStatus: 'active' }), false);
});

// ── La lectura ──────────────────────────────────────────────────────────────

type Fila = Record<string, unknown>;
type Respuesta = { data: Fila[] | null; error: { message: string } | null };

function adminFalso(tablas: { studios?: Respuesta; cadenas?: Respuesta }) {
  const consultas: string[] = [];
  const admin = {
    from(tabla: 'studios' | 'cadenas') {
      return {
        select(columnas: string) {
          const responder = (filtro: string) => {
            consultas.push(`${tabla}:${columnas}:${filtro}`);
            return Promise.resolve(tablas[tabla] ?? { data: [], error: null });
          };
          return {
            eq: (col: string, val: string) => responder(`${col}=${val}`),
            in: (col: string, vals: string[]) => responder(`${col} in ${vals.join(',')}`),
          };
        },
      };
    },
  };
  return { admin: admin as never, consultas };
}

test('el caso que se arregla: el deleted de la individual de una sede cuya cadena está activa no llega a studios', async () => {
  const { admin } = adminFalso({
    studios: { data: [{ id: 'sede-1', cadena_id: 'cadena-1' }], error: null },
    cadenas: { data: [{ id: 'cadena-1', subscription_id: 'sub_cadena', subscription_status: 'active' }], error: null },
  });
  assert.equal(await desplazadaPorSuCadena(admin, 'id', 'sede-1', 'sub_individual'), true);
});

test('sede sin cadena: se aplica y ni siquiera se consulta cadenas', async () => {
  const { admin, consultas } = adminFalso({ studios: { data: [{ id: 'sede-1', cadena_id: null }], error: null } });
  assert.equal(await desplazadaPorSuCadena(admin, 'id', 'sede-1', 'sub_individual'), false);
  assert.deepEqual(consultas, ['studios:id, cadena_id:id=sede-1']);
});

test('sede vinculada a una cadena sin suscripción (checkout abandonado): se aplica', async () => {
  const { admin } = adminFalso({
    studios: { data: [{ id: 'sede-1', cadena_id: 'cadena-1' }], error: null },
    cadenas: { data: [{ id: 'cadena-1', subscription_id: null, subscription_status: null }], error: null },
  });
  assert.equal(await desplazadaPorSuCadena(admin, 'id', 'sede-1', 'sub_individual'), false);
});

test('estudio que no existe: no se ignora (el webhook sigue avisando de «no encontrado» como antes)', async () => {
  const { admin } = adminFalso({ studios: { data: [], error: null } });
  assert.equal(await desplazadaPorSuCadena(admin, 'id', 'sede-x', 'sub_individual'), false);
});

test('por cliente de Stripe: si alguna fila no la gobierna una cadena viva, se aplica', async () => {
  const { admin } = adminFalso({
    studios: { data: [{ id: 'sede-1', cadena_id: 'cadena-1' }, { id: 'sede-2', cadena_id: null }], error: null },
    cadenas: { data: [{ id: 'cadena-1', subscription_id: 'sub_cadena', subscription_status: 'active' }], error: null },
  });
  assert.equal(await desplazadaPorSuCadena(admin, 'stripe_customer_id', 'cus_1', 'sub_individual'), false);
});

test('si la lectura de la sede falla, lanza: Stripe reintenta en vez de escribir a ciegas', async () => {
  const { admin } = adminFalso({ studios: { data: null, error: { message: 'timeout' } } });
  await assert.rejects(desplazadaPorSuCadena(admin, 'id', 'sede-1', 'sub_individual'), /leer sede: timeout/);
});

test('si la lectura de la cadena falla, lanza', async () => {
  const { admin } = adminFalso({
    studios: { data: [{ id: 'sede-1', cadena_id: 'cadena-1' }], error: null },
    cadenas: { data: null, error: { message: 'timeout' } },
  });
  await assert.rejects(desplazadaPorSuCadena(admin, 'id', 'sede-1', 'sub_individual'), /leer cadena: timeout/);
});

// ── El webhook la usa antes de escribir en studios ──────────────────────────

test('toda escritura del webhook de billing en studios pasa antes por el filtro de cadena', () => {
  const ruta = join(import.meta.dirname, '..', '..', 'app', 'api', 'billing', 'webhook', 'route.ts');
  const lineas = readFileSync(ruta, 'utf8').split('\n');
  const escrituras = lineas
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => /aplicarSiNoDesordenado\(admin, 'studios'/.test(l));
  assert.ok(escrituras.length >= 2, 'esperaba las dos escrituras en studios (por id y por cliente)');
  for (const { i } of escrituras) {
    const anterior = lineas.slice(0, i).reverse().find(l => l.trim() && !l.trim().startsWith('//')) ?? '';
    assert.match(anterior, /ignorarPorLaCadena\(/, `la escritura de la línea ${i + 1} no pasa por ignorarPorLaCadena`);
  }
});
