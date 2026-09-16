import test from 'node:test';
import assert from 'node:assert/strict';
import { marcaCorreoDesde, portadaDeCorreo, urlAppSocia, logoDeCorreo, BASE_IMAGENES_CORREO } from './marca-correo.ts';

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

test('el logo de nuestro Storage viaja reducido y en su formato, nunca en WEBP', () => {
  const url = logoDeCorreo('https://abcd1234.supabase.co/storage/v1/object/public/avatars/logo-studio-x?v=17');
  assert.ok(url!.startsWith('https://abcd1234.supabase.co/storage/v1/render/image/public/avatars/logo-studio-x?'),
    'una foto de móvil de 1 MB no puede ir entera a pintarse a 72 px');
  const q = new URL(url!).searchParams;
  assert.equal(q.get('v'), '17', 'sin la versión, el proxy de Gmail seguiría sirviendo el logo viejo');
  assert.equal(q.get('resize'), 'contain', 'recortar un logo se come letras');
  assert.equal(q.get('format'), 'origin', 'sin esto Supabase sirve WEBP y Outlook no lo pinta');
  assert.equal(q.get('width'), '400');
  assert.equal(q.get('height'), '144');
});

test('un logo de fuera se deja tal cual, y uno vacío no pinta nada', () => {
  assert.equal(logoDeCorreo('https://cdn.example.com/logo.png'), 'https://cdn.example.com/logo.png');
  assert.equal(logoDeCorreo('   '), null);
  assert.equal(logoDeCorreo(null), null);
});
