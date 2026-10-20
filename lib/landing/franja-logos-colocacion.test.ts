import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Dónde va la franja de logos de clientes en la home, y que su cableado no se pierda.
//
// Home nueva (fase 2.2, 19-oct-2026): la composición vive en app/page.tsx y la
// franja va DENTRO de la banda oscura del héroe, al pie, como en bsport (antes iba
// tras «¿Te suena?»: el vídeo montaba sobre el bloque de debajo del héroe y ya no
// está ahí, pasó a la sección de producto).
const pagina = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');
const heroe = readFileSync(join(process.cwd(), 'components/web/home/Heroe.tsx'), 'utf8');

test('la franja va dentro del héroe, al pie de la banda, y tras el héroe viene «Lo que antes te llevaba la tarde»', () => {
  const llamada = '<Heroe logos={<FranjaLogos logos={logos} />} />';
  const pos = pagina.indexOf(llamada);
  const verbos = pagina.indexOf('<SeOcupaDelResto />');
  assert.ok(pos > 0 && verbos > pos, 'orden inesperado');
  const sinComentarios = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
  assert.equal(sinComentarios(pagina.slice(pos + llamada.length, verbos)), '');
  // Dentro del héroe: después del contenido y antes de cerrar la banda.
  assert.ok(heroe.indexOf('{logos &&') > heroe.indexOf('</Escena>') && heroe.indexOf('{logos &&') < heroe.indexOf('</header>'));
});

test('la home lee los logos en servidor, se regenera cada hora y pinta la franja', () => {
  assert.match(pagina, /export const revalidate = 3600;/);
  assert.match(pagina, /await logosClientesLanding\(\)/);
  assert.match(pagina, /<FranjaLogos logos=\{logos\} \/>/);
  assert.match(heroe, /\.wh-heroe-logos|wh-heroe-logos/);
});

test('la franja no pinta nada con cero logos', () => {
  const franja = readFileSync(join(process.cwd(), 'components/landing/FranjaLogos.tsx'), 'utf8');
  assert.match(franja, /if \(logos\.length === 0\) return null;/);
});
