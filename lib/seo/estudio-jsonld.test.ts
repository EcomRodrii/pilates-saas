import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estudioJsonLd } from './estudio-jsonld.ts';

const COMPLETO = {
  nombre: 'Estudio Aurora',
  url: 'https://www.tentare.app/reservar/estudio-aurora',
  direccion: 'Calle Larios 1',
  ciudad: 'Marbella',
  codigoPostal: '29601',
  telefono: '+34 600 111 222',
  email: 'hola@aurora.es',
  descripcion: 'Estudio de Pilates con máquinas.',
  imagenUrl: 'https://cdn/foto.jpg',
};

test('un estudio con todos sus datos sale completo y bien tipado', () => {
  const ld = estudioJsonLd(COMPLETO)!;
  assert.equal(ld['@context'], 'https://schema.org');
  // Subtipo específico de LocalBusiness: Google pide el más concreto que aplique.
  assert.equal(ld['@type'], 'SportsActivityLocation');
  assert.equal(ld.name, 'Estudio Aurora');
  assert.equal(ld.url, COMPLETO.url);
  assert.deepEqual(ld.address, {
    '@type': 'PostalAddress',
    streetAddress: 'Calle Larios 1',
    addressLocality: 'Marbella',
    postalCode: '29601',
  });
  assert.equal(ld.telephone, '+34 600 111 222');
});

// ── La regla dura: nada inventado ────────────────────────────────────────────

test('NUNCA se emiten los campos que no tenemos', () => {
  // Cada uno de estos quedaría bien y sería falso. `addressCountry` no está en
  // la tabla; el horario que hay es de CLASES, no del local; la nota no está
  // visible en la página (marcarla es motivo de acción manual de Google); y el
  // precio de un bono no es el precio de una clase.
  const ld = estudioJsonLd(COMPLETO)!;
  const plano = JSON.stringify(ld);
  for (const prohibido of ['addressCountry', 'openingHours', 'aggregateRating', 'priceRange', 'review']) {
    assert.ok(!plano.includes(prohibido), `se coló un campo inventado: ${prohibido}`);
  }
});

test('los campos ausentes se omiten, no salen vacíos ni null', () => {
  const ld = estudioJsonLd({ nombre: 'Casa Pilates', url: 'https://x/y' })!;
  for (const clave of ['address', 'telephone', 'email', 'description', 'image']) {
    assert.ok(!(clave in ld), `${clave} debería estar ausente`);
  }
  // Y un JSON-LD con claves a null es peor que sin ellas: Google lo lee como
  // dato declarado y vacío.
  assert.ok(!JSON.stringify(ld).includes('null'));
});

test('una cadena en blanco vale lo mismo que no tener el dato', () => {
  const ld = estudioJsonLd({ ...COMPLETO, telefono: '   ', email: '', descripcion: '\n' })!;
  assert.ok(!('telephone' in ld));
  assert.ok(!('email' in ld));
  assert.ok(!('description' in ld));
});

test('sin calle pero con ciudad, la dirección sigue sirviendo', () => {
  const ld = estudioJsonLd({ ...COMPLETO, direccion: null })!;
  assert.deepEqual(ld.address, {
    '@type': 'PostalAddress', addressLocality: 'Marbella', postalCode: '29601',
  });
});

test('sin calle NI ciudad no se emite una dirección vacía', () => {
  const ld = estudioJsonLd({ ...COMPLETO, direccion: null, ciudad: null })!;
  assert.ok(!('address' in ld), 'un PostalAddress con solo el código postal no ubica nada');
});

test('sin nombre o sin URL no se emite nada', () => {
  assert.equal(estudioJsonLd({ ...COMPLETO, nombre: '  ' }), null);
  assert.equal(estudioJsonLd({ ...COMPLETO, url: '' }), null);
});

test('el resultado es serializable sin sorpresas', () => {
  // Se inyecta en un <script>, así que tiene que sobrevivir a JSON.stringify
  // sin undefined intermedios ni referencias cíclicas.
  const ld = estudioJsonLd(COMPLETO)!;
  assert.deepEqual(JSON.parse(JSON.stringify(ld)), ld);
});
