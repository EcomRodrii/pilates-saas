import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarWhatsAppTexto, enviarWhatsAppPlantilla, PLANTILLA_SUSTITUCION } from './whatsapp.ts';

const CREDS = { token: 'EAAtoken', phoneId: '109' };

// Sustituye `fetch` y devuelve lo que Meta habría recibido de verdad. Se prueba
// contra el cuerpo enviado y no contra una función interna a propósito: lo que
// importa no es cómo se sanea, es qué acaba viajando.
async function capturar(fn: () => Promise<unknown>): Promise<{ url: string; body: Record<string, unknown> }> {
  const original = globalThis.fetch;
  let capturado: { url: string; body: Record<string, unknown> } | null = null;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturado = { url: String(input), body: JSON.parse(String(init?.body ?? '{}')) };
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 });
  }) as typeof fetch;
  try { await fn(); } finally { globalThis.fetch = original; }
  assert.ok(capturado, 'no se llegó a llamar a Meta');
  return capturado!;
}

test('el destinatario se normaliza a E.164 sin «+» (móvil ES → 34…)', async () => {
  // Los teléfonos se guardan como los teclea la propietaria. Sin esto, un
  // «612 34 56 78» viajaba como «612345678»: nueve dígitos sin país, que para
  // Meta no es nadie — y el envío parecía haberse hecho.
  const { body } = await capturar(() => enviarWhatsAppTexto(CREDS, '612 34 56 78', 'hola'));
  assert.equal(body.to, '34612345678');

  const intl = await capturar(() => enviarWhatsAppTexto(CREDS, '+44 7700 900000', 'hola'));
  assert.equal(intl.body.to, '447700900000');
});

test('sin teléfono utilizable no se llama a Meta', async () => {
  for (const malo of [null, undefined, '', 'sin numero']) {
    const r = await enviarWhatsAppTexto(CREDS, malo, 'hola');
    assert.equal(r.ok, false);
  }
});

test('los parámetros de plantilla viajan sin saltos de línea ni espacios de sobra', async () => {
  // Meta rechaza el ENVÍO ENTERO si un parámetro lleva un salto de línea, un
  // tabulador o más de 4 espacios seguidos (error 100). Y esos valores son el
  // nombre de la socia o el de la clase: texto tecleado a mano o venido del
  // importador de CSV, donde un salto de línea colado es perfectamente posible.
  const { body } = await capturar(() => enviarWhatsAppPlantilla(
    CREDS, '612345678', PLANTILLA_SUSTITUCION,
    ['Ana\nMaría', 'Reformer\tsuave', 'lun 20     ·     18:00', ' https://x.app/a/tok '],
  ));
  const componentes = (body.template as { components: { parameters: { text: string }[] }[] }).components;
  const textos = componentes[0].parameters.map(p => p.text);
  assert.deepEqual(textos, ['Ana María', 'Reformer suave', 'lun 20 · 18:00', 'https://x.app/a/tok']);
  for (const t of textos) {
    assert.doesNotMatch(t, /[\n\t\r]/);
    assert.doesNotMatch(t, / {5}/);
  }
});

test('la plantilla viaja con su nombre e idioma exactos', async () => {
  // Un nombre distinto del aprobado en Meta devuelve 132001 en TODOS los
  // envíos, así que la constante es el contrato con WhatsApp Manager.
  const { body } = await capturar(() => enviarWhatsAppPlantilla(CREDS, '612345678', PLANTILLA_SUSTITUCION, ['a', 'b', 'c', 'd']));
  const t = body.template as { name: string; language: { code: string } };
  assert.equal(t.name, 'sustitucion_urgente');
  assert.equal(t.language.code, 'es');
});
