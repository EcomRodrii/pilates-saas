import test from 'node:test';
import assert from 'node:assert/strict';
import { correoTentare, TENTARE, LOGO_TENTARE_URL } from './plantilla.ts';
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

test('Outlook recibe 600 px fijos y Arial forzado, no Times New Roman', () => {
  const html = correoTentare(BASICO);
  assert.match(html, /<!--\[if mso \| IE\]>/);
  assert.match(html, /<table[^>]*width="600"/);
  assert.match(html, /<o:PixelsPerInch>96<\/o:PixelsPerInch>/);
  // Outlook no baja por la pila si la primera fuente no está instalada: cae a
  // Times New Roman. Esta familia no tiene serif, así que se fuerza Arial.
  assert.match(html, /<!--\[if mso\]>\s*<style>\* \{ font-family: Arial/);
});

test('un solo botón; el segundo destino va como enlace', () => {
  const html = correoTentare(BASICO);
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1);
  assert.match(html, /Descargar los datos<\/a>/);
});

test('la cabecera es la misma que la de los correos de acceso de Supabase', () => {
  // Una propietaria recibe los dos tipos: tienen que reconocerse como del
  // mismo remitente.
  const html = correoTentare(BASICO);
  assert.ok(html.includes(`src="${LOGO_TENTARE_URL}" width="132" height="35" alt="Tentare"`));
  assert.match(LOGO_TENTARE_URL, /^https:\/\/www\./, 'sin www hay proxys de imágenes que no siguen el 308 del ápice');
  assert.ok(html.includes(TENTARE.dorado), 'falta la regla dorada de la marca');
});

test('la marca es la de Tentare y no se tiñe con la de ningún estudio', () => {
  const html = correoTentare(BASICO);
  const hex = new Set([...html.matchAll(/#[0-9A-Fa-f]{6}\b/g)].map(m => m[0].toUpperCase()));
  const kit = new Set(Object.values(TENTARE).map(c => c.toUpperCase()));
  const fuera = [...hex].filter(h => !kit.has(h));
  assert.deepEqual(fuera, [], `colores fuera del kit de Tentare: ${fuera.join(', ')}`);
});

test('todo lo que es texto sobre un fondo se lee (AA)', () => {
  const t = TENTARE;
  const pares: [string, string, string][] = [
    ['tinta sobre papel', t.tinta, t.papel],
    ['texto suave sobre papel', t.tintaSuave, t.papel],
    ['pie sobre el fondo', t.tintaSuave, t.fondo],
    ['antetítulo sobre papel', t.olivaMedio, t.papel],
    ['texto del botón', t.dorado, t.oliva],
    ['cifras sobre arena', t.oliva, t.arena],
    ['etiqueta de cifra sobre arena', t.tintaSuave, t.arena],
    ['enlace secundario', t.olivaMedio, t.papel],
  ];
  for (const [que, color, fondo] of pares) {
    assert.ok(ratioContraste(color, fondo)! >= 4.5, `${que}: ${ratioContraste(color, fondo)?.toFixed(2)}:1`);
  }
});

test('preheader oculto con su relleno, modo claro declarado y peso bajo el recorte de Gmail', () => {
  const html = correoTentare(BASICO);
  assert.match(html, /display:none;font-size:1px[^"]*mso-hide:all/);
  assert.match(html, /(&nbsp;&zwnj;){10,}/);
  assert.match(html, /name="color-scheme" content="light"/);
  assert.ok(Buffer.byteLength(html, 'utf8') < 60_000);
});

test('solo clases para el móvil, y ningún dominio que no le hayamos dado', () => {
  const html = correoTentare(BASICO);
  const clases = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)));
  assert.deepEqual([...clases].sort(), ['px-mobile', 'w-full']);
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
