import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estadoDeLaRespuesta, estadoDeReservaDelPago, ESTADOS_RESERVA_VIVA } from './reserva-tras-pago-reglas.ts';

// La reserva que hace el servidor DESPUÉS de cobrar una clase
// (`reservarPlazaTrasPagoPublico`). El dinero ya entró: equivocarse hacia
// «confirmada» es que nadie se entere de un pago que no se ha usado.

const p = { socioId: 'soc-1', sesionId: 'ses-1' };
const fila = (estado: string | null, extra: Partial<{ socio_id: string; sesion_id: string }> = {}) => ({
  estado, socio_id: 'soc-1', sesion_id: 'ses-1', ...extra,
});

test('YA_RESERVADA con la reserva de ESTE pago viva: es un reintento, con su estado real', () => {
  assert.equal(estadoDeReservaDelPago(fila('CONFIRMADA'), p), 'CONFIRMADA');
  assert.equal(estadoDeReservaDelPago(fila('LISTA_ESPERA'), p), 'LISTA_ESPERA');
  assert.equal(estadoDeReservaDelPago(fila('PENDIENTE_APROBACION'), p), 'PENDIENTE_APROBACION');
});

test('YA_RESERVADA sin reserva de este pago: ya tenía OTRA reserva, el pago no se ha usado', () => {
  // El fallo de producción: esto salía como «CONFIRMADA» (`?? 'CONFIRMADA'`) y
  // ni la socia ni el mostrador sabían que había un pago sin usar.
  assert.equal(estadoDeReservaDelPago(null, p), null);
  assert.equal(estadoDeReservaDelPago(undefined, p), null);
});

test('la reserva del pago CANCELADA no cuenta: si saltó YA_RESERVADA, es por otra reserva viva', () => {
  assert.equal(estadoDeReservaDelPago(fila('CANCELADA'), p), null);
  assert.equal(estadoDeReservaDelPago(fila(null), p), null);
});

test('una fila que no es de esta socia o de esta clase nunca se toma por la del pago', () => {
  assert.equal(estadoDeReservaDelPago(fila('CONFIRMADA', { socio_id: 'otra' }), p), null);
  assert.equal(estadoDeReservaDelPago(fila('CONFIRMADA', { sesion_id: 'otra' }), p), null);
});

test('los estados vivos son exactamente los que hacen saltar YA_RESERVADA en evaluar_reserva', () => {
  const sql = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261002145300_evaluar_reserva.sql'), 'utf8');
  const antes = sql.slice(0, sql.indexOf("'YA_RESERVADA'"));
  const lista = antes.slice(antes.lastIndexOf('r.estado in ('));
  for (const e of ESTADOS_RESERVA_VIVA) assert.ok(lista.includes(`'${e}'`), `${e} no está en la lista de evaluar_reserva`);
  assert.equal((lista.slice(0, lista.indexOf(')')).match(/'[A-Z_]+'/g) ?? []).length, ESTADOS_RESERVA_VIVA.length);
});

test('sin estado en la respuesta de la RPC no se supone ninguno', () => {
  assert.equal(estadoDeLaRespuesta(undefined), null);
  assert.equal(estadoDeLaRespuesta(null), null);
  assert.equal(estadoDeLaRespuesta({}), null);
  assert.equal(estadoDeLaRespuesta({ estado: '' }), null);
  assert.equal(estadoDeLaRespuesta({ estado: 42 }), null);
  assert.equal(estadoDeLaRespuesta({ estado: 'LISTA_ESPERA' }), 'LISTA_ESPERA');
});

// ── Contrato con el fuente (alias `@/` y Supabase: `node --test` no lo carga) ──

const raiz = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function cuerpoDe(fuente: string, nombre: string): string {
  const ini = fuente.indexOf(`export async function ${nombre}(`);
  assert.ok(ini > 0, `no encuentro ${nombre}: ¿se renombró?`);
  const sig = fuente.slice(ini + 1).search(/\n(?:export\s+)?(?:async\s+)?function \w+\(/);
  return sig === -1 ? fuente.slice(ini) : fuente.slice(ini, ini + 1 + sig);
}

test('reservarPlazaTrasPagoPublico no supone CONFIRMADA en ningún camino', () => {
  const cuerpo = sinComentarios(cuerpoDe(leer('lib/db/supabase-data-admin.ts'), 'reservarPlazaTrasPagoPublico'));
  assert.doesNotMatch(cuerpo, /\?\?\s*'CONFIRMADA'/, 'un estado por defecto da por reservada una clase pagada sin saberlo');
  assert.match(cuerpo, /estadoDeLaRespuesta\(row\)/);
});

test('reservarPlazaTrasPagoPublico: YA_RESERVADA sin reserva propia devuelve ya-tenia-reserva, no un éxito', () => {
  const cuerpo = sinComentarios(cuerpoDe(leer('lib/db/supabase-data-admin.ts'), 'reservarPlazaTrasPagoPublico'));
  const rama = cuerpo.slice(cuerpo.indexOf("error.message.includes('YA_RESERVADA')"));
  const decide = rama.indexOf('estadoDeReservaDelPago(existente');
  const yaTenia = rama.indexOf("motivo: 'ya-tenia-reserva'");
  const exito = rama.indexOf('return { ok: true');
  assert.ok(decide > 0 && yaTenia > decide && exito > yaTenia, 'se decide con la reserva del pago, y el «ya tenía» va antes del éxito');
});

test('reservarClasePagada avisa al mostrador del pago sin usar, con el pago para no pisar otro aviso', () => {
  const s = sinComentarios(leer('lib/billing/reservar-clase-pagada.ts'));
  assert.match(s, /situacion: yaTenia \? 'ya-tenia-reserva' : 'sin-reserva'/);
  assert.match(s, /paymentIntentId: p\.paymentIntentId/);
});
