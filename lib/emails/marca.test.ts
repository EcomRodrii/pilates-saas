import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcaDesdeFila } from './marca.ts';

// Las plantillas de correo declaran `estudioNombre = 'Tentare'` como default.
// Ese default existe para los correos de plataforma (fallo de pago del SaaS),
// NO para los que manda un estudio a su clienta. El bug real: la marca traía
// `nombre` y las plantillas leen `estudioNombre`, así que todo correo salía
// encabezado "TENTARE" con el remitente correcto. Este es el contrato que lo
// impide; si alguien renombra la clave, aquí se cae.
const PROP_QUE_LEEN_LAS_PLANTILLAS = 'estudioNombre';

test('marcaDesdeFila expone el nombre con la clave que leen las plantillas', () => {
  const marca = marcaDesdeFila({ nombre: 'Studio Pilates Barcelona' });
  assert.equal(marca[PROP_QUE_LEEN_LAS_PLANTILLAS], 'Studio Pilates Barcelona');
  // Y sigue exponiendo `nombre`, que es lo que consume el remitente.
  assert.equal(marca.nombre, 'Studio Pilates Barcelona');
});

test('el nombre del estudio gana al hacer spread sobre los datos del email', () => {
  // Reproduce el merge real de /api/emails/send y de send-server.ts. Antes del
  // arreglo, `datos` sin `estudioNombre` dejaba la prop sin poner.
  const datos: { claseNombre: string; estudioNombre?: string } = { claseNombre: 'Reformer' };
  const props = { ...datos, ...marcaDesdeFila({ nombre: 'Studio Pilates Barcelona' }) };
  assert.equal(props.estudioNombre, 'Studio Pilates Barcelona');
  assert.notEqual(props.estudioNombre, 'Tentare');
});

test('sin nombre en la fila NO se pisa el que traiga el caller', () => {
  // Una clave presente con `undefined` pisa igualmente en un spread: por eso
  // `estudioNombre` se omite en vez de ponerse a undefined.
  const marca = marcaDesdeFila({ nombre: null });
  assert.ok(!(PROP_QUE_LEEN_LAS_PLANTILLAS in marca));
  const props = { estudioNombre: 'Studio Pilates Barcelona', ...marca };
  assert.equal(props.estudioNombre, 'Studio Pilates Barcelona');
});

test('logo, color y slug se mapean a las claves de la plantilla', () => {
  const marca = marcaDesdeFila({
    nombre: 'Casa Pilates', color_primario: '#343825',
    logo_url: 'https://cdn/logo.png', slug: 'casa-pilates',
  });
  assert.equal(marca.colorPrimario, '#343825');
  assert.equal(marca.logoUrl, 'https://cdn/logo.png');
  assert.equal(marca.slug, 'casa-pilates');
});

test('una fila vacía no inventa valores', () => {
  const marca = marcaDesdeFila({});
  assert.equal(marca.nombre, null);
  assert.equal(marca.logoUrl, null);
  assert.equal(marca.colorPrimario, undefined);
});

test('el email del estudio se expone como Reply-To', () => {
  // Ninguno de los correos a clientas ponía Reply-To: una socia que contestaba
  // a "Reserva confirmada" —con el nombre de su estudio como remitente— le
  // escribía al buzón compartido de la plataforma, y su estudio no lo veía.
  const marca = marcaDesdeFila({ nombre: 'Casa Pilates', email: 'hola@casapilates.es' });
  assert.equal(marca.replyTo, 'hola@casapilates.es');
});

test('sin email de estudio no se pone Reply-To (clave omitida, no undefined)', () => {
  assert.ok(!('replyTo' in marcaDesdeFila({ nombre: 'Casa Pilates', email: null })));
  // Un campo en blanco vale lo mismo que un campo sin rellenar.
  assert.ok(!('replyTo' in marcaDesdeFila({ nombre: 'Casa Pilates', email: '   ' })));
});

// Los canales del estudio llegan al correo desde DOS sitios: la columna
// `studios.sitio_web` y el `redesSociales` del tema publicado. Esta función es
// la única costura donde se juntan; si alguien pide solo la fila, el pie del
// correo se queda sin las redes y nada falla.
test('marcaDesdeFila reúne la web de la fila y las redes del tema', () => {
  const marca = marcaDesdeFila(
    { nombre: 'Casa Pilates', sitio_web: 'casapilates.es' },
    { instagram: '@casapilates', tiktok: '', facebook: '', whatsapp: '' },
  );
  assert.deepEqual(marca.canales?.map((c) => c.id), ['web', 'instagram']);
  assert.equal(marca.canales?.[0].href, 'https://casapilates.es');
});

test('sin ningún canal la clave se omite (no un array vacío)', () => {
  assert.ok(!('canales' in marcaDesdeFila({ nombre: 'Casa Pilates' })));
  assert.ok(!('canales' in marcaDesdeFila({ nombre: 'Casa Pilates', sitio_web: '  ' }, {})));
});

test('la dirección del pie se compone sin comas ni huecos sueltos', () => {
  // Las tres columnas pueden faltar por separado. Con un join ingenuo, un
  // estudio con ciudad pero sin calle acababa con una coma delante en el pie de
  // TODOS sus correos.
  assert.equal(
    marcaDesdeFila({ direccion: 'Calle Ejemplo 12', codigo_postal: '29015', ciudad: 'Málaga' }).direccionPostal,
    'Calle Ejemplo 12, 29015 Málaga',
  );
  assert.equal(marcaDesdeFila({ ciudad: 'Málaga' }).direccionPostal, 'Málaga');
  assert.equal(marcaDesdeFila({ direccion: 'Calle Ejemplo 12' }).direccionPostal, 'Calle Ejemplo 12');
  assert.equal(marcaDesdeFila({ direccion: '  ', ciudad: '' }).direccionPostal, null);
  assert.equal(marcaDesdeFila({}).direccionPostal, null);
});

test('portada, lema y color secundario llegan a la marca del correo', () => {
  // Los tres los pinta la plantilla del estudio y ninguno existía antes aquí:
  // si alguien los quita del `.select` de resolverMarcaEstudio llegan vacíos y
  // en silencio, que es como se quedó el héroe del portal sin foto en su día.
  const marca = marcaDesdeFila(
    { nombre: 'Casa Pilates', imagen_bienvenida_url: 'https://cdn.example.com/p.jpg', lema: 'Cuerpo · Mente' },
    null,
    '#B9714A',
  );
  assert.equal(marca.portadaUrl, 'https://cdn.example.com/p.jpg');
  assert.equal(marca.lema, 'Cuerpo · Mente');
  assert.equal(marca.colorSecundario, '#B9714A');
});

test('sin tema publicado el correo no se queda sin botón', () => {
  // El secundario vive en `studio_theme`, que puede no existir o no leerse.
  assert.equal(marcaDesdeFila({ nombre: 'Casa Pilates' }).colorSecundario, null);
});
