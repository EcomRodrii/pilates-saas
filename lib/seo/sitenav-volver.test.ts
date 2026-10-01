import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// El botón «volver» de la barra de las páginas públicas (components/recursos/
// SiteNav.tsx) no puede llevar a la misma página en la que está: en /recursos
// apuntaba a /recursos y, al pulsarlo, no pasaba nada (1-oct-2026, lo vio el
// fundador). Se recorren las page.tsx de app/ con `<SiteNav backHref="…">` fijo
// y se compara con la ruta de la propia página.
const RAIZ = join(import.meta.dirname, '..', '..');
const APP = join(RAIZ, 'app');

function paginas(dir: string, salida: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) paginas(p, salida);
    else if (n === 'page.tsx') salida.push(p);
  }
  return salida;
}

test('ningún botón de volver de la barra pública lleva a su propia página', () => {
  const mal: string[] = [];
  for (const f of paginas(APP)) {
    const m = readFileSync(f, 'utf8').match(/<SiteNav[^>]*backHref="([^"]+)"/);
    if (!m) continue;
    const segs = relative(APP, f).split(sep).slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
    const ruta = `/${segs.join('/')}`.replace(/\/$/, '') || '/';
    if (m[1] === ruta) mal.push(`${ruta} → ${m[1]}`);
  }
  assert.deepEqual(mal, []);
});
