import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Devolver una venta cobrada con el datáfono de SumUp. SumUp no tiene clave de
// idempotencia ni aviso de devolución: el candado, la comprobación de lo ya
// devuelto y la reparación del libro viven en el código, y aquí se fija su orden.
// La regla de decisión tiene sus propios tests en sumup.test.ts.
const leer = (rel: string) => readFileSync(join(import.meta.dirname, '../..', rel), 'utf8');

test('⚠️ la devolución de SumUp: candado (cerrado) → transacción → comprobaciones → decisión → devolver', () => {
  const f = leer('lib/pos/sumup-devolucion.ts');
  const candado = f.indexOf("reclamarOperacion(admin, candado, 'sumup.devolucion'");
  const errorCierra = f.indexOf("if (reclamo.estado === 'error')", candado);
  const leerTxn = f.indexOf('cliente.buscarTransaccion(merchantCode, ref.clientTransactionId)', errorCierra);
  const contracargo = f.indexOf('if (tieneContracargo(t))', leerTxn);
  const total = f.indexOf('if (centimosSinPropina(t) !== p.totalVenta)', contracargo);
  const sinEventos = f.indexOf('if (devueltoSumup === null)', total);
  const decide = f.indexOf('decidirDevolucionSumup(', sinEventos);
  const yaEstaba = f.indexOf("decision.tipo === 'ya-devuelta'", decide);
  const devolver = f.indexOf('cliente.devolver(merchantCode, t.id, p.pedido)', yaEstaba);
  assert.ok(candado > 0 && errorCierra > candado && leerTxn > errorCierra && contracargo > leerTxn && total > contracargo
    && sinEventos > total && decide > sinEventos && yaEstaba > decide && devolver > yaEstaba,
    'candado que falla cerrado → transacción → contracargo, total y eventos → decisión → devolver');
  assert.match(f, /const candado = `sumup-devol:\$\{p\.ventaId\}:\$\{p\.devueltoLibro\}`;/, 'un candado por venta y por lo ya devuelto');
  assert.doesNotMatch(f, /reclamarWebhookEvent\(/, 'el de los avisos falla ABIERTO: para dinero que sale, no');
  assert.equal((f.match(/cliente\.devolver\(/g) ?? []).length, 1, 'un único sitio que devuelve');
  // Lo devuelto desde la app de SumUp solo se apunta si es un intento nuestro o se confirma.
  assert.match(f, /if \(reclamo\.previa \|\| p\.soloApuntar\) return \{ ok: true, transaccionId: t\.id, yaEstaba: true, candado \};/);
});

test('⚠️ la ruta: el dinero sale antes que el libro; si el libro falla con SumUp, fila de devoluciones, candado suelto y se dice', () => {
  const f = leer('app/api/pos/devolucion/route.ts');
  const sumup = f.indexOf('await devolverEnSumup(admin, {');
  const libro = f.indexOf('p_por: sesion.userId, p_por_nombre: sesion.nombre, p_simular: false,');
  assert.ok(sumup > 0 && libro > sumup, 'SumUp devuelve ANTES de tocar el libro');
  const fallo = f.indexOf('if (errAplicar) {', libro);
  const fila = f.indexOf('await registrarDevolucion(admin, {', fallo);
  const soltar = f.indexOf('await fallarWebhookEvent(admin, sumup.candado);', fila);
  const completar = f.indexOf('if (sumup) await marcarWebhookProcesado(admin, sumup.candado);', soltar);
  assert.ok(fallo > 0 && fila > fallo && soltar > fila && completar > soltar,
    'libro fallido → fila de devoluciones + candado suelto; libro bien → candado completado');
  assert.match(f, /dineroDevuelto: true,\n      \}, \{ status: 500 \}\);/, 'el fallo del libro con SumUp dice que el dinero YA salió');
  assert.match(f, /yaEstaba: sumup\?\.yaEstaba \?\? false,/, 'si no salió dinero nuevo, la pantalla lo sabe');
});

test('la pantalla de Ventas no dice «devuelto a su tarjeta» cuando no salió dinero, y ofrece apuntar sin devolver', () => {
  const f = leer('components/pos/hoja-ventas.tsx');
  assert.match(f, /r\.yaEstaba\n\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+\? `Apuntada la devolución/);
  assert.match(f, /setPuedeSoloApuntar\(r\.codigo === 'SUMUP_YA_DEVUELTO'\)/);
  assert.match(leer('lib/pos/sumup-devolucion.ts'), /export const CODIGO_SUMUP_YA_DEVUELTO = 'SUMUP_YA_DEVUELTO';/);
});
