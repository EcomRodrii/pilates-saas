import test from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Bug real de producción (28-sep-2026): varios estudios sin poder deslizar en
// NINGÚN sitio del panel, sin ningún diálogo visible — el contador de
// lib/bloqueo-scroll.ts se quedó por encima de 0 y, como nunca vuelve solo a
// 0, ninguna hoja nueva podía ya desbloquear el scroll.
//
// `document` no existe en `node --test` (sin jsdom): se sustituye por un
// objeto mínimo con lo único que este módulo toca (`body.style.overflow` y
// `documentElement.style.overflow`), y se reimporta el módulo en cada test
// (`t.mock` de módulos no aplica aquí; se limpia con `reiniciarBloqueoDeScroll`)
// para no arrastrar el contador de un test a otro.
// ─────────────────────────────────────────────────────────────────────────────

function documentoFalso() {
  return {
    body: { style: { overflow: '' } },
    documentElement: { style: { overflow: '' } },
  };
}

async function importarConDocumento(doc: ReturnType<typeof documentoFalso>) {
  (globalThis as { document?: unknown }).document = doc;
  // Cache-bust: cada test quiere el módulo con su propio estado de cierre
  // (`hojasAbiertas`/`overflowPrevio` son module-level), así que se importa
  // con una query distinta cada vez para forzar una instancia nueva.
  return import(`./bloqueo-scroll.ts?t=${Math.random()}`);
}

test('adquirir/liberar: bloquea al abrir la primera hoja y desbloquea al cerrar la última', async () => {
  const doc = documentoFalso();
  const { adquirirBloqueoScroll } = await importarConDocumento(doc);

  const liberar1 = adquirirBloqueoScroll();
  assert.equal(doc.body.style.overflow, 'hidden');
  assert.equal(doc.documentElement.style.overflow, 'hidden');

  liberar1();
  assert.equal(doc.body.style.overflow, '', 'se restaura al cerrar la única hoja');
  assert.equal(doc.documentElement.style.overflow, '');
});

test('hojas anidadas: solo se desbloquea cuando se cierra la ÚLTIMA, en cualquier orden', async () => {
  const doc = documentoFalso();
  const { adquirirBloqueoScroll } = await importarConDocumento(doc);

  const liberarFuera = adquirirBloqueoScroll(); // ficha de clase
  const liberarDentro = adquirirBloqueoScroll(); // modal de reserva, encima

  liberarFuera(); // se cierra la de FUERA primero — la de dentro sigue abierta
  assert.equal(doc.body.style.overflow, 'hidden', 'sigue bloqueado: la hoja de dentro no se ha cerrado');

  liberarDentro();
  assert.equal(doc.body.style.overflow, '', 'ahora sí, ya no queda ninguna hoja');
});

test('conserva el overflow que hubiera ANTES de la primera hoja (no siempre vacío)', async () => {
  const doc = documentoFalso();
  doc.body.style.overflow = 'auto'; // la página ya traía algo distinto de ''
  const { adquirirBloqueoScroll } = await importarConDocumento(doc);

  const liberar = adquirirBloqueoScroll();
  liberar();
  assert.equal(doc.body.style.overflow, 'auto');
});

test('⚠️ red de seguridad: un residuo de "hidden" sin ninguna hoja no se arrastra al abrir una nueva', async () => {
  const doc = documentoFalso();
  // Simula la fuga: el fondo quedó bloqueado de una tanda anterior cuyo
  // cleanup nunca corrió, y el contador (recién importado, a 0) no lo sabe.
  doc.body.style.overflow = 'hidden';
  doc.documentElement.style.overflow = 'hidden';
  const { adquirirBloqueoScroll } = await importarConDocumento(doc);

  const liberar = adquirirBloqueoScroll();
  liberar();
  assert.equal(doc.body.style.overflow, '', 'se corrige a la base sana en vez de perpetuar "hidden"');
  assert.equal(doc.documentElement.style.overflow, '');
});

test('reiniciarBloqueoDeScroll: fuerza el contador a 0 y limpia el overflow, aunque haya hojas "abiertas"', async () => {
  const doc = documentoFalso();
  const { adquirirBloqueoScroll, reiniciarBloqueoDeScroll, hojasAbiertasParaTest } = await importarConDocumento(doc);

  adquirirBloqueoScroll();
  adquirirBloqueoScroll();
  assert.equal(hojasAbiertasParaTest(), 2);

  reiniciarBloqueoDeScroll();
  assert.equal(hojasAbiertasParaTest(), 0);
  assert.equal(doc.body.style.overflow, '');
  assert.equal(doc.documentElement.style.overflow, '');
});

test('reiniciarBloqueoDeScroll en el caso sano (nada abierto) no cambia nada', async () => {
  const doc = documentoFalso();
  const { reiniciarBloqueoDeScroll } = await importarConDocumento(doc);

  reiniciarBloqueoDeScroll();
  assert.equal(doc.body.style.overflow, '');
  assert.equal(doc.documentElement.style.overflow, '');
});
