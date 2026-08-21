import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANALES, CANALES_IDS, REDES_SOCIALES_IDS,
  canalesDelEstudio, hrefCanal, redesSocialesCompletas,
} from './canales-estudio.ts';

test('el catálogo cubre todos los ids, y la web va primero', () => {
  assert.deepEqual([...CANALES_IDS], ['web', 'instagram', 'facebook', 'tiktok', 'whatsapp']);
  for (const id of CANALES_IDS) assert.ok(CANALES[id].label && CANALES[id].placeholder);
  assert.ok(!(REDES_SOCIALES_IDS as readonly string[]).includes('web'));
});

test('una URL completa pasa tal cual', () => {
  assert.equal(hrefCanal('instagram', 'https://instagram.com/estudio-alma'), 'https://instagram.com/estudio-alma');
  assert.equal(hrefCanal('web', 'http://tuestudio.com/reservas'), 'http://tuestudio.com/reservas');
});

// El bug real que cierra este módulo: el campo guardaba «@miestudio» sin
// rechazarlo, el estudio veía «guardado», y `resolverHrefBloque()` lo resolvía
// a null — el pie de su página pública salía vacío, sin error y sin aviso.
test('un @handle se convierte en enlace en vez de desaparecer en silencio', () => {
  assert.equal(hrefCanal('instagram', '@miestudio'), 'https://instagram.com/miestudio');
  assert.equal(hrefCanal('instagram', 'miestudio'), 'https://instagram.com/miestudio');
  assert.equal(hrefCanal('tiktok', '@mi.estudio'), 'https://www.tiktok.com/@mi.estudio');
  assert.equal(hrefCanal('facebook', 'MiEstudio'), 'https://facebook.com/MiEstudio');
});

test('un teléfono suelto vale como WhatsApp', () => {
  assert.equal(hrefCanal('whatsapp', '+34 600 00 00 00'), 'https://wa.me/34600000000');
  assert.equal(hrefCanal('whatsapp', '600-00-00-00'), 'https://wa.me/600000000');
  assert.equal(hrefCanal('whatsapp', 'llámame'), null);
});

test('un dominio a secas vale como web', () => {
  assert.equal(hrefCanal('web', 'tuestudio.com'), 'https://tuestudio.com');
  assert.equal(hrefCanal('web', 'www.tuestudio.com/horario'), 'https://www.tuestudio.com/horario');
  // Sin punto no es un dominio: no se inventa una URL.
  assert.equal(hrefCanal('web', 'tuestudio'), null);
});

// Mismo criterio que resolverHrefBloque(): el dato lo teclea el estudio y se
// pinta como href, así que solo http/https.
test('nada de javascript: ni data:, ni por la puerta del handle', () => {
  for (const id of CANALES_IDS) {
    assert.equal(hrefCanal(id, 'javascript:alert(1)'), null);
    assert.equal(hrefCanal(id, 'data:text/html,<script>'), null);
  }
  // Un "handle" con barra no puede colarse a otro dominio.
  assert.equal(hrefCanal('instagram', '@evil.com/x'), null);
  assert.equal(hrefCanal('tiktok', 'a?b#c'), null);
});

test('vacío, nulo o solo espacios no es un canal', () => {
  for (const id of CANALES_IDS) {
    assert.equal(hrefCanal(id, ''), null);
    assert.equal(hrefCanal(id, '   '), null);
    assert.equal(hrefCanal(id, null), null);
    assert.equal(hrefCanal(id, undefined), null);
  }
});

test('canalesDelEstudio reúne columna y tema, y solo devuelve los rellenos', () => {
  const canales = canalesDelEstudio({
    sitioWeb: 'tuestudio.com',
    redesSociales: { instagram: '@miestudio', facebook: '', tiktok: '', whatsapp: '600000000' },
  });
  assert.deepEqual(canales.map((c) => c.id), ['web', 'instagram', 'whatsapp']);
  assert.equal(canales[0].href, 'https://tuestudio.com');
  assert.equal(canales[1].label, 'Instagram');
});

test('un estudio sin nada configurado no devuelve ningún canal', () => {
  assert.deepEqual(canalesDelEstudio({}), []);
  assert.deepEqual(canalesDelEstudio({ sitioWeb: null, redesSociales: null }), []);
});

// Compatibilidad: un tema guardado antes de que TikTok existiera trae solo tres
// claves. No puede romper ni un formulario controlado ni el pie.
test('un redesSociales de tres claves (tema antiguo) se completa sin perder nada', () => {
  const completas = redesSocialesCompletas({ instagram: '@x', facebook: '', whatsapp: '' });
  assert.deepEqual(completas, { instagram: '@x', facebook: '', tiktok: '', whatsapp: '' });
  assert.deepEqual(redesSocialesCompletas(undefined), { instagram: '', facebook: '', tiktok: '', whatsapp: '' });
  // Basura guardada tampoco rompe: cada clave cae a cadena vacía.
  assert.deepEqual(
    redesSocialesCompletas({ instagram: 42 as unknown as string }),
    { instagram: '', facebook: '', tiktok: '', whatsapp: '' },
  );
});
