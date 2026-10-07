import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Tres arreglos de la pasada del 7-oct-2026 que NO se pueden ejercitar sin una base de datos y un Stripe
// reales aquí: se fija por estructura que siguen donde tienen que estar, sobre el ÚLTIMO cuerpo de cada
// función en las migraciones y sobre el texto de las rutas (mismo estilo que `cola-prioridad-contrato`).

const RAIZ = join(import.meta.dirname, '..', '..');
const DIR = join(RAIZ, 'supabase', 'migrations');
const MIGRACIONES = readdirSync(DIR).filter(n => n.endsWith('.sql')).sort();
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

function cuerpoVigente(fn: string): string {
  let ultimo: string | null = null;
  for (const nombre of MIGRACIONES) {
    const sql = readFileSync(join(DIR, nombre), 'utf8');
    const re = new RegExp(String.raw`create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?${fn}\s*\(`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const resto = sql.slice(m.index);
      const abre = /\$(function|body)?\$/.exec(resto);
      if (!abre) continue;
      const cierra = resto.indexOf(abre[0], abre.index + abre[0].length);
      if (cierra === -1) continue;
      ultimo = resto.slice(abre.index + abre[0].length, cierra);
    }
  }
  assert.notEqual(ultimo, null, `No se encontró ninguna definición de ${fn}`);
  return ultimo!;
}

test('cancelar una reserva de una clase que ya empezó no crea penalización', () => {
  const c = cuerpoVigente('cancelar_reserva_plaza').replace(/\s+/g, ' ');
  const i = c.indexOf('insert into penalizaciones');
  assert.ok(i > 0, 'sigue habiendo penalización por cancelación tardía');
  // La condición del `if` que la rodea.
  const cond = c.slice(c.lastIndexOf('if v_estado in', i), i);
  assert.match(cond, /v_tardia/, 'solo si la cancelación es tardía');
  assert.match(cond, /v_inicio > now\(\)/, 'y solo si la clase aún no ha empezado: corregir un check-in no es cancelar tarde');
  assert.match(cond, /not p_omitir_penalizacion/, 'el aviso del servidor de que no penalice sigue mandando');
});

test('la plaza que deja libre una oferta rechazada por un motivo propio se ofrece a la siguiente', () => {
  const ts = leer('lib/db/supabase-data-admin.ts');
  const ini = ts.indexOf("if (resultado === 'LIMITE_SEMANAL'");
  const fin = ts.indexOf("if (resultado !== 'CONFIRMADA')", ini);
  assert.ok(ini > 0 && fin > ini, 'sigue existiendo la rama de rechazo por motivo propio');
  assert.match(ts.slice(ini, fin), /await promocionarEsperaTrasRechazoPropio\(admin, \{ studioId: params\.studioId, sesionId \}\);/,
    'esa rama llama al helper que promociona');
  // El helper usa la función de base de datos y reutiliza el seguimiento de siempre (aviso + oferta).
  const h = ts.slice(ts.indexOf('async function promocionarEsperaTrasRechazoPropio'));
  assert.match(h.slice(0, 1400), /rpc\('promocionar_espera_de_sesion'/);
  assert.match(h.slice(0, 1400), /await seguirPromocionDeEspera\(admin,/);
  // No debe poder tumbar la aceptación ya resuelta: avisa a Sentry y sigue.
  assert.match(h.slice(0, 2200), /catch \(e\)[\s\S]{0,80}Sentry\.captureException/);
});

test('promocionar_espera_de_sesion: misma promoción que al expirar una oferta, y solo para el servidor', () => {
  const c = cuerpoVigente('promocionar_espera_de_sesion').replace(/\s+/g, ' ');
  assert.match(c, /public\.promocionar_siguiente_espera\(p_studio_id, p_sesion_id, v_plazo\)/);
  assert.match(c, /perform public\.renumerar_lista_espera\(p_sesion_id\)/, 'la cola se numera en UN sitio');
  assert.match(c, /for update/, 'con el candado de la clase');
  assert.match(c, /studio_id = p_studio_id/, 'acotada al estudio');
  const sql = readFileSync(join(DIR, MIGRACIONES.find(n => n.includes('promocionar_espera_de_sesion'))!), 'utf8');
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(sql, new RegExp(String.raw`revoke execute on function public\.promocionar_espera_de_sesion\(text, text\) from ${rol};`),
      `REVOKE explícito a ${rol} (pg_default_acl da EXECUTE directo, no solo vía PUBLIC)`);
  }
  assert.match(sql, /grant execute on function public\.promocionar_espera_de_sesion\(text, text\) to service_role;/);
});

test('devolución del POS por Stripe: candado y clave de Stripe salen del estado de la venta, no de un id nuevo', () => {
  const f = leer('app/api/pos/devolucion/route.ts');
  const modo = f.indexOf('comprobarModoStripe()');
  const candado = f.indexOf('await reclamarOperacion(admin, candadoStripe');
  const reembolso = f.indexOf('stripe.refunds.create(');
  assert.ok(modo > 0 && candado > modo && reembolso > candado,
    'primero el guardia de modo, luego el candado, y solo entonces el reembolso');
  assert.match(f, /const candadoStripe = `pos-devol:\$\{ventaId\}:\$\{devueltoCentimos\}`;/);
  assert.match(f, /idempotencyKey: `pos-devol-\$\{ventaId\}-\$\{devueltoCentimos\}-\$\{Math\.round\(importe \* 100\)\}`/);
  assert.doesNotMatch(f, /idempotencyKey: `pos-devol-\$\{devolucionId\}`/, 'una clave por petición no frena un doble envío');
  // Si Stripe falla, se suelta el candado para poder reintentar; si todo va bien, se completa.
  assert.ok(f.indexOf('await fallarWebhookEvent(admin, candadoStripe);') > reembolso);
  assert.match(f, /if \(candadoStripeTomado\) await marcarWebhookProcesado\(admin, candadoStripe\);/);
});

test('el precio de la clase suelta que se enseña sale con el tipo de la clase, como lo cobra el mostrador', () => {
  assert.match(leer('lib/student/mapeo.ts'), /precioDeSesion\(s\.precioPuntual, d\.planesTarifa, s\.tipoClaseId \?\? null\)/);
  assert.match(leer('app/reservar/[slug]/page.tsx'), /precioPorTipo: \(t\) => precioSueltaDe\(planesTarifa, t\)/);
  assert.match(leer('lib/reservar/construir-slots.ts'), /precioPorTipo: \(t\) => precioSueltaDe\(planesTarifa, t\)/);
});

test('el prefijo `res-pf-` de una reserva de clase fija se lee en UN sitio (lib/reservas/plaza-fija-id.ts)', () => {
  const recorrer = (dir: string): string[] => readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap(e => {
    const ruta = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : recorrer(ruta);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
  });
  const sueltos = ['lib', 'app', 'components']
    .flatMap(recorrer)
    .filter(f => f !== 'lib/reservas/plaza-fija-id.ts')
    .filter(f => /startsWith\(\s*['"]res-pf-['"]\s*\)/.test(readFileSync(join(RAIZ, f), 'utf8')));
  assert.deepEqual(sueltos, [],
    'Usa esReservaPlazaFija(id) de lib/reservas/plaza-fija-id.ts: es un contrato, no un nombre, y un literal suelto no lo ve quien lo cambie.');
});
