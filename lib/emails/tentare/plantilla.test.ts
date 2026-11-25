import test from 'node:test';
import assert from 'node:assert/strict';
import { correoTentare, cssModoOscuro, TENTARE, TENTARE_OSCURO, COLORES_TENTARE, LOGO_TENTARE_URL } from './plantilla.ts';
import { ratioContraste } from '../../wcag-contrast.ts';

// Lo que se comprueba es el HTML que LLEGA A LA BANDEJA de una propietaria: las
// reglas de compatibilidad de correo no avisan cuando se rompen.

const BASICO = {
  preheader: 'Problema con el cobro de tu plan',
  antetitulo: 'Tu suscripción',
  titular: 'No hemos podido cobrar tu suscripción',
  parrafos: ['Suele pasar por una tarjeta caducada.'],
  agenda: { titulo: 'Qué pasa ahora', filas: [{ cuando: '19 de septiembre', que: 'Stripe lo reintenta.' }] },
  cifras: [{ valor: '312', etiqueta: 'Clases este mes' }, { valor: '14', etiqueta: 'Altas' }],
  destacado: { titulo: 'Ha entrado con este correo', texto: 'marta@example.com' },
  boton: { href: 'https://app.example.com/suscripcion', texto: 'Actualizar la tarjeta' },
  enlace: { href: 'https://app.example.com/exportar', texto: 'Descargar los datos' },
  nota: 'También desde tu panel.',
  motivo: 'Te escribimos porque eres la propietaria.',
};

test('Outlook recibe 620 px fijos y Arial forzado, no Times New Roman', () => {
  const html = correoTentare(BASICO);
  assert.match(html, /<!--\[if mso \| IE\]>/);
  assert.match(html, /<table[^>]*width="620"/);
  assert.match(html, /<o:PixelsPerInch>96<\/o:PixelsPerInch>/);
  // Outlook no baja por la pila si la primera fuente no está instalada: cae a
  // Times New Roman. Esta familia no tiene serif, así que se fuerza Arial.
  const mso = html.match(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/)?.[0] ?? '';
  assert.match(mso, /<style>\* \{ font-family: Arial/);
});

test('un solo botón; el segundo destino va como enlace', () => {
  const html = correoTentare(BASICO);
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1);
  assert.match(html, /Descargar los datos<\/a>/);
});

test('el logo lleva su placa: en claro no se nota y en oscuro se queda blanca (es una imagen para fondo claro)', () => {
  const html = correoTentare(BASICO);
  assert.ok(html.includes(`src="${LOGO_TENTARE_URL}" width="132" height="35" alt="Tentare"`));
  assert.match(LOGO_TENTARE_URL, /^https:\/\/www\./, 'sin www hay proxys de imágenes que no siguen el 308 del ápice');
  assert.match(html, new RegExp(`bgcolor="${TENTARE.placa}"`));
  // La placa NO puede ser el mismo hex que la tarjeta: el modo oscuro cambia por valor y se llevaría la placa por delante.
  assert.notEqual(TENTARE.placa.toUpperCase(), TENTARE.tarjeta.toUpperCase());
  assert.equal(TENTARE_OSCURO.placa, TENTARE.placa, 'la placa no se oscurece');
  // La banda de arriba dice de qué va el correo, y el pie es negro, como en la referencia.
  assert.match(html, new RegExp(`bgcolor="${TENTARE.banda}"[^>]*padding:4px 24px;[^>]*>Tu suscripción<`));
  assert.match(html, new RegExp(`bgcolor="${TENTARE.banda}" style="background:${TENTARE.banda};"`));
});

test('la marca es la de Tentare y no se tiñe con la de ningún estudio', () => {
  const html = correoTentare(BASICO);
  const hex = new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()));
  const kit = new Set(COLORES_TENTARE.map(c => c.toUpperCase()));
  const fuera = [...hex].filter(h => !kit.has(h));
  assert.deepEqual(fuera, [], `colores fuera del kit de Tentare: ${fuera.join(', ')}`);
});

const PARES: [string, keyof typeof TENTARE, keyof typeof TENTARE][] = [
  ['titular sobre la tarjeta', 'texto', 'tarjeta'],
  ['cuerpo sobre la tarjeta', 'cuerpo', 'tarjeta'],
  ['letra pequeña sobre la tarjeta', 'suave', 'tarjeta'],
  ['texto de la banda y del pie', 'sobreBanda', 'banda'],
  ['antetítulo y enlaces sobre la tarjeta', 'realce', 'tarjeta'],
  ['texto del botón sobre el botón', 'botonTexto', 'boton'],
  ['cifras sobre su panel', 'texto', 'panel'],
  ['etiqueta de cifra y destacado sobre su panel', 'cuerpo', 'panel'],
  ['enlace sobre el panel', 'realce', 'panel'],
];

test('todo lo que es texto sobre un fondo se lee (AA), en claro Y en oscuro', () => {
  for (const [modo, kit] of [['claro', TENTARE], ['oscuro', TENTARE_OSCURO]] as const) {
    for (const [que, color, fondo] of PARES) {
      const r = ratioContraste(kit[color], kit[fondo])!;
      assert.ok(r >= 4.5, `${modo} · ${que}: ${r.toFixed(2)}:1`);
    }
    // La regla de alerta es decoración (2 px), no texto: basta que se distinga de la tarjeta (3:1).
    assert.ok(ratioContraste(kit.alerta, kit.tarjeta)! >= 3, `${modo} · la regla de alerta se pierde sobre la tarjeta`);
  }
});

test('dentro de cada propiedad, dos roles no comparten hex (el modo oscuro cambia por valor)', () => {
  const grupos: Record<string, (keyof typeof TENTARE)[]> = {
    fondos: ['fondo', 'tarjeta', 'panel', 'boton', 'alerta', 'regla', 'placa', 'banda'],
    textos: ['texto', 'cuerpo', 'suave', 'realce', 'botonTexto', 'sobreBanda'],
    bordes: ['borde', 'realce'],
  };
  for (const [nombre, roles] of Object.entries(grupos)) {
    const claros = roles.map(r => TENTARE[r].toUpperCase());
    assert.equal(new Set(claros).size, claros.length, `${nombre}: dos roles claros con el mismo hex`);
  }
});

test('⚠️ el modo oscuro solo actúa en modo oscuro: cada selector va dentro de la media query o con el prefijo de Outlook.com', () => {
  const css = cssModoOscuro();
  const fuera = css.replace(/@media \(prefers-color-scheme: dark\) \{[\s\S]*?\n  \}\n/, '');
  // Lo que queda fuera de la media query son las reglas de Outlook.com: TODOS sus selectores llevan data-ogs*.
  for (const regla of fuera.split('}').map(r => r.trim()).filter(Boolean)) {
    for (const sel of regla.split('{')[0].split(',').map(x => x.trim()).filter(Boolean)) {
      assert.match(sel, /^\[data-ogs[bc]\] /, `selector que se aplicaría siempre, también en modo claro: ${sel}`);
    }
  }
  assert.ok(fuera.includes('[data-ogsb] [bgcolor='), 'sin la versión de Outlook.com para los fondos por atributo');
});

test('el modo oscuro: esquema declarado y reglas para cada color claro que lleva el correo', () => {
  const html = correoTentare(BASICO);
  assert.match(html, /name="color-scheme" content="light dark"/);
  assert.match(html, /name="supported-color-schemes" content="light dark"/);
  assert.match(html, /@media \(prefers-color-scheme: dark\)/);
  // Outlook.com y su app no usan la media query.
  assert.match(html, /\[data-ogsb\] \[style\*="background:/);
  assert.match(html, /\[data-ogsc\] \[style\*="color:/);
  const css = cssModoOscuro();
  // Cada color de fondo y de texto que se pinta en claro tiene su pareja oscura.
  for (const r of ['fondo', 'tarjeta', 'panel', 'boton'] as const) {
    assert.ok(css.includes(`background:${TENTARE[r]}"`) && css.includes(`background: ${TENTARE_OSCURO[r]} !important`), `sin regla oscura para el fondo ${r}`);
  }
  for (const r of ['texto', 'cuerpo', 'suave', 'realce', 'botonTexto'] as const) {
    assert.ok(css.includes(`color:${TENTARE[r]}"`) && css.includes(`color: ${TENTARE_OSCURO[r]} !important`), `sin regla oscura para el texto ${r}`);
  }
  // Y lo que el correo pinta en línea es claro: lo que ve quien no sabe de modos.
  assert.match(html, new RegExp(`<body[^>]*bgcolor="${TENTARE.fondo}"`));
  assert.match(html, new RegExp(`bgcolor="${TENTARE.tarjeta}"`));
  assert.match(html, new RegExp(`bgcolor="${TENTARE.boton}"[^>]*mso-padding-alt`));
});

test('preheader oculto con su relleno y peso bajo el recorte de Gmail', () => {
  const html = correoTentare(BASICO);
  assert.match(html, /display:none;font-size:1px[^"]*mso-hide:all/);
  assert.match(html, /(&nbsp;&zwnj;){10,}/);
  assert.ok(Buffer.byteLength(html, 'utf8') < 60_000);
});

test('solo clases para el móvil, y ningún dominio que no le hayamos dado', () => {
  const html = correoTentare(BASICO);
  const clases = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...clases].sort(), ['h1-mobile', 'px-mobile', 'w-full']);
  const hosts = new Set([...html.matchAll(/https?:\/\/([^/"'\s)]+)/g)].map(m => m[1]));
  const descargas = [...hosts].filter(h => !h.includes('schemas.microsoft.com') && !h.includes('www.w3.org'));
  assert.deepEqual(descargas.sort(), ['app.example.com', 'www.tentare.app']);
  assert.ok(!/letterduck/i.test(html));
});

test('lo que viene de fuera se escapa y los destinos raros no se pintan', () => {
  const html = correoTentare({
    ...BASICO,
    titular: '<script>alert(1)</script>',
    destacado: { titulo: 'x', texto: '"><img src=x onerror=alert(1)>' },
    boton: { href: 'javascript:alert(1)', texto: 'Pincha' },
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/href="javascript:/i.test(html));
});

test('sin agenda, cifras ni destacado el correo sigue en pie', () => {
  const html = correoTentare({ preheader: 'p', titular: 'Hola', parrafos: ['Texto.'] });
  assert.match(html, /Hola/);
  assert.ok(!html.includes('mso-padding-alt'));
  // Más de tres cifras no caben en 375 px sin partirse.
  const muchas = correoTentare({ preheader: 'p', titular: 't', cifras: [1, 2, 3, 4].map(n => ({ valor: String(n), etiqueta: 'x' })) });
  assert.equal((muchas.match(/width="33%"/g) ?? []).length, 3);
});
