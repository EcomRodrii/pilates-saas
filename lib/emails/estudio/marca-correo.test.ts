import test from 'node:test';
import assert from 'node:assert/strict';
import { marcaCorreoDesde, portadaDeCorreo, urlAppSocia, BASE_IMAGENES_CORREO } from './marca-correo.ts';

test('la portada por defecto es un JPG servido desde el host con www', () => {
  const url = portadaDeCorreo(null);
  assert.ok(url.startsWith('https://'), 'una imagen de correo tiene que ser absoluta');
  assert.match(url, /^https:\/\/www\./,
    'sin www el ápice devuelve un 308 y hay proxys de imágenes de correo que no lo siguen');
  assert.match(url, /\.jpg$/, 'Outlook de Windows no pinta WEBP');
  assert.equal(url, `${BASE_IMAGENES_CORREO}/por-defecto/estudio-hero-correo.jpg`);
});

test('si el estudio subió la suya, es la suya', () => {
  assert.equal(portadaDeCorreo('https://cdn.example.com/mi-estudio.jpg'), 'https://cdn.example.com/mi-estudio.jpg');
  // Una cadena vacía o de espacios no es una foto.
  assert.equal(portadaDeCorreo('   '), portadaDeCorreo(null));
});

test('marcaCorreoDesde no deja el correo sin nombre de estudio', () => {
  assert.equal(marcaCorreoDesde({}, 'Tu estudio').estudioNombre, 'Tu estudio');
  assert.equal(marcaCorreoDesde({ nombre: 'Casa Pilates' }, 'Tu estudio').estudioNombre, 'Casa Pilates');
  // `estudioNombre` es la clave que rellena `marcaDesdeFila` y gana a `nombre`.
  assert.equal(
    marcaCorreoDesde({ nombre: 'Casa Pilates', estudioNombre: 'Casa Pilates Centro' }, 'Tu estudio').estudioNombre,
    'Casa Pilates Centro',
  );
});

test('marcaCorreoDesde arrastra los cuatro campos de marca que antes no miraba ningún correo', () => {
  const m = marcaCorreoDesde({
    nombre: 'Casa Pilates', colorPrimario: '#7C9A82', colorSecundario: '#B9714A',
    lema: 'Cuerpo · Mente', direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
    portadaUrl: 'https://cdn.example.com/p.jpg',
    canales: [{ id: 'web', label: 'web', href: 'https://casapilates.example' }],
  }, 'Tu estudio');
  assert.equal(m.colorSecundario, '#B9714A');
  assert.equal(m.lema, 'Cuerpo · Mente');
  assert.equal(m.direccionPostal, 'Calle Ejemplo 12, 29015 Málaga');
  assert.equal(m.portadaUrl, 'https://cdn.example.com/p.jpg');
  assert.equal(m.canales?.length, 1);
});

test('sin slug no hay enlace a la app: mejor sin botón que con uno a ninguna parte', () => {
  assert.equal(urlAppSocia(null), null);
  assert.equal(urlAppSocia('  '), null);
  assert.match(urlAppSocia('casa-pilates')!, /\/portal\/casa-pilates$/);
});
