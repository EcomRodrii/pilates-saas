import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Auditoría 2026-09-16 (FE-9): estas 5 rutas de token que llegan por email
// hacen `await admin.from(...)` en un Server Component y no tenían NINGÚN
// `error.tsx` propio — un fallo de red/BD caía al `error.tsx` raíz
// (app/global-error.tsx), que reemplaza <html>/<body> enteros sin marca del
// estudio. Este guardián evita que una ruta nueva de la misma familia se añada
// sin su boundary, y que uno existente se reescriba sin `capturarExcepcion`
// (la trampa que documenta app/reservar/[slug]/error.tsx: un error.tsx que
// atrapa sin reportar apaga la alarma de Sentry porque global-error ya no se
// monta).
const RUTAS = ['valorar', 'confirmar-reserva', 'no-puedo', 'aceptar-sustitucion', 'disponibilidad'];
const RAIZ = join(import.meta.dirname, '..', '..', 'app');

test('cada ruta pública de token tiene su propio error.tsx', () => {
  for (const ruta of RUTAS) {
    const fichero = join(RAIZ, ruta, '[token]', 'error.tsx');
    assert.ok(existsSync(fichero), `falta app/${ruta}/[token]/error.tsx`);
  }
});

test('cada error.tsx reporta a Sentry (directo o vía AvisoErrorToken), no solo console.error', () => {
  for (const ruta of RUTAS) {
    const fichero = join(RAIZ, ruta, '[token]', 'error.tsx');
    const src = readFileSync(fichero, 'utf8');
    const reporta = src.includes('capturarExcepcion') || src.includes('AvisoErrorToken');
    assert.ok(reporta, `app/${ruta}/[token]/error.tsx no reporta a Sentry: la alarma se apagaría en silencio`);
  }
});

test('el boundary compartido llama a capturarExcepcion de verdad', () => {
  const src = readFileSync(join(import.meta.dirname, '..', '..', 'components', 'publico', 'aviso-error-token.tsx'), 'utf8');
  assert.match(src, /capturarExcepcion\(/);
});
