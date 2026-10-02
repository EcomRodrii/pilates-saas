import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Lo que el panel de Cobros no puede volver a hacer (2-oct-2026). Sin servidor no
// se puede probar de otra forma; se fija en el código.

const raiz = join(import.meta.dirname, '../..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const cuerpo = (src: string, desde: string, hasta: string) => src.slice(src.indexOf(desde), src.indexOf(hasta, src.indexOf(desde)));

test('«Cobrar varias» siempre con método: sin él, el cobro no entra en la caja ni en el desglose', () => {
  for (const f of ['components/cobros/dialogo-cobro-en-lote.tsx', 'app/(dashboard)/dashboard/page.tsx', 'components/clientas/ficha-clienta.tsx']) {
    assert.doesNotMatch(sinComentarios(leer(f)), /marcarCobradoVarios\([^)]*undefined/, f);
  }
  assert.match(leer('lib/studio-context.tsx'), /marcarCobradoVarios: \(ids: string\[\], metodo: MetodoCobro,/, 'el método es obligatorio en el tipo');
});

test('«Cobrar varias» entra todo lo que se debe (no solo lo pendiente de un plan activo)', () => {
  const panel = sinComentarios(leer('components/cobros/quien-me-debe.tsx'));
  const lote = cuerpo(panel, 'const loteDe = ', ';\n');
  assert.match(lote, /entraEnCobroEnLote\(r\)/);
  assert.doesNotMatch(lote, /estado === 'ACTIVA'/);
});

test('«Cobrar todos» del Resumen pregunta el método antes de cobrar', () => {
  const resumen = sinComentarios(leer('app/(dashboard)/dashboard/page.tsx'));
  assert.doesNotMatch(resumen, /cobrarTodosPendientes\(\)/, 'sin método ni confirmación cobraba todo lo pendiente del estudio');
  assert.match(resumen, /cobrarTodosPendientes\(undefined, metodo\)/);
});

test('«Descargar para la gestoría» baja lo COBRADO, no la lista de lo que te deben', () => {
  const descarga = sinComentarios(leer('components/cobros/use-descarga-cobrado.ts'));
  assert.match(descarga, /dbRecibosCobradosParaExport\(t\.desde, t\.hasta\)/);
  assert.match(descarga, /csvLoCobrado\(filas\)/);
  // Los botones de «Lo que he cobrado» y de «Para tu gestoría» llaman a esa, no a un CSV de las deudas.
  assert.match(sinComentarios(leer('components/cobros/lo-que-he-cobrado.tsx')), /descargas\.descargar\(visible\)/);
  assert.match(sinComentarios(leer('components/cobros/para-tu-gestoria.tsx')), /descargas\.descargar\(bloque\.tramo\)/);
});

test('«Reintentar por el banco» va por el servidor y ya no escribe «Enviado al banco» sin mandar nada', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  const reintentar = cuerpo(ctx, 'async function reintentar(', 'async function deleteRecibo(');
  assert.match(reintentar, /reintentarPorElBancoApi\(/);
  assert.doesNotMatch(reintentar, /EN_CURSO|dbUpdateRecibo/);
});

test('las dos devoluciones por el servidor, y «Le he devuelto el dinero» nunca escribe deuda', () => {
  const ctx = sinComentarios(leer('lib/studio-context.tsx'));
  assert.match(cuerpo(ctx, 'async function reembolsarAMano(', 'async function reintentar('), /reembolsarAManoApi\(/);
  assert.match(cuerpo(ctx, 'async function marcarDevuelto(', 'async function reembolsarAMano('), /marcarReciboDevueltoApi\(reciboId, desde\)/);
  const reembolso = leer('lib/billing/reembolso-manual.ts');
  assert.match(reembolso, /importe_devuelto: importe/, 'un reembolso deja TODO el importe devuelto: si no, es deuda');
});
