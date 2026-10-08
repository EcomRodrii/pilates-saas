import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Un cobro, una devolución o una cancelación cuya RESPUESTA se pierde (red caída tras enviar, un 502 con HTML) pueden haberse
// hecho igualmente. Antes la función lanzaba, el rechazo quedaba sin gestionar y la pantalla no decía nada: el recibo parecía
// pendiente y se volvía a pulsar. Estos textos fijan que cada sitio responde con un error legible y que quien llama relee el
// estado en vez de adivinarlo. (`api-client` y los componentes usan el alias `@/`, que `node --test` no resuelve: se fijan por
// estructura, como el resto de contratos de este tipo.)

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

/** El cuerpo de una función exportada: desde su cabecera hasta la siguiente `export` de nivel superior. */
function cuerpoDe(fuente: string, cabecera: string): string {
  const i = fuente.indexOf(cabecera);
  assert.ok(i >= 0, `no se encontró «${cabecera}»`);
  const j = fuente.indexOf('\nexport ', i + cabecera.length);
  return fuente.slice(i, j === -1 ? undefined : j);
}

const API = leer('lib/api-client.ts');

test('cobrarOnlineDirecto: nunca lanza; sin respuesta devuelve un error con su código y sin JSON no revienta', () => {
  const f = cuerpoDe(API, 'export async function cobrarOnlineDirecto(');
  assert.match(f, /try \{[\s\S]*await fetch\('\/api\/cobros\/cobrar-online'/, 'el fetch va dentro de un try');
  assert.match(f, /await res\.json\(\)\.catch\(\(\) => \(\{\}\)\)/, 'un 502 con HTML no rompe el parseo');
  assert.match(f, /catch \{\s*return \{ error: [^}]*errorCode: CODIGO_RESPUESTA_PERDIDA/, 'y el catch contesta con el código de respuesta perdida');
});

test('reembolsarRecibo: nunca lanza y dice que se mire el recibo antes de repetir', () => {
  const f = cuerpoDe(API, 'export async function reembolsarRecibo(');
  assert.match(f, /try \{[\s\S]*await fetch\('\/api\/reembolsos'/);
  assert.match(f, /catch \{\s*return \{ error: 'No hemos podido confirmar la devolución\./);
});

test('enviarEmailRecibo devuelve si salió (nunca lanza) y enviarEmailReserva, sin llamadores, ya no existe', () => {
  const f = cuerpoDe(API, 'export async function enviarEmailRecibo(');
  assert.match(f, /Promise<boolean>/);
  assert.match(f, /return res\.ok;/);
  assert.match(f, /catch \{\s*return false;/);
  assert.doesNotMatch(API, /enviarEmailReserva\b/);
});

test('cobrar sin ella: una respuesta perdida relee el estudio y un justificante que no sale se avisa', () => {
  const f = leer('components/cobros/use-acciones-recibo.tsx');
  assert.match(f, /CODIGO_RESPUESTA_PERDIDA/);
  const una = f.slice(f.indexOf('async function cobrarSinElla('), f.indexOf('async function cobrarSinEllaVarios('));
  assert.match(una, /errorCode === CODIGO_RESPUESTA_PERDIDA\) resetDatosPilates\(\)/);
  const varios = f.slice(f.indexOf('async function cobrarSinEllaVarios('), f.indexOf('function abrirPedirTarjeta('));
  assert.match(varios, /relectura = true/);
  assert.match(varios, /if \(cobrados > 0 \|\| relectura\) resetDatosPilates\(\)/);
  assert.match(f, /enviarEmailRecibo\([\s\S]*?\)\.then\(salio => \{\s*if \(!salio\) avisos\.error\(/, 'el justificante que no sale se avisa');
});

test('devolver un recibo: el botón no se queda en «enviando» ni calla si algo falla', () => {
  const f = leer('components/socios/boton-devolver-recibo.tsx');
  const c = f.slice(f.indexOf('async function confirmar()'), f.indexOf('return (', f.indexOf('async function confirmar()')));
  assert.match(c, /try \{\s*res = await reembolsarRecibo\(/);
  assert.match(c, /finally \{\s*setEnviando\(false\);/);
});

test('deuda de clienta: cancelar un cobro con datáfono o Bizum no ofrece otro método hasta que se CONFIRMA que no hay cobro vivo', () => {
  const f = leer('components/pos/deuda-clienta.tsx');
  const c = f.slice(f.indexOf('async function cancelar()'), f.indexOf("if (fase.f === 'esperando') {", f.indexOf('async function cancelar()')));
  const iCancelar = c.indexOf("confirmarCobroRecibo(reciboId, metodo, 'cancelar', referencia)");
  const iQuieto = c.indexOf("setFase({ f: 'quieto' })");
  assert.ok(iCancelar > 0 && iQuieto > iCancelar, 'primero se pregunta al servidor y solo después se vuelve a «quieto»');
  assert.match(c, /esEstadoFinal\(r\.pagoEstado\)/, 'solo si el pago ya no puede cambiar');
  assert.match(c, /no cobres con otro método/, 'si no se confirma, se sigue esperando y se dice');
});

test('cancelar una reserva desde el mostrador: sin respuesta NO se devuelve a «confirmada» ni se dice que no se pudo', () => {
  const f = leer('lib/studio-context.tsx');
  // La del mostrador (`cancelarReserva`) es la ÚLTIMA llamada a este endpoint del contexto.
  const c = f.slice(f.lastIndexOf("const respuesta = await fetch('/api/reservas/cancelar'"));
  const iNulo = c.indexOf('if (respuesta === null) {');
  const iJson = c.indexOf('await respuesta.json()');
  assert.ok(iNulo > 0 && iJson > iNulo, 'el caso «no llegó» se trata antes de leer el cuerpo');
  assert.match(c.slice(iNulo, iJson), /resetDatosPilates\(\);[\s\S]*puede haberse hecho/);
});

test('cancelar una reserva desde el panel es idempotente: una ya cancelada contesta «ya estaba» sin efectos', () => {
  const f = leer('app/api/reservas/cancelar/route.ts');
  const iPrevia = f.indexOf("previa?.estado === 'CANCELADA'");
  const iEjecutar = f.indexOf('await ejecutarCancelacionReserva(');
  assert.ok(iPrevia > 0 && iEjecutar > iPrevia, 'la comprobación va ANTES de ejecutar la cancelación (y de sus avisos)');
  assert.match(f.slice(iPrevia, iEjecutar), /yaCancelada: true/);
});

test('«no puede venir» (baja con recuperación): repite si se pierde la respuesta y no deshace la recuperación a ciegas', () => {
  const f = leer('lib/studio-context.tsx');
  const c = f.slice(f.indexOf('async function bajaConRecuperacion('), f.indexOf('// ── Citas: servicios y horario fino'));
  assert.match(c, /for \(let intento = 0; intento < 3 && respuesta === null; intento\+\+\)/, 'hasta tres intentos');
  const iSin = c.indexOf("recuperacion: 'SIN_CONFIRMAR'");
  const iAnular = c.indexOf('await dbAnularRecuperacion(');
  assert.ok(iSin > 0 && iAnular > iSin, 'sin respuesta tras repetir → «sin confirmar», y solo un rechazo DEFINITIVO anula la recuperación');
  assert.match(c.slice(0, iSin + 40), /resetDatosPilates\(\);\s*return \{ recuperacion: 'SIN_CONFIRMAR'/, 'releyendo el estado antes de avisar');
  assert.match(leer('components/socios/boton-baja-recuperacion.tsx'), /res\.recuperacion === 'SIN_CONFIRMAR'/);
});
