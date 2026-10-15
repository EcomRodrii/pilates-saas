import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { leerPresupuesto, leerTotalNoCoincide, mensajeTotalNoCoincide } from './total-esperado.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El TPV cobra el total que ha enseñado (migr 20261015155427_pos_venta_total_esperado).
// La RPC lo cuenta en sus excepciones; esto lo lee, y los contratos de abajo fijan
// que las dos rutas y la RPC siguen diciéndose lo mismo. Lo de verdad, contra
// Postgres: `supabase/tests/pos-venta-total-esperado.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*(--|\/\/).*$/gm, '');

test('lee la vista previa de la RPC, con la matrícula y su plan', () => {
  assert.deepEqual(leerPresupuesto('PRESUPUESTO:95.00:15.00:plan-bono'), { total: 95, matricula: 15, matriculaPlanId: 'plan-bono' });
  // Sin matrícula (o gratis por la promoción): ni importe ni plan.
  assert.deepEqual(leerPresupuesto('PRESUPUESTO:80.00:0:'), { total: 80, matricula: 0, matriculaPlanId: null });
  // Un id con dos puntos no se corta.
  assert.deepEqual(leerPresupuesto('PRESUPUESTO:95.00:15:imp:42'), { total: 95, matricula: 15, matriculaPlanId: 'imp:42' });
});

test('no se inventa un total con un mensaje que no es el suyo', () => {
  assert.equal(leerPresupuesto('SIN_STOCK:Calcetines:0'), null);
  assert.equal(leerPresupuesto('PRESUPUESTO:abc:0:'), null);
  assert.equal(leerPresupuesto('PRESUPUESTO:-5:0:'), null);
  assert.equal(leerPresupuesto(''), null);
});

test('lee el rechazo de la venta: lo esperado, lo de verdad y la matrícula', () => {
  assert.deepEqual(
    leerTotalNoCoincide('IMPORTE_NO_COINCIDE:80.00:95.00:15.00:plan-bono'),
    { esperado: 80, total: 95, matricula: 15, matriculaPlanId: 'plan-bono' },
  );
});

test('el IMPORTE_NO_COINCIDE de la confirmación (dos cifras) no se lee como este', () => {
  // `confirmar_pago_venta_pos`: «se cobró X y el ticket es Y». Leerlo como «el total es Y»
  // diría que no se ha cobrado nada cuando sí se cobró.
  assert.equal(leerTotalNoCoincide('IMPORTE_NO_COINCIDE:80.00:95.00'), null);
});

test('el mensaje dice el total de verdad, por qué, y que no se ha cobrado nada', () => {
  const m = mensajeTotalNoCoincide({ esperado: 80, total: 95, matricula: 15 });
  assert.match(m, /95,00/);
  assert.match(m, /matrícula \(15,00/);
  assert.match(m, /No se ha registrado ni cobrado nada/);
  // Nunca la frase de la confirmación: aquí no se ha cobrado.
  assert.doesNotMatch(m, /Se cobraron/i);
  // Sin matrícula, sin inventarse un motivo.
  assert.doesNotMatch(mensajeTotalNoCoincide({ esperado: 25, total: 27, matricula: 0 }), /matrícula/);
});

function ultimaDefinicionRpc(): { fichero: string; cuerpo: string } {
  const dir = join(RAIZ, 'supabase/migrations');
  const ficheros = readdirSync(dir).filter((f) => f.endsWith('.sql'))
    .filter((f) => /create\s+or\s+replace\s+function\s+public\.registrar_venta_pos/i.test(readFileSync(join(dir, f), 'utf8')))
    .sort();
  const fichero = ficheros[ficheros.length - 1];
  const fuente = readFileSync(join(dir, fichero), 'utf8');
  return { fichero, cuerpo: sinComentarios(fuente.slice(fuente.search(/create\s+or\s+replace\s+function\s+public\.registrar_venta_pos/i))) };
}

test('la RPC rechaza el total distinto ANTES de escribir el total, el movimiento de caja o devolver la venta', () => {
  const { fichero, cuerpo } = ultimaDefinicionRpc();
  const rechazo = cuerpo.search(/IF\s+p_total_esperado\s+IS\s+NOT\s+NULL\s+AND\s+ROUND\(p_total_esperado,\s*2\)\s*<>\s*v_total/i);
  const presupuesto = cuerpo.search(/IF\s+p_solo_calcular\s+THEN\s+RAISE\s+EXCEPTION\s+'PRESUPUESTO:/i);
  assert.ok(rechazo > 0, `${fichero}: falta el rechazo por total esperado`);
  assert.ok(presupuesto > 0, `${fichero}: falta la vista previa (p_solo_calcular)`);
  // Después de calcular el total (el bucle que lo suma) y antes de darlo por bueno.
  const sumaTotal = cuerpo.search(/v_total\s*:=\s*v_total\s*\+\s*v_linea_total/i);
  const escribeTotal = cuerpo.search(/UPDATE\s+public\.ventas_pos\s+v\s+SET\s+total\s*=\s*v_total/i);
  const movimientoCaja = cuerpo.search(/INSERT\s+INTO\s+public\.movimientos_caja/i);
  for (const [nombre, pos] of [['el rechazo', rechazo], ['la vista previa', presupuesto]] as const) {
    assert.ok(sumaTotal < pos, `${fichero}: ${nombre} va antes de que el total esté calculado`);
    assert.ok(pos < escribeTotal && pos < movimientoCaja, `${fichero}: ${nombre} va después de dar la venta por buena`);
  }
  // El cupo de matrícula se decide dentro, así que la vista previa lo ve igual que la venta.
  assert.match(cuerpo, /reservar_matricula/);
});

test('las dos rutas le hablan a la RPC con los mismos parámetros nuevos', () => {
  const venta = sinComentarios(leer('app/api/pos/venta/route.ts'));
  assert.match(venta, /p_total_esperado:\s*totalEsperado/, 'la venta tiene que mandar el total que vio quien cobra');
  // El rechazo nunca cae en el mensaje genérico de ese código («Se cobraron X €…»).
  assert.ok(venta.indexOf("startsWith('IMPORTE_NO_COINCIDE')") < venta.indexOf('mensajeErrorVenta(codigo)'),
    'el rechazo por total se trata antes que el resto de códigos');

  const presupuesto = sinComentarios(leer('app/api/pos/venta/presupuesto/route.ts'));
  assert.match(presupuesto, /p_solo_calcular:\s*true/);
  // Con una clave de idempotencia la RPC devolvería una venta ya hecha en vez de calcular.
  assert.match(presupuesto, /p_idempotencia_clave:\s*null/);
  // Las mismas puertas que la venta: corre con service-role.
  for (const puerta of ['enforceRateLimit', 'verificarSesionStaff', 'puedeMoverDinero', 'bloqueoPorSuscripcion', ".eq('studio_id', sesion.studioId)"]) {
    assert.ok(presupuesto.includes(puerta), `a la vista previa le falta ${puerta}`);
  }
  // Y no reserva plazas de etapa: no vende.
  assert.doesNotMatch(presupuesto, /reservarPlazasPOS/);
});
