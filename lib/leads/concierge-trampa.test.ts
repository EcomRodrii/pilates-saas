import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPO_TRAMPA } from '../auth/trampa-bots.ts';

// `trampa-bots.ts` avisa de que el nombre del campo NO se escribe a mano en los
// dos lados: si el formulario y el servidor dejaran de coincidir, la trampa
// quedaría desactivada en silencio (nadie caería en ella y todo parecería
// correcto). Este test comprueba que las dos puntas del formulario de concierge
// usan la constante compartida, y que el servidor mira la trampa ANTES de guardar
// o avisar, que es lo que evita que un bot llene la bandeja de soporte.
const leer = (ruta: string) => readFileSync(new URL(ruta, import.meta.url), 'utf8');
const formulario = leer('../../components/soluciones/ConciergeMigracionForm.tsx');
const ruta = leer('../../app/api/public/migracion-concierge/route.ts');

test('el formulario pinta y envía el campo trampa con la constante compartida', () => {
  assert.match(formulario, /\[CAMPO_TRAMPA\]: trampa/, 'el formulario no envía el campo trampa al servidor.');
  assert.match(formulario, /name=\{CAMPO_TRAMPA\}/, 'el formulario no pinta el campo trampa.');
  assert.doesNotMatch(formulario, new RegExp(`['"]${CAMPO_TRAMPA}['"]`),
    'el nombre del campo está escrito a mano en el formulario: tiene que salir de trampa-bots.ts.');
});

test('el servidor mira la trampa antes de guardar el lead y de mandar el correo', () => {
  const trampa = ruta.indexOf('cayoEnLaTrampa(body?.[CAMPO_TRAMPA])');
  const guardar = ruta.indexOf('guardarLeadConcierge(');
  const correo = ruta.indexOf('resend.emails.send(');
  assert.ok(trampa >= 0, 'la ruta no comprueba el campo trampa.');
  assert.ok(guardar >= 0 && correo >= 0, 'no se encontró el guardado o el correo');
  assert.ok(trampa < guardar && trampa < correo, 'la trampa se comprueba después de guardar o de avisar.');
});

test('la ruta ya no usa un upsert sobre plataforma_lead', () => {
  // El upsert reescribía `id` y `origen` de un lead existente (ver
  // lib/leads/guardar-lead-concierge.ts). Si vuelve, vuelve el bug.
  assert.doesNotMatch(ruta, /\.upsert\(/, 'la ruta vuelve a usar upsert sobre el lead.');
});
