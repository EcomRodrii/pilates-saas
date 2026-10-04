import { test } from 'node:test';
import assert from 'node:assert/strict';
import { obtenerTokenSumup, type CredencialesTokenSumup, type DepsTokenSumup, type ResultadoRenovacion } from './sumup-token.ts';

// El token de SumUp ROTA al renovar y renuevan a la vez el sondeo, el aviso y el
// barrido. Lo que se fija: nunca se pisa el token del que ganó, quien pierde usa
// el suyo, y «reconectar» solo cuando de verdad no queda ninguno bueno.

const AHORA = Date.parse('2026-10-04T12:00:00Z');
const credenciales = (o: Partial<CredencialesTokenSumup> = {}): CredencialesTokenSumup => ({
  accessToken: 'acc-1', refreshToken: 'ref-1', expiresAt: new Date(AHORA + 3600_000).toISOString(),
  merchantCode: 'M123', version: 'v1', ...o,
});
const caducadas = (o: Partial<CredencialesTokenSumup> = {}) => credenciales({ expiresAt: new Date(AHORA - 1000).toISOString(), ...o });
const NUEVOS = { accessToken: 'acc-2', refreshToken: 'ref-2', expiresAt: new Date(AHORA + 3600_000).toISOString() };

function deps(o: { lecturas: Array<CredencialesTokenSumup | null>; renovar?: ResultadoRenovacion; guardaGana?: boolean }) {
  const llamadas = { renovar: 0, guardar: [] as Array<{ version: string }> };
  const d: DepsTokenSumup = {
    leer: async () => o.lecturas.length > 1 ? o.lecturas.shift()! : o.lecturas[0],
    guardarRenovado: async (_s, _t, version) => { llamadas.guardar.push({ version }); return o.guardaGana ?? true; },
    renovarEnSumup: async () => { llamadas.renovar++; return o.renovar ?? { ok: true, tokens: NUEVOS }; },
    ahora: () => AHORA,
  };
  return { d, llamadas };
}

test('vigente: se usa tal cual, sin renovar', async () => {
  const { d, llamadas } = deps({ lecturas: [credenciales()] });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: true, token: 'acc-1', merchantCode: 'M123' });
  assert.equal(llamadas.renovar, 0);
});

test('sin cuenta conectada: «sin-conectar»', async () => {
  const { d } = deps({ lecturas: [null] });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: false, motivo: 'sin-conectar' });
});

test('caducado: renueva y guarda SOLO si la fila sigue en la versión leída', async () => {
  const { d, llamadas } = deps({ lecturas: [caducadas()] });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: true, token: 'acc-2', merchantCode: 'M123' });
  assert.deepEqual(llamadas.guardar, [{ version: 'v1' }]);
});

test('otro proceso renovó antes: no se pisa su token; se usa el suyo', async () => {
  const suyo = credenciales({ accessToken: 'acc-de-otro', version: 'v2' });
  const { d } = deps({ lecturas: [caducadas(), suyo], guardaGana: false });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: true, token: 'acc-de-otro', merchantCode: 'M123' });
});

test('invalid_grant porque otro ya rotó el token: se usa el del otro, no se pide reconectar', async () => {
  const suyo = credenciales({ accessToken: 'acc-de-otro', version: 'v2' });
  const { d } = deps({ lecturas: [caducadas(), suyo], renovar: { ok: false, invalidGrant: true, error: 'invalid_grant' } });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: true, token: 'acc-de-otro', merchantCode: 'M123' });
});

test('invalid_grant con el mismo token guardado: el permiso ya no vale, «reconectar»', async () => {
  const { d } = deps({ lecturas: [caducadas()], renovar: { ok: false, invalidGrant: true, error: 'invalid_grant' } });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: false, motivo: 'reconectar' });
});

test('SumUp caído o un fallo cualquiera: «no-disponible», nunca una excepción', async () => {
  const { d } = deps({ lecturas: [caducadas()], renovar: { ok: false, invalidGrant: false, error: 'boom' } });
  assert.deepEqual(await obtenerTokenSumup('s', d), { ok: false, motivo: 'no-disponible' });
  const rota: DepsTokenSumup = { ...d, leer: async () => { throw new Error('bd caída'); } };
  assert.deepEqual(await obtenerTokenSumup('s', rota), { ok: false, motivo: 'no-disponible' });
});
