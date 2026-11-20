import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esFalloDeConexion, MENSAJE_BD_NO_ACCESIBLE } from './errores-conexion.ts';
import { avisoParaSentry, DEFINICIONES, ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR } from './salud/comprobaciones.ts';

test('una caída de conexión se reconoce; un error de consulta o de dato, no', () => {
  for (const m of [
    'TypeError: fetch failed', 'TypeError: network error', 'Failed to fetch', 'connect ECONNREFUSED 10.0.0.1:5432', 'read ECONNRESET',
    'getaddrinfo ENOTFOUND db.example.supabase.co', 'socket hang up', 'UND_ERR_CONNECT_TIMEOUT', 'Database is possibly not accessible at the moment',
  ]) assert.equal(esFalloDeConexion(m), true, m);
  for (const m of [
    'canceling statement due to statement timeout', 'null value in column "sala_id" violates not-null constraint',
    'Could not embed because more than one relationship was found', 'permission denied for table recibos', '', null, undefined,
  ]) assert.equal(esFalloDeConexion(m as string | null | undefined), false, String(m));
});

test('la salud manda UN aviso estable si la base de datos no responde, y conserva el aviso propio si el fallo es de la consulta', () => {
  const def = DEFINICIONES.find((d) => d.id === ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR)!;
  const caida = avisoParaSentry(def, { count: null, error: { message: 'TypeError: fetch failed' } });
  assert.equal(caida?.mensaje, MENSAJE_BD_NO_ACCESIBLE);
  assert.equal(caida?.nivel, 'error', 'agrupa, no silencia');
  assert.equal(caida?.extra.comprobacion, ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR, 'y dice qué comprobación lo vio');
  assert.equal(caida?.extra.valor, -1);

  const consulta = avisoParaSentry(def, { count: null, error: { message: 'canceling statement due to statement timeout' } });
  assert.equal(consulta?.mensaje, `[salud] ${ID_PENALIZACIONES_RECIBO_SIN_PROGRAMAR}`);
  assert.equal(consulta?.nivel, 'error');
});
