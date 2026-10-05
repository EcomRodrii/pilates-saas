import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exigirCheckoutLeido } from './pago-online-al-cobrar-a-mano.ts';
import { puedeMoverDinero } from '../permisos-reglas.ts';

// El datáfono y el Bizum del mostrador (`/api/pos/recibo`) cobraban un recibo con
// el pago online de la alumna todavía ABIERTO: si lo terminaba después (un 3DS que
// aprueba más tarde), entraban dos cobros reales. Ahora lo cierran antes, con el
// mismo dueño que «marcar cobrado» y «Cobrar online» (`cerrarPagoOnlineDelRecibo`),
// y su compare-and-set exige que la sesión guardada siga siendo la leída.

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (ruta: string) => sinComentarios(readFileSync(join(raiz, ruta), 'utf8'));

type Filtro = [op: string, columna: string, valor: unknown];
function builder() {
  const filtros: Filtro[] = [];
  const b = {
    is(c: string, v: null) { filtros.push(['is', c, v]); return b; },
    eq(c: string, v: string) { filtros.push(['eq', c, v]); return b; },
    or(expr: string) { filtros.push(['or', '', expr]); return b; },
  };
  return { b, filtros };
}

test('compare-and-set de la sesión leída: sin sesión leída, sigue sin ninguna', () => {
  const { b, filtros } = builder();
  exigirCheckoutLeido(b, null);
  assert.deepEqual(filtros, [['is', 'checkout_session_id', null]]);
});

test('compare-and-set de la sesión leída: la que se cerró, o ninguna (la suelta el conciliador al caducar), nunca otra', () => {
  const { b, filtros } = builder();
  exigirCheckoutLeido(b, 'cs_test_a1B2c3');
  assert.deepEqual(filtros, [['or', '', 'checkout_session_id.is.null,checkout_session_id.eq.cs_test_a1B2c3']]);
});

test('un id con otra forma no entra en el `or`: se exige tal cual', () => {
  const { b, filtros } = builder();
  exigirCheckoutLeido(b, 'cs_x),id.neq.(y');
  assert.deepEqual(filtros, [['eq', 'checkout_session_id', 'cs_x),id.neq.(y']]);
});

test('/api/pos/recibo: rol que mueve dinero, y cierra el pago online ANTES de arrancar el cobro', () => {
  const s = leer('app/api/pos/recibo/route.ts');
  const sesion = s.indexOf('await verificarSesionStaff(req)');
  const rol = s.indexOf('if (!puedeMoverDinero(sesion.rol)) {');
  const prepara = s.indexOf('await prepararCobroNuevo(');
  const cierra = s.indexOf('await cerrarPagoOnlineDelRecibo(');
  const inicia = s.indexOf('await cobro.iniciar(');
  assert.ok(sesion > 0 && rol > sesion && prepara > rol && cierra > prepara && inicia > cierra,
    'sesión → rol → preparar → cerrar el pago online → arrancar el cobro');
  assert.match(s.slice(rol, rol + 200), /status: 403/);
  assert.match(s.slice(cierra, inicia), /if \(!online\.ok\) return NextResponse\.json\(\{ error: online\.mensaje \}, \{ status: 409 \}\);/,
    'ya pagado online o sin poder saberlo: no se cobra');
  assert.match(s, /checkout_session_id, cobro_mostrador_pi, cobro_off_session_clave, entrega_tipo/, 'lee la sesión guardada');
});

test('/api/pos/recibo: guardar la referencia exige la sesión que se leyó (otra abierta después: no se cobra)', () => {
  const s = leer('app/api/pos/recibo/route.ts');
  const guarda = s.indexOf('cobro_mostrador_pi: inicio.referencia,');
  const exige = s.indexOf('guardar = exigirCheckoutLeido(guardar, online.checkoutLeido);', guarda);
  const select = s.indexOf(".select('id')", guarda);
  assert.ok(guarda > 0 && exige > guarda && select > exige);
});

test('roles: recepción y propietaria cobran en la Caja; gerencia e instructora no', () => {
  assert.equal(puedeMoverDinero('RECEPCION'), true);
  assert.equal(puedeMoverDinero('PROPIETARIO'), true);
  assert.equal(puedeMoverDinero('MANAGER'), false);
  assert.equal(puedeMoverDinero('INSTRUCTOR'), false);
});

test('las tres vías del mostrador cierran el pago online con el MISMO dueño', () => {
  const guarda = leer('lib/cobros/antes-de-cobrar-a-mano-servidor.ts');
  // «marcar cobrado» y «Cobrar online» pasan por soltarPagosEnMarchaAntesDeCobrar, que termina en él.
  const soltar = guarda.slice(guarda.indexOf('export async function soltarPagosEnMarchaAntesDeCobrar('), guarda.indexOf('export async function soltarCobroDeMostradorDelRecibo('));
  assert.match(soltar, /return cerrarPagoOnlineDelRecibo\(/);
  assert.match(leer('lib/billing/stripe-cobros.ts'), /await soltarPagosEnMarchaAntesDeCobrar\(/);
  assert.match(leer('app/api/cobros/marcar-cobrado/route.ts'), /await soltarPagosEnMarchaAntesDeCobrar\(/);
  assert.match(leer('app/api/pos/recibo/route.ts'), /await cerrarPagoOnlineDelRecibo\(/);
});
