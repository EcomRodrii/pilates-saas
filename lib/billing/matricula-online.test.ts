import { test } from 'node:test';
import assert from 'node:assert/strict';
import { primeraVezConPlan, liberarCupoMatricula, liberarCupoMatriculaUnaVez, esRespuestaRepetida } from './matricula-online.ts';

type Fila = Record<string, unknown>;

function fakeAdmin(opts: { sociosPorEmail?: Fila[]; countSuscripciones?: number; errorSocios?: boolean; errorSuscripciones?: boolean } = {}) {
  return {
    from(tabla: string) {
      if (tabla === 'socios') {
        return {
          select: () => ({
            eq: () => ({
              ilike: () => ({
                limit: () => ({
                  maybeSingle: () => Promise.resolve(
                    opts.errorSocios ? { data: null, error: { message: 'fallo' } }
                      : { data: opts.sociosPorEmail?.[0] ?? null, error: null },
                  ),
                }),
              }),
            }),
          }),
        };
      }
      // suscripciones
      return {
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve(
              opts.errorSuscripciones ? { count: null, error: { message: 'fallo' } }
                : { count: opts.countSuscripciones ?? 0, error: null },
            ),
          }),
        }),
      };
    },
  } as never;
}

test('con socioId conocido: sin suscripciones previas → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ countSuscripciones: 0 }), 'studio-1', 'soc-1', null);
  assert.equal(r, true);
});

test('con socioId conocido: YA tiene una suscripción → no es primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ countSuscripciones: 1 }), 'studio-1', 'soc-1', null);
  assert.equal(r, false);
});

test('sin socioId ni email: no hay ficha que pueda tener planes previos → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin(), 'studio-1', null, null);
  assert.equal(r, true);
});

test('sin socioId, email SIN ficha existente → primera vez', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ sociosPorEmail: [] }), 'studio-1', null, 'nueva@example.com');
  assert.equal(r, true);
});

test('sin socioId, email CON ficha existente y suscripciones previas → no es primera vez', async () => {
  const r = await primeraVezConPlan(
    fakeAdmin({ sociosPorEmail: [{ id: 'soc-2' }], countSuscripciones: 1 }),
    'studio-1', null, 'yaesta@example.com',
  );
  assert.equal(r, false);
});

test('sin socioId, email CON ficha existente pero SIN ninguna suscripción → sí es primera vez', async () => {
  // Ficha existente (p.ej. un lead nunca convertido) sin ningún plan real.
  const r = await primeraVezConPlan(
    fakeAdmin({ sociosPorEmail: [{ id: 'soc-3' }], countSuscripciones: 0 }),
    'studio-1', null, 'lead@example.com',
  );
  assert.equal(r, true);
});

test('⚠️ fail-safe: un fallo leyendo socios NO cobra matrícula (ante la duda, no se cobra)', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ errorSocios: true }), 'studio-1', null, 'x@example.com');
  assert.equal(r, false);
});

test('⚠️ fail-safe: un fallo leyendo suscripciones NO cobra matrícula', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ errorSuscripciones: true }), 'studio-1', 'soc-1', null);
  assert.equal(r, false);
});

test('un email con comodín "*" no se deja resolver (fail-closed)', async () => {
  const r = await primeraVezConPlan(fakeAdmin({ sociosPorEmail: [] }), 'studio-1', null, 'x*@example.com');
  assert.equal(r, false);
});

// liberarCupoMatriculaUnaVez — una devolución por CLAVE, y anotar + devolver
// en UNA transacción (RPC `liberar_cupo_matricula_una_vez`). Antes eran dos
// llamadas: si la segunda fallaba, la fila de «ya devuelta» quedaba escrita y
// la plaza no volvía nunca.
function fakeAdminLiberacion(respuesta: { data?: unknown; error?: { message: string } | null }) {
  const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
  const tablas: string[] = [];
  return {
    admin: {
      from: (t: string) => { tablas.push(t); throw new Error('no debería escribir tablas a mano'); },
      rpc: (nombre: string, args: Record<string, unknown>) => {
        rpcs.push({ nombre, args });
        return Promise.resolve({ data: respuesta.data ?? null, error: respuesta.error ?? null });
      },
    } as never,
    rpcs,
    tablas,
  };
}

test('primera devolución de una clave: UNA llamada a la RPC atómica, y devuelve true', async () => {
  const { admin, rpcs, tablas } = fakeAdminLiberacion({ data: true });
  assert.equal(await liberarCupoMatriculaUnaVez(admin, 'cs_1', 'plan-1', 'studio-1'), true);
  assert.deepEqual(rpcs, [{ nombre: 'liberar_cupo_matricula_una_vez', args: { p_clave: 'cs_1', p_plan_id: 'plan-1', p_studio_id: 'studio-1' } }]);
  assert.deepEqual(tablas, [], 'anotar y devolver no pueden ir en dos llamadas separadas');
});

test('clave ya devuelta: la RPC dice false y no pasa nada más', async () => {
  const { admin } = fakeAdminLiberacion({ data: false });
  assert.equal(await liberarCupoMatriculaUnaVez(admin, 'pi_1', 'plan-1', 'studio-1'), false);
});

test('⚠️ un error SE LANZA: no ha quedado nada anotado y quien llama debe poder reintentar', async () => {
  const { admin } = fakeAdminLiberacion({ error: { message: 'timeout' } });
  await assert.rejects(liberarCupoMatriculaUnaVez(admin, 'pi_1', 'plan-1', 'studio-1'), /timeout/);
});

// esRespuestaRepetida — Stripe marca con `idempotent-replayed: true` la
// respuesta que repite una creación anterior (probado en Stripe test). Si los
// checkouts no lo miran, dos peticiones del mismo intento gastan dos plazas
// para un solo cobro.
test('respuesta repetida por idempotencia → true; primera creación → false', () => {
  const conCabeceras = (h: Record<string, unknown>) => {
    const o = { id: 'pi_1' };
    Object.defineProperty(o, 'lastResponse', { value: { headers: h }, enumerable: false });
    return o;
  };
  assert.equal(esRespuestaRepetida(conCabeceras({ 'idempotent-replayed': 'true' })), true);
  assert.equal(esRespuestaRepetida(conCabeceras({ 'request-id': 'req_1' })), false);
  assert.equal(esRespuestaRepetida(conCabeceras({ 'idempotent-replayed': 'false' })), false);
  assert.equal(esRespuestaRepetida({ id: 'pi_1' }), false);
  assert.equal(esRespuestaRepetida(null), false);
});

// liberarCupoMatricula (compensación síncrona de los checkouts): antes se
// tragaba todo, incluido el `{ error }` que supabase-js devuelve SIN rechazar.
function fakeAdminCompensacion(respuestas: Array<'ok' | 'error' | 'lanza'>) {
  let n = 0;
  return {
    admin: {
      rpc: () => {
        const r = respuestas[Math.min(n++, respuestas.length - 1)];
        if (r === 'lanza') return Promise.reject(new Error('red caída'));
        return Promise.resolve({ data: null, error: r === 'error' ? { message: 'timeout' } : null });
      },
    } as never,
    llamadas: () => n,
  };
}

test('compensación: a la primera → true y sin aviso', async () => {
  const { admin, llamadas } = fakeAdminCompensacion(['ok']);
  const avisos: unknown[] = [];
  assert.equal(await liberarCupoMatricula(admin, 'plan-1', 'studio-1', { esperaMs: 0, avisar: e => avisos.push(e) }), true);
  assert.equal(llamadas(), 1);
  assert.equal(avisos.length, 0);
});

test('⚠️ compensación: un `{ error }` ya NO cuenta como devuelta — reintenta', async () => {
  const { admin, llamadas } = fakeAdminCompensacion(['error', 'lanza', 'ok']);
  const avisos: unknown[] = [];
  assert.equal(await liberarCupoMatricula(admin, 'plan-1', 'studio-1', { esperaMs: 0, avisar: e => avisos.push(e) }), true);
  assert.equal(llamadas(), 3);
  assert.equal(avisos.length, 0);
});

test('⚠️ compensación: si nunca lo consigue, AVISA con plan y estudio (no se calla)', async () => {
  const { admin, llamadas } = fakeAdminCompensacion(['error']);
  const avisos: Array<{ planId: string; studioId: string }> = [];
  assert.equal(await liberarCupoMatricula(admin, 'plan-1', 'studio-1', { esperaMs: 0, avisar: e => avisos.push(e as never) }), false);
  assert.equal(llamadas(), 3);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0].planId, 'plan-1');
  assert.equal(avisos[0].studioId, 'studio-1');
});
