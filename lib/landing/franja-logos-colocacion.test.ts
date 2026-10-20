import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Dónde va la franja de logos de clientes en la home, y que su cableado no se pierda.
// El vídeo va justo debajo del héroe y monta sobre el bloque oscuro de «¿Te suena?»
// (decisión del fundador, 23-sep): la franja NO se mete entre medias.
const landing = readFileSync(join(process.cwd(), 'components/landing/LandingCliente.tsx'), 'utf8');
const pagina = readFileSync(join(process.cwd(), 'app/page.tsx'), 'utf8');

test('héroe → vídeo → «¿Te suena?» siguen pegados, y la franja va justo detrás de «¿Te suena?»', () => {
  const hero = landing.indexOf('<SeccionHero />');
  const video = landing.indexOf('<VideoProducto />');
  const suena = landing.indexOf('<SeccionTeSuena />');
  const logos = landing.indexOf('{logos}');
  const verbos = landing.indexOf('{verbos}');
  assert.ok(hero > 0 && video > hero && suena > video && logos > suena && verbos > logos, 'orden inesperado');

  // Entre el héroe y el vídeo, y entre el vídeo y «¿Te suena?», solo comentarios y espacio: ningún componente ni hueco.
  const sinComentarios = (t: string) => t.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
  assert.equal(sinComentarios(landing.slice(hero + '<SeccionHero />'.length, video)), '');
  assert.equal(sinComentarios(landing.slice(video + '<VideoProducto />'.length, suena)), '');
  // Y entre «¿Te suena?» y la franja, nada más.
  assert.equal(sinComentarios(landing.slice(suena + '<SeccionTeSuena />'.length, logos)), '');
});

test('la home lee los logos en servidor, se regenera cada hora y pasa la franja como hueco', () => {
  assert.match(pagina, /export const revalidate = 3600;/);
  assert.match(pagina, /await logosClientesLanding\(\)/);
  assert.match(pagina, /logos=\{<FranjaLogos logos=\{logos\} \/>\}/);
});

test('la franja no pinta nada con cero logos', () => {
  const franja = readFileSync(join(process.cwd(), 'components/landing/FranjaLogos.tsx'), 'utf8');
  assert.match(franja, /if \(logos\.length === 0\) return null;/);
});
