import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// «Una vez por alumna» en la Caja (fundador, 16-oct-2026; migr
// 20261015222942_caja_codigo_una_vez_por_alumna). La regla de verdad, contra Postgres:
// `supabase/tests/pos-codigo-una-vez-por-alumna.test.ts`. Esto fija lo que una
// redefinición futura de la RPC no puede perder sin que salte aquí, y que la Caja
// lo dice con palabras.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const sinComentarios = (f: string) => f.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*(--|\/\/).*$/gm, '');

function ultimaDefinicion(nombre: string): { fichero: string; cuerpo: string } {
  const dir = join(RAIZ, 'supabase/migrations');
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nombre}\\(`, 'i');
  const fichero = readdirSync(dir).filter(f => f.endsWith('.sql') && re.test(readFileSync(join(dir, f), 'utf8'))).sort().at(-1)!;
  const fuente = readFileSync(join(dir, fichero), 'utf8');
  const ini = fuente.search(re);
  return { fichero, cuerpo: sinComentarios(fuente.slice(ini, fuente.indexOf('$function$;', ini))) };
}

test('la venta apunta el uso de la alumna en el índice de los cobros online, tras crearse y antes de la vista previa', () => {
  const { fichero, cuerpo } = ultimaDefinicion('registrar_venta_pos');
  const consumo = cuerpo.search(/INSERT\s+INTO\s+public\.codigos_descuento_consumos\s*\(\s*venta_pos_id,\s*codigo_id,\s*socio_id\s*\)/i);
  assert.ok(consumo > 0, `${fichero}: la Caja ya no apunta el uso del código`);
  // El índice de la regla es el de siempre, el de los cobros online: nada de una copia.
  assert.match(cuerpo, /ON\s+CONFLICT\s*\(\s*codigo_id,\s*socio_id\s*\)\s+DO\s+NOTHING/i);
  assert.match(cuerpo, /RAISE\s+EXCEPTION\s+'CODIGO_YA_USADO_POR_SOCIA'/i);
  // Solo con alumna: sin ella no hay a quién mirar.
  assert.match(cuerpo.slice(Math.max(0, consumo - 200), consumo), /p_codigo_descuento_id\s+IS\s+NOT\s+NULL\s+AND\s+p_socio_id\s+IS\s+NOT\s+NULL/i);
  const venta = cuerpo.search(/INSERT\s+INTO\s+public\.ventas_pos\s*\(/i);
  const presupuesto = cuerpo.search(/RAISE\s+EXCEPTION\s+'PRESUPUESTO:/i);
  assert.ok(venta < consumo, `${fichero}: el consumo referencia la venta, va después de crearla`);
  assert.ok(consumo < presupuesto, `${fichero}: la vista previa tiene que verlo, así que va antes`);
});

test('si el pago no sale, la venta anulada suelta el código de la alumna', () => {
  const { fichero, cuerpo } = ultimaDefinicion('fallar_pago_venta_pos');
  assert.match(cuerpo, /delete\s+from\s+public\.codigos_descuento_consumos\s+c\s+where\s+c\.venta_pos_id\s*=\s*p_venta_id/i, fichero);
});

test('si el pago no sale, devuelve el uso del tope global una sola vez y nunca por debajo de 0', () => {
  // Migr 20261016115731. La prueba de verdad, con la doble llamada y dos a la vez:
  // `supabase/tests/pos-pago-fallido-devuelve-uso.test.ts`.
  const registrar = ultimaDefinicion('registrar_venta_pos');
  assert.match(registrar.cuerpo, /matricula_cupo_plan_id,\s*codigo_descuento_id\s*\)\s*VALUES/i, `${registrar.fichero}: la venta ya no apunta qué código gastó`);
  assert.match(registrar.cuerpo, /v_matricula_gratis_plan_id,\s*p_codigo_descuento_id\s*\)/i, registrar.fichero);

  const { fichero, cuerpo } = ultimaDefinicion('fallar_pago_venta_pos');
  const anula = cuerpo.search(/v\.estado\s*=\s*'PENDIENTE_PAGO'\s+returning\s+v\.matricula_cupo_plan_id,\s*v\.codigo_descuento_id\s+into\s+v_plan_matricula,\s*v_codigo/i);
  const sale = cuerpo.search(/if\s+v_afectadas\s*=\s*0\s+then\s+return\s+false;\s*end\s+if;/i);
  const devuelve = cuerpo.search(/set\s+usos\s*=\s*greatest\(\s*coalesce\(\s*c\.usos,\s*0\s*\)\s*-\s*1,\s*0\s*\)/i);
  assert.ok(anula > 0, `${fichero}: el código se lee de la venta que se anula, en el mismo UPDATE`);
  assert.ok(devuelve > 0, `${fichero}: el pago fallido ya no devuelve el uso del código`);
  // Idempotente porque va detrás del compare-and-set: la segunda llamada sale antes.
  assert.ok(anula < sale && sale < devuelve, `${fichero}: devolver el uso tiene que ir detrás de «return false»`);
  assert.match(cuerpo.slice(devuelve, devuelve + 200), /where\s+c\.id\s*=\s*v_codigo\s+and\s+c\.studio_id\s*=\s*p_studio_id/i, fichero);
  // En el orden en que `registrar_venta_pos` los coge (el código, luego el consumo): al revés,
  // un pago fallido y una venta nueva del mismo código a la misma alumna se bloquean entre sí.
  const suelta = cuerpo.search(/delete\s+from\s+public\.codigos_descuento_consumos/i);
  assert.ok(devuelve < suelta, `${fichero}: devolver el uso tiene que ir antes de soltar el consumo de la alumna`);
  assert.ok(
    registrar.cuerpo.search(/UPDATE\s+public\.codigos_descuento\s+c\s+SET\s+usos/i) < registrar.cuerpo.search(/INSERT\s+INTO\s+public\.codigos_descuento_consumos/i),
    `${registrar.fichero}: la venta coge el código antes que el consumo`,
  );
});

test('la Caja dice con palabras por qué no vale, y lo dicen igual la venta y la vista previa', () => {
  const tipos = readFileSync(join(RAIZ, 'lib/pos/tipos.ts'), 'utf8');
  assert.match(tipos, /case 'CODIGO_YA_USADO_POR_SOCIA':\s*return MENSAJE_CODIGO_YA_USADO;/);
  assert.match(tipos, /MENSAJE_CODIGO_YA_USADO = '[^']*una vez por clienta[^']*'/);
  // Las dos rutas traducen con `mensajeErrorVenta` y contestan 409 con el código.
  for (const ruta of ['app/api/pos/venta/route.ts', 'app/api/pos/venta/presupuesto/route.ts']) {
    assert.match(readFileSync(join(RAIZ, ruta), 'utf8'), /mensajeErrorVenta\(codigo\)/, ruta);
  }
  // Y la pantalla quita el código cuando el servidor lo dice, en la vista previa y en la venta.
  const terminal = readFileSync(join(RAIZ, 'components/pos/pos-terminal.tsx'), 'utf8');
  assert.equal(terminal.match(/quitarCodigoSiYaLoUso\(r\)/g)?.length, 2);
});
