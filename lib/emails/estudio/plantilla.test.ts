import test from 'node:test';
import assert from 'node:assert/strict';
import { correoEstudio, correoEstudioLibre, escaparHtml, type MarcaCorreo } from './plantilla.ts';
import { ACENTO, paletaCorreoEstudio } from './paleta.ts';
import { ratioContraste } from '../../wcag-contrast.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se comprueba aquí es el HTML que LLEGA A LA BANDEJA, no la forma de
// llamar a la función: son las reglas de compatibilidad de correo, que no se
// ven al mirar el código y que no avisan cuando se rompen — el correo
// sencillamente se ve mal en casa de una clienta y nadie se entera.
// ─────────────────────────────────────────────────────────────────────────────

const MARCA: MarcaCorreo = {
  estudioNombre: 'Casa Pilates',
  logoUrl: 'https://cdn.example.com/logo.png',
  colorPrimario: '#7C9A82',
  colorSecundario: '#B9714A',
  portadaUrl: 'https://cdn.example.com/portada.jpg',
  lema: 'Cuerpo · Mente · Equilibrio',
  direccionPostal: 'Calle Ejemplo 12, 29015 Málaga',
  canales: [{ id: 'web', label: 'casapilates.example', href: 'https://casapilates.example' }],
};

const BASICO = {
  marca: MARCA,
  preheader: 'Tu plaza está confirmada',
  titular: 'Tu plaza está reservada',
  parrafos: ['Hola Ana, ya tienes sitio.'],
  detalle: { titulo: 'Reformer Iniciación', filas: [{ label: 'Fecha', value: 'Lunes 4 de agosto' }] },
  boton: { href: 'https://app.example.com/portal/casa', texto: 'Ver mis clases' },
  nota: 'Cancela con antelación si no puedes venir.',
  conPortada: true,
};

test('Outlook recibe una tabla de 600 px fija, no un max-width que ignora', () => {
  const html = correoEstudio(BASICO);
  assert.match(html, /<!--\[if mso \| IE\]>/, 'falta el condicional de Outlook');
  assert.match(html, /<table[^>]*width="600"/, 'Outlook no tiene ancho fijo: el correo saldrá a toda la ventana');
  assert.match(html, /<!\[endif\]-->/);
  assert.match(html, /max-width:600px/, 'el resto de clientes necesitan el max-width');
  // Escalado de imágenes a 120 ppp en Windows.
  assert.match(html, /<o:PixelsPerInch>96<\/o:PixelsPerInch>/);
});

test('el botón lleva el padding que Outlook entiende, y solo hay uno', () => {
  const html = correoEstudio(BASICO);
  const padding = html.match(/mso-padding-alt/g) ?? [];
  assert.equal(padding.length, 1, 'un correo tiene UNA llamada a la acción, no varias');
  assert.match(html, /border-radius:999px/, 'el botón debería ser una píldora');
});

test('el preheader está, va oculto y no deja que Gmail siga leyendo el cuerpo', () => {
  const html = correoEstudio(BASICO);
  assert.match(html, /Tu plaza está confirmada/);
  assert.match(html, /display:none;font-size:1px[^"]*mso-hide:all/);
  assert.match(html, /(&nbsp;&zwnj;){10,}/, 'sin relleno, Gmail enseña el principio del correo detrás del asunto');
});

test('todo el estilo va en línea: las clases solo sirven para el móvil', () => {
  const html = correoEstudio(BASICO);
  const clases = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...clases].sort(), ['px-mobile', 'w-full'],
    'una clase nueva en el HTML es estilo que Gmail descarta al reenviar el correo');
  for (const clase of clases) {
    assert.ok(html.includes(`.${clase} {`), `.${clase} se usa pero no está en la media query`);
  }
});

test('ninguna imagen sin alt, y ninguna en WEBP', () => {
  const html = correoEstudio(BASICO);
  const imgs = html.match(/<img[^>]*>/g) ?? [];
  assert.ok(imgs.length >= 2, 'se esperaban el logo y la portada');
  for (const img of imgs) {
    assert.match(img, /alt="[^"]+"/, `imagen sin texto alternativo: ${img}`);
    assert.match(img, /width="\d+"|height="\d+"/, `imagen sin medida para Outlook: ${img}`);
  }
  assert.ok(!/\.webp/i.test(html), 'Outlook de Windows no pinta WEBP');
});

test('no viaja ningún dominio que no le hayamos dado', () => {
  const html = correoEstudio(BASICO);
  const hosts = new Set([...html.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map(m => m[1]));
  // Los xmlns de Office son namespaces, no descargas.
  const descargas = [...hosts].filter(h => !h.includes('schemas.microsoft.com') && !h.includes('www.w3.org'));
  assert.deepEqual(descargas.sort(), ['app.example.com', 'casapilates.example', 'cdn.example.com'].sort());
  assert.ok(!/letterduck/i.test(html), 'restos de la plantilla de referencia');
});

test('el correo se tiñe con el color del estudio, no con uno de fábrica', () => {
  const html = correoEstudio(BASICO);
  assert.ok(html.includes('#7C9A82'), 'el color principal no aparece por ninguna parte');
  assert.ok(html.includes('#B9714A'), 'el secundario debería pintar el botón');
  // El correo de OTRO estudio no puede salir igual.
  const otro = correoEstudio({ ...BASICO, marca: { ...MARCA, colorPrimario: '#C2185B', colorSecundario: null } });
  assert.notEqual(otro, html);
  assert.ok(!otro.includes('#7C9A82'));
});

test('cabe de sobra por debajo del recorte de Gmail', () => {
  // Gmail corta el correo por encima de ~102 KB y enseña «[Mensaje recortado]».
  const bytes = Buffer.byteLength(correoEstudio(BASICO), 'utf8');
  assert.ok(bytes < 60_000, `el correo pesa ${bytes} bytes, demasiado cerca del recorte`);
});

test('declara modo claro para que el cliente de correo no invierta los colores', () => {
  const html = correoEstudio(BASICO);
  assert.match(html, /name="color-scheme" content="light"/);
  assert.match(html, /name="supported-color-schemes" content="light"/);
});

test('lo que escribe el estudio se escapa: ni etiquetas ni enlaces ejecutables', () => {
  const html = correoEstudio({
    ...BASICO,
    marca: { ...MARCA, estudioNombre: '<script>alert(1)</script>', lema: '"><img src=x onerror=alert(1)>' },
    titular: 'Hola & adiós <b>',
    boton: { href: 'javascript:alert(1)', texto: 'Pincha' },
  });
  assert.ok(!html.includes('<script>'), 'HTML crudo del estudio dentro del correo');
  // El payload tiene que seguir ahí, pero como TEXTO: borrarlo en silencio haría
  // pensar a la propietaria que se ha perdido lo que escribió.
  assert.ok(!html.includes('<img src=x'), 'etiqueta colada por el lema');
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'el lema debería verse escapado, no desaparecer');
  assert.ok(!/href="javascript:/i.test(html), 'enlace ejecutable en el botón');
  assert.match(html, /href="#"/, 'un href rechazado debe quedarse en #');
  assert.ok(html.includes('Hola &amp; adiós'));
});

test('sin portada, sin lema y sin canales el correo sigue en pie', () => {
  const html = correoEstudio({
    marca: { estudioNombre: 'Estudio Nuevo' },
    preheader: 'Hola', titular: 'Hola', parrafos: ['Texto.'],
  });
  assert.ok(!html.includes('<img'), 'sin logo ni portada no debería haber ninguna imagen');
  assert.match(html, /ESTUDIO NUEVO|Estudio Nuevo/);
  // Sin dirección, el pie no deja una coma suelta ni un separador huérfano.
  assert.ok(!/&middot;\s*<\/td>/.test(html));
});

test('el enlace de baja solo aparece si el correo es comercial', () => {
  assert.ok(!correoEstudio(BASICO).includes('Darte de baja'),
    'una confirmación de reserva no se puede «dar de baja»: ofrecerlo sería mentir');
  const comercial = correoEstudio({ ...BASICO, bajaUrl: 'https://app.example.com/api/marketing/baja?token=abc' });
  assert.match(comercial, /Darte de baja de estos avisos/);
});

test('con cuerpo libre manda la propietaria, pero la marca sigue siendo del sistema', () => {
  const html = correoEstudioLibre({
    ...BASICO,
    titular: '',
    cuerpo: '# Mi propio título\n\nTexto **mío** con [enlace](https://casapilates.example).\n\n{datos}\n\n{boton}',
  });
  assert.match(html, /Mi propio título/);
  assert.match(html, /<b>mío<\/b>|<strong>mío<\/strong>/);
  assert.match(html, /Lunes 4 de agosto/, '{datos} debería haber pintado la tarjeta');
  assert.match(html, /Ver mis clases/, '{boton} debería haber pintado el botón');
  assert.ok(html.includes('#7C9A82'), 'el cuerpo libre perdió el color del estudio');
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1);
  // Su Markdown pasa por el mismo saneado de siempre.
  const sucio = correoEstudioLibre({ ...BASICO, titular: '', cuerpo: '<script>alert(1)</script>\n\n[x](javascript:alert(1))' });
  assert.ok(!sucio.includes('<script>'));
  assert.ok(!/href="javascript:/i.test(sucio));
});

test('sin {boton} ni {datos} en el cuerpo, no se cuelan por su cuenta', () => {
  const html = correoEstudioLibre({ ...BASICO, titular: '', cuerpo: 'Solo texto, sin tokens.' });
  assert.ok(!html.includes('Lunes 4 de agosto'));
  assert.ok(!html.includes('mso-padding-alt'));
});

test('una imagen con destino raro no se pinta, en vez de quedarse rota', () => {
  const html = correoEstudio({
    ...BASICO,
    marca: { ...MARCA, logoUrl: 'javascript:alert(1)', portadaUrl: 'data:image/png;base64,AAAA' },
  });
  assert.ok(!html.includes('<img'), 'ni el logo ni la portada deberían pintarse');
  // Y el correo sigue diciendo de quién es.
  assert.ok(html.includes('Casa Pilates'));
});

test('escaparHtml es lo que impide que un nombre con comillas rompa un atributo', () => {
  assert.equal(escaparHtml('a"b<c>d&e'), 'a&quot;b&lt;c&gt;d&amp;e');
});

test('el dato destacado se ve más grande y del color del acento', () => {
  const html = correoEstudio({
    ...BASICO,
    acento: '#065F46',
    detalle: { filas: [
      { label: 'Concepto', value: 'Cuota de agosto' },
      { label: 'Importe', value: '45,00 €', destacado: true },
    ] },
  });
  assert.match(html, /font-size:20px;font-weight:bold;[^"]*color:#065F46[^"]*">45,00/);
  // Y lo que no está destacado sigue como siempre.
  assert.match(html, /font-size:13\.5px;font-weight:normal;[^"]*">Cuota de agosto/);
});

test('el dato destacado se lee sobre el arena de cualquier estudio', () => {
  // El acento se eligió como FILETE de 5 px, donde el contraste no importa. En
  // cuanto pinta texto sí importa, y medido: el ámbar del primer aviso de
  // impago se queda en 4,2:1 sobre el arena de un estudio rosa.
  for (const color of ['#F7A6C4', '#FFE066', '#343825', '#C2185B', '#7C9A82']) {
    const { arena } = paletaCorreoEstudio(color);
    for (const [nombre, acento] of Object.entries(ACENTO)) {
      const html = correoEstudio({
        ...BASICO,
        marca: { ...MARCA, colorPrimario: color },
        acento,
        detalle: { filas: [{ label: 'Importe', value: '45,00 €', destacado: true }] },
      });
      const usado = html.match(/font-size:20px;font-weight:bold;[^"]*color:(#[0-9A-Fa-f]{6})/)?.[1];
      assert.ok(usado, `no se encontró el color del dato destacado (${nombre}/${color})`);
      assert.ok(ratioContraste(usado, arena)! >= 4.5, `el acento «${nombre}» no se lee sobre el arena de ${color}`);
    }
  }
});
