// El alta no ofrece ninguna videollamada (fundador, 7-oct-2026) y, desde el
// 21-oct-2026, tampoco una llamada: eso lo vigila lib/sin-promesas-de-ayuda.test.ts.
// Esta guardia vigila que el asistente, su endpoint y /interno no vuelvan a
// ofrecer una videollamada, ni con la palabra ni con el icono de cámara.
//
// Fuera de alcance a propósito: `lib/csv.ts` (detecta clases ONLINE al importar),
// `lib/legal-info.ts` (la integración opcional de Zoom para clases online) y
// `lib/configuracion/secciones.ts` (Zoom). Son clases en línea del estudio, no
// una ayuda que ofrezca Tentare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..', '..');

function ficheros(dir: string): string[] {
  const abs = join(raiz, dir);
  return readdirSync(abs).flatMap((f) => {
    const p = join(dir, f);
    return statSync(join(raiz, p)).isDirectory() ? ficheros(p) : [p];
  });
}

const SUPERFICIES = [
  ...ficheros('components/onboarding'),
  ...ficheros('app/api/onboarding'),
  ...ficheros('lib/llamada').filter((f) => !f.endsWith('.test.ts')),
  ...ficheros('lib/onboarding').filter((f) => !f.endsWith('.test.ts')),
  'app/interno/llamadas/page.tsx',
  'app/api/interno/llamadas/route.ts',
];

test('el onboarding no ofrece ninguna videollamada', () => {
  for (const f of SUPERFICIES) {
    const src = readFileSync(join(raiz, f), 'utf8');
    // Se permite NOMBRARLA en un comentario que explica el cambio, no ofrecerla:
    // por eso se miran solo las líneas que no son comentario.
    const codigo = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.ok(!/videollamada/i.test(codigo), `${f} ofrece una videollamada`);
    assert.ok(!/\b(Video|Videocamera|Camera)\b/.test(codigo.replace(/import[^;]+;/g, '')), `${f} usa un icono de cámara`);
  }
});
