import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ─────────────────────────────────────────────────────────────────────────────
// Factura fantasma tras un sellado fallido.
//
// `sellarFacturaYActualizar` (lib/studio-context.tsx) añade la factura al
// estado local de forma OPTIMISTA antes de que el servidor confirme el
// sellado. Si `POST /api/facturas/sellar` falla (NIF vacío/de relleno, red,
// RLS...), no se inserta ninguna fila en `facturas` — pero el código no
// revertía el optimista ni avisaba: el usuario veía la factura en pantalla
// hasta el siguiente refresco desde el servidor, sin saber que nunca se
// guardó de verdad.
//
// No se puede instanciar `StudioProvider` aquí sin un cliente Supabase real
// (mismo motivo por el que este repo testea flujos de servidor con lectura
// estática del fuente en vez de ejecución en vivo, ver lib/migraciones.test.ts
// / lib/tope-socias-idempotencia.test.ts) — así que este test fija el
// contrato en el código fuente: si `sellarFactura` no es `ok`, tiene que
// desaparecer del array y avisar al usuario.
// ─────────────────────────────────────────────────────────────────────────────

const apiClientSrc = readFileSync(new URL('./api-client.ts', import.meta.url), 'utf-8');
const studioContextSrc = readFileSync(new URL('./studio-context.tsx', import.meta.url), 'utf-8');

test('sellarFactura propaga el mensaje de error real del servidor, no lo descarta', () => {
  const fn = apiClientSrc.slice(apiClientSrc.indexOf('export async function sellarFactura'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

  // El `catch` de red y el `if (!res.ok)` tienen que devolver un `error`
  // legible, no un `{ ok: false }` mudo.
  assert.match(body, /if \(!res\.ok\) return \{ ok: false, error: .*\}/);
  assert.match(body, /catch \{[\s\S]*return \{ ok: false, error: .*\};[\s\S]*\}/);
});

test('sellarFacturaYActualizar revierte la factura optimista y avisa al usuario si el sellado falla', () => {
  const start = studioContextSrc.indexOf('async function sellarFacturaYActualizar');
  assert.notEqual(start, -1, 'no se encontró sellarFacturaYActualizar en studio-context.tsx');
  const fn = studioContextSrc.slice(start, studioContextSrc.indexOf('\n  }\n', start) + 4);

  // Camino de éxito: reconcilia con los valores del servidor.
  assert.match(fn, /if \(r\.ok && r\.factura\)/);

  // Camino de fallo: debe existir un `else` que (a) quite la factura
  // optimista del array por id y (b) muestre un aviso visible.
  const elseBranch = fn.slice(fn.indexOf('} else {'));
  assert.match(
    elseBranch,
    /setFacturas\(prev => prev\.filter\(f => f\.id !== fac\.id\)\)/,
    'debe quitar la factura optimista de `facturas` cuando el sellado falla'
  );
  assert.match(
    elseBranch,
    /setDbError\(/,
    'debe avisar al usuario (toast de error) cuando el sellado falla'
  );
});

test('el aviso de NIF inválido de sellar-factura-server llega hasta el toast (no se pierde en el camino)', () => {
  const sellarServerSrc = readFileSync(new URL('./billing/sellar-factura-server.ts', import.meta.url), 'utf-8');
  assert.match(sellarServerSrc, /Configura un NIF fiscal válido/);

  // La ruta HTTP debe reenviar `r.error` tal cual en el body JSON de error.
  const routeSrc = readFileSync(new URL('../app/api/facturas/sellar/route.ts', import.meta.url), 'utf-8');
  assert.match(routeSrc, /NextResponse\.json\(\{ error: r\.error \}/);

  // Y el cliente debe leerlo del body JSON de error, no descartarlo.
  assert.match(apiClientSrc, /error: data\?\.error/);
});
