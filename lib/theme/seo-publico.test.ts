import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metadatosPublicos, tituloAutomatico, descripcionAutomatica,
} from './seo-publico.ts';

const ESTUDIO = { nombre: 'Studio Carmen', ciudad: 'Málaga' };

test('sin nada escrito, el texto es EXACTAMENTE el automático de siempre', () => {
  // Este es el test que protege a los estudios que ya están indexados: al
  // añadir los campos, quien no los toque no puede ver cambiar su resultado
  // en Google.
  const m = metadatosPublicos(ESTUDIO, { seoTitulo: '', seoDescripcion: '', seoImagenUrl: null });
  assert.equal(m.titulo, 'Studio Carmen — Reserva tu clase de Pilates en Málaga');
  assert.equal(m.descripcion, 'Reserva online tu clase de Pilates reformer en Studio Carmen (Málaga). Elige día, hora y tu sitio en segundos.');
  assert.equal(m.imagen, null);
  assert.equal(m.tarjeta, 'summary');
});

test('un tema sin los campos (guardado antes) se comporta igual que vacío', () => {
  assert.deepEqual(metadatosPublicos(ESTUDIO, {}), metadatosPublicos(ESTUDIO, { seoTitulo: '', seoDescripcion: '', seoImagenUrl: null }));
  assert.deepEqual(metadatosPublicos(ESTUDIO, null), metadatosPublicos(ESTUDIO, {}));
  assert.deepEqual(metadatosPublicos(ESTUDIO, undefined), metadatosPublicos(ESTUDIO, {}));
});

test('lo escrito por el estudio gana, campo a campo', () => {
  // Escribir solo el título no puede arrastrar la descripción a vacío: cada
  // campo hereda por su cuenta.
  const m = metadatosPublicos(ESTUDIO, { seoTitulo: 'Pilates reformer en el centro', seoDescripcion: '', seoImagenUrl: null });
  assert.equal(m.titulo, 'Pilates reformer en el centro');
  assert.equal(m.descripcion, descripcionAutomatica(ESTUDIO));
});

test('solo espacios NO es un valor: publicaría un título vacío en Google', () => {
  const m = metadatosPublicos(ESTUDIO, { seoTitulo: '   ', seoDescripcion: '\n\t ', seoImagenUrl: '  ' });
  assert.equal(m.titulo, tituloAutomatico(ESTUDIO));
  assert.equal(m.descripcion, descripcionAutomatica(ESTUDIO));
  assert.equal(m.imagen, null);
});

test('la tarjeta grande solo se pide cuando hay imagen de verdad', () => {
  const con = metadatosPublicos(ESTUDIO, { seoTitulo: '', seoDescripcion: '', seoImagenUrl: 'https://cdn.example/og.jpg' });
  assert.equal(con.imagen, 'https://cdn.example/og.jpg');
  assert.equal(con.tarjeta, 'summary_large_image');
  // Pedir `summary_large_image` sin imagen deja un hueco roto en Twitter/X.
  assert.equal(metadatosPublicos(ESTUDIO, { seoImagenUrl: null }).tarjeta, 'summary');
});

test('un estudio sin ciudad no deja «en » colgando', () => {
  const sinCiudad = { nombre: 'Studio Carmen', ciudad: '' };
  assert.equal(tituloAutomatico(sinCiudad), 'Studio Carmen — Reserva tu clase de Pilates');
  assert.ok(!descripcionAutomatica(sinCiudad).includes('()'));
});
