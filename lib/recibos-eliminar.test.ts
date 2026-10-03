import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  CODIGOS_CONOCIDOS, ESTADOS_ELIMINABLES, MOTIVOS_ELIMINAR_RECIBO, etiquetaMotivo, interpretarErrorEliminar,
  puedeEliminarRecibo,
} from './recibos-eliminar.ts';

// La RPC es la cerradura y esta pantalla su espejo: si las listas divergen, la
// pantalla ofrece un motivo que la RPC rechaza (o al revés). Se leen de la
// migración, no se copian: de la ÚLTIMA que redefine la RPC (la primera fue
// 20260925175253; probar el texto de una vieja daría por buena una regla que ya no está).
const dirMigraciones = new URL('../supabase/migrations/', import.meta.url);
const cabeceraRpc = 'create or replace function public.eliminar_recibo';
const ficheroRpc = readdirSync(dirMigraciones).filter(n => n.endsWith('.sql')).sort().reverse()
  .find(n => readFileSync(new URL(n, dirMigraciones), 'utf8').includes(cabeceraRpc));
assert.ok(ficheroRpc, 'ninguna migración define eliminar_recibo');
const sql = readFileSync(new URL(ficheroRpc, dirMigraciones), 'utf8').replace(/--.*$/gm, '');
/** Solo el cuerpo de la función: lo que venga detrás en la misma migración no es la RPC. */
const cuerpoRpc = (() => {
  const desde = sql.indexOf(cabeceraRpc);
  const etiqueta = sql.slice(desde).match(/\bas\s+(\$\w*\$)/)?.[1];
  assert.ok(etiqueta, 'no se ve el delimitador del cuerpo de eliminar_recibo');
  const abre = sql.indexOf(etiqueta, desde) + etiqueta.length;
  return sql.slice(desde, sql.indexOf(etiqueta, abre) + etiqueta.length);
})();
const listaDe = (s: string) => [...s.matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);

test('los motivos de la pantalla son EXACTAMENTE los que acepta la RPC', () => {
  const enSql = listaDe(cuerpoRpc.match(/p_motivo not in \(([^)]*)\)/)?.[1] ?? '');
  assert.ok(enSql.length >= 5, 'el parser no ve la lista de motivos de la migración');
  assert.deepEqual(MOTIVOS_ELIMINAR_RECIBO.map(m => m.codigo).sort(), [...enSql].sort());
});

test('los estados eliminables de la pantalla son EXACTAMENTE los de la RPC', () => {
  const enSql = listaDe(cuerpoRpc.match(/v_r\.estado not in \(([^)]*)\)/)?.[1] ?? '');
  assert.ok(enSql.length >= 3, 'el parser no ve la lista de estados de la migración');
  assert.deepEqual([...ESTADOS_ELIMINABLES].sort(), [...enSql].sort());
});

test('todo rechazo que la RPC lanza tiene su explicación en la pantalla', () => {
  const lanzados = [...cuerpoRpc.matchAll(/raise exception '([A-Z_]+)'/g)].map(m => m[1]);
  // 7 en el cuerpo; `STUDIO_MISMATCH` lo lanza `validar_studio_mismatch` y también se explica.
  assert.ok(lanzados.length >= 7, 'el parser no ve los raise exception de la RPC');
  const sinExplicar = lanzados.filter(c => !CODIGOS_CONOCIDOS.includes(c));
  assert.deepEqual(sinExplicar, [], `la RPC lanza códigos que la pantalla no sabe decir: ${sinExplicar.join(', ')}`);
});

test('un cobro con la tarjeta o la domiciliación guardada en marcha es un pago asociado: no se borra', () => {
  // Con el cargo ya pedido a Stripe, el dinero entraría sin recibo al que asociarse. La marca solo
  // vive en PENDIENTE/FALLIDO (los dos estados eliminables con dinero posible), así que la RPC tiene
  // que leerla bajo su `for update` y mirarla sin excepción por estado: un FALLIDO con marca es un
  // reintento en vuelo, no el intento viejo que ya no puede completarse.
  assert.match(cuerpoRpc, /select r\.id,[^;]*\br\.cobro_off_session_clave\b[^;]*for update;/, 'la RPC no lee la marca con el recibo bloqueado');
  const pagoAsociado = cuerpoRpc.match(/if ([^;]*?) then\s+raise exception 'PAGO_ASOCIADO'/)?.[1] ?? '';
  assert.match(pagoAsociado, /or v_r\.cobro_off_session_clave is not null\n/, 'PAGO_ASOCIADO no mira la marca, o la ata a un estado');
});

test('el motivo no admite texto libre: cada uno es un código con su frase', () => {
  for (const m of MOTIVOS_ELIMINAR_RECIBO) {
    assert.match(m.codigo, /^[A-Z_]+$/);
    assert.ok(m.etiqueta.length > 5 && m.etiqueta.length < 40, m.codigo);
  }
  assert.equal(new Set(MOTIVOS_ELIMINAR_RECIBO.map(m => m.codigo)).size, MOTIVOS_ELIMINAR_RECIBO.length);
});

test('etiquetas: una conocida, y un código nuevo se lee en claro en vez de esconderse', () => {
  assert.equal(etiquetaMotivo('DUPLICADO'), 'Está duplicado');
  assert.equal(etiquetaMotivo('PRUEBA_NUEVA'), 'Prueba nueva');
});

test('solo se ofrece «Eliminar» a lo que aún no es dinero cobrado ni tiene factura', () => {
  for (const estado of ['PENDIENTE', 'FALLIDO', 'ANULADO']) {
    assert.deepEqual(puedeEliminarRecibo({ estado }), { ok: true }, estado);
  }
  for (const estado of ['COBRADO', 'DEVUELTO', 'EN_CURSO']) {
    const r = puedeEliminarRecibo({ estado });
    assert.equal(r.ok, false, estado);
  }
  // Un pendiente que ya tuvo un cobro (adeudo devuelto) tampoco: el estado no prueba que nunca hubo dinero.
  assert.equal(puedeEliminarRecibo({ estado: 'PENDIENTE', fechaCobro: '2026-09-01' }).ok, false);
  assert.equal(puedeEliminarRecibo({ estado: 'FALLIDO', fechaDevolucion: '2026-09-02' }).ok, false);
  assert.equal(puedeEliminarRecibo({ estado: 'PENDIENTE', fechaCobro: null, fechaDevolucion: null }).ok, true);
  // Con factura, ni un pendiente.
  const conFactura = puedeEliminarRecibo({ estado: 'PENDIENTE' }, { tieneFactura: true });
  assert.equal(conFactura.ok, false);
  assert.equal(conFactura.ok === false && conFactura.razon, 'Ya tiene factura.');
});

test('el rechazo del servidor se traduce a una frase; lo desconocido no se filtra crudo', () => {
  const casos: Array<[string, string]> = [
    ['ESTADO_NO_ELIMINABLE', 'regístralo como devuelto'],
    ['PAGO_ASOCIADO', 'pago abierto'],
    ['TIENE_COBRO_PREVIO', 'ya tuvo un cobro'],
    ['TIENE_FACTURA', 'ya tiene factura'],
    ['ES_PENALIZACION', 'penalización'],
    ['MOTIVO_INVALIDO', 'Elige un motivo'],
    ['NO_AUTORIZADO', 'No tienes permiso'],
    ['STUDIO_MISMATCH', 'otra sede'],
  ];
  for (const [codigo, trozo] of casos) {
    const e = interpretarErrorEliminar(codigo);
    assert.equal(e?.tipo, 'RECHAZADO', codigo);
    assert.ok(e?.tipo === 'RECHAZADO' && e.mensaje.includes(trozo), `${codigo}: ${e && 'mensaje' in e ? e.mensaje : ''}`);
  }
  // PostgREST a veces antepone o pospone texto al código.
  assert.equal(interpretarErrorEliminar('P0001: ESTADO_NO_ELIMINABLE (hint)')?.tipo, 'RECHAZADO');
  assert.deepEqual(interpretarErrorEliminar('RECIBO_NO_ENCONTRADO'), { tipo: 'YA_NO_EXISTE' });
  assert.equal(interpretarErrorEliminar('permission denied for table recibos'), null);
  assert.equal(interpretarErrorEliminar(undefined), null);
  // Un código que solo CONTIENE otro no lo activa.
  assert.equal(interpretarErrorEliminar('NO_ESTADO_NO_ELIMINABLE_X'), null);
});

test('un código de la RPC que la pantalla no conoce no se enseña crudo', () => {
  const e = interpretarErrorEliminar('ALGO_NUEVO_DEL_SERVIDOR', 'P0001');
  assert.equal(e?.tipo, 'RECHAZADO');
  assert.ok(e?.tipo === 'RECHAZADO' && !e.mensaje.includes('ALGO_NUEVO'));
  // Sin el código de Postgres de una excepción propia, no se interpreta: lo decide quien llama.
  assert.equal(interpretarErrorEliminar('ALGO_NUEVO_DEL_SERVIDOR'), null);
  // Uno conocido gana aunque venga con P0001.
  assert.equal(interpretarErrorEliminar('PAGO_ASOCIADO', 'P0001')?.tipo, 'RECHAZADO');
  assert.ok(interpretarErrorEliminar('PAGO_ASOCIADO', 'P0001') && 'mensaje' in interpretarErrorEliminar('PAGO_ASOCIADO', 'P0001')! && (interpretarErrorEliminar('PAGO_ASOCIADO', 'P0001') as { mensaje: string }).mensaje.includes('pago abierto'));
});

test('un fallo de PostgREST (la función aún sin desplegar) tampoco se enseña crudo', () => {
  const e = interpretarErrorEliminar('Could not find the function public.eliminar_recibo(p_motivo) in the schema cache', 'PGRST202');
  assert.equal(e?.tipo, 'RECHAZADO');
  assert.ok(e?.tipo === 'RECHAZADO' && !/schema cache|eliminar_recibo/.test(e.mensaje));
  // Un fallo de red o de permisos (sin esos códigos) lo decide quien llama.
  assert.equal(interpretarErrorEliminar('Failed to fetch'), null);
  assert.equal(interpretarErrorEliminar('permission denied', '42501'), null);
});
