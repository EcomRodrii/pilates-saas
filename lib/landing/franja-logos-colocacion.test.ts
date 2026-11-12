import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Dónde va la franja de logos de clientes en la home, y que su cableado no se pierda.
//
// Home nueva (nov-2026, el diseño de Figma): la composición vive en app/page.tsx y la franja («Estudios que ya trabajan con Tentare») va
// justo debajo del héroe y antes de las funciones, como en el diseño. Antes iba dentro de la banda oscura del héroe.
const pagina = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
const secciones = readFileSync(join(process.cwd(), 'components/home-nueva/secciones.tsx'), 'utf8');

test('la franja va justo tras el héroe y antes de las funciones', () => {
  const heroe = pagina.indexOf('<Heroe demoHref={demoHref} />');
  const franja = pagina.indexOf('<Confianza logos={logos} />');
  const funciones = pagina.indexOf('<Funciones />');
  assert.ok(heroe > 0 && franja > heroe && funciones > franja, 'orden inesperado');
  const sinComentarios = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
  assert.equal(sinComentarios(pagina.slice(heroe + '<Heroe demoHref={demoHref} />'.length, franja)), '');
});

test('la home lee los logos en servidor, se regenera cada hora y pinta la franja', () => {
  assert.match(pagina, /export const revalidate = 3600;/);
  assert.match(pagina, /await logosClientesLanding\(\)/);
  assert.match(pagina, /<Confianza logos=\{logos\} \/>/);
});

test('la franja no pinta nada con cero logos (ni título ni hueco)', () => {
  assert.match(secciones, /if \(logos\.length === 0\) return null;/);
  const franja = readFileSync(join(process.cwd(), 'components/landing/FranjaLogos.tsx'), 'utf8');
  assert.match(franja, /if \(logos\.length === 0\) return null;/);
});
