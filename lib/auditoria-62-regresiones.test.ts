// Guardianes de la 62ª pasada de auditoría. Todos son de INSPECCIÓN DE FUENTE,
// la convención que ya usan lib/reservas/reserva-mostrador.test.ts y
// lib/billing/procesar-reembolso.test.ts: el comportamiento que protegen vive en
// rutas de Next, en un componente de navegador o en una caché de módulo, y
// montar ese entorno bajo `node --test` costaría más de lo que aporta. Cada uno
// FALLA contra el fichero anterior al arreglo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

// ── [P-2] `Vary: Origin` también cuando el origen NO está autorizado ─────────
// `/api/public/aforo` es la única ruta con caché de CDN (s-maxage=5). Sin `Vary`
// en la rama de origen no autorizado, la CDN puede servir al widget embebido una
// respuesta sin Access-Control-Allow-Origin y el aforo se congela.
test('corsHeadersWidget: la rama sin origen autorizado devuelve Vary: Origin', () => {
  const src = leer('lib/cors-widget.ts');
  const i = src.indexOf('export function corsHeadersWidget');
  assert.ok(i > 0, 'no se encuentra corsHeadersWidget: revisa este guardián');
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  const rama = cuerpo.slice(cuerpo.indexOf('if (!origenValido)'));
  const corte = rama.indexOf('\n  return {');
  assert.ok(corte > 0, 'no se encuentra la rama de retorno temprano');
  assert.match(
    rama.slice(0, corte),
    /Vary/,
    'la rama `if (!origenValido)` devuelve cabeceras sin Vary: Origin — la CDN '
    + 'puede reutilizar esa variante para el widget embebido y romperle el CORS',
  );
});

// ── [C-1] invalidar las DOS claves de caché de clases fijas ─────────────────
test('clases-fijas: al invalidar se borran ofertas Y sueltas, no solo ofertas', () => {
  const src = leer('lib/db/clases-fijas.ts');
  assert.ok(
    src.includes('conCacheCatalogo(claveSueltasClasesFijas('),
    'ya no se cachean las sueltas: revisa este guardián',
  );
  assert.ok(
    src.includes('invalidarCacheCatalogo(claveSueltasClasesFijas('),
    'se cachea `claveSueltasClasesFijas` pero nunca se invalida: tocar una oferta '
    + 'deja las franjas sueltas viejas hasta agotar el TTL',
  );
});

// ── [A-03] la barra invertida es una barra para el navegador ────────────────
test('bienvenido-apertura: destinoValido rechaza la barra invertida', () => {
  const src = leer('app/(dashboard)/bienvenido-apertura/page.tsx');
  const i = src.indexOf('function destinoValido');
  assert.ok(i > 0, 'no se encuentra destinoValido: revisa este guardián');
  const cuerpo = src.slice(i, src.indexOf('\n}', i));
  assert.match(
    cuerpo,
    /\\\\/,
    'destinoValido no filtra `\\`: el parser WHATWG lo trata como `/` para http(s), '
    + 'así que `/\\evil.com` es una redirección abierta. Mismo criterio que '
    + 'destinoTrasMfa en lib/interno/mfa.ts',
  );
});

// ── [R-1 rendimiento] no sondear con la pestaña oculta ─────────────────────
test('hilo-mensajes: los dos polling de 5 s respetan document.hidden', () => {
  const src = leer('components/network/hilo-mensajes.tsx');
  const intervalos = src.match(/setInterval\(/g) ?? [];
  assert.equal(intervalos.length, 2, 'han cambiado los polling: revisa este guardián');
  assert.equal(
    (src.match(/document\.hidden/g) ?? []).length, 2,
    'falta el guard de pestaña oculta en alguno de los dos polling de 5 s',
  );
  // Y que el guard NO se coma la primera carga, o la tarjeta se queda colgada.
  assert.equal(
    (src.match(/yaCargado && typeof document/g) ?? []).length, 2,
    'el guard debe saltarse solo los SONDEOS: la primera carga tiene que ocurrir '
    + 'aunque la pestaña esté oculta, o `mensajes` y `cargandoFormalizacion` se '
    + 'quedan colgados',
  );
});
