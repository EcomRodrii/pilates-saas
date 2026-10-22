import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tarjetasDelPortal } from './metadatos-portal.ts';

const BASE = 'https://proyecto.supabase.co';
const nuestra = (f: string) => `${BASE}/storage/v1/object/public/logos/${f}`;
const DESC = 'Reserva tu clase en Estudio Prueba.';

test('la tarjeta del enlace de la app es del ESTUDIO: título y sitio con su nombre', () => {
  const t = tarjetasDelPortal({ nombre: 'Estudio Prueba', portadaUrl: null, logoUrl: null }, DESC, BASE);
  assert.equal(t.openGraph.title, 'Estudio Prueba');
  assert.equal(t.openGraph.siteName, 'Estudio Prueba');
  assert.equal(t.openGraph.description, DESC);
  assert.equal(t.twitter.title, 'Estudio Prueba');
  assert.equal(t.twitter.description, DESC);
  for (const v of [t.openGraph.title, t.openGraph.siteName, t.openGraph.description, t.twitter.title]) {
    assert.doesNotMatch(v, /Tentare/);
  }
});

test('imagen: su portada › su logo › ninguna (nunca la de serie ni una externa)', () => {
  const conPortada = tarjetasDelPortal({ nombre: 'E', portadaUrl: nuestra('p.jpg'), logoUrl: nuestra('l.png') }, DESC, BASE);
  assert.deepEqual(conPortada.openGraph.images, [nuestra('p.jpg')]);
  assert.equal(conPortada.twitter.card, 'summary_large_image');

  const soloLogo = tarjetasDelPortal({ nombre: 'E', portadaUrl: null, logoUrl: nuestra('l.png') }, DESC, BASE);
  assert.deepEqual(soloLogo.openGraph.images, [nuestra('l.png')]);
  assert.equal(soloLogo.twitter.card, 'summary');

  const externa = tarjetasDelPortal({ nombre: 'E', portadaUrl: 'https://otra.invalid/p.jpg', logoUrl: 'https://otra.invalid/l.png' }, DESC, BASE);
  assert.equal(externa.openGraph.images, undefined);
  assert.equal(externa.twitter.images, undefined);

  const deSerie = tarjetasDelPortal({ nombre: 'E', portadaUrl: '/imagenes/portada-1.webp', logoUrl: null }, DESC, BASE);
  assert.equal(deSerie.openGraph.images, undefined);
});

test('el layout de /portal declara openGraph y twitter propios (si no, hereda los de Tentare B2B)', () => {
  const src = readFileSync(new URL('../../app/portal/[slug]/layout.tsx', import.meta.url), 'utf8');
  const meta = src.slice(src.indexOf('export async function generateMetadata'), src.indexOf('export default'));
  assert.match(meta, /tarjetasDelPortal\(/);
  assert.match(meta, /\n\s+openGraph,\n\s+twitter,/);
});
