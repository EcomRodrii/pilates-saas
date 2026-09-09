import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuerpoNudgeCandidata, parametrosNudgeCandidata } from './mensajes.ts';

test('nudge a la candidata: primer nombre + clase + enlace', () => {
  const s = cuerpoNudgeCandidata({ nombre: 'Ana María Ruiz', claseNombre: 'Reformer', cuando: 'lun 20 · 18:00', url: 'https://x.app/a/tok' });
  assert.match(s, /Ana/);         // solo el primer nombre
  assert.doesNotMatch(s, /Ruiz/); // no el apellido
  assert.match(s, /Reformer/);
  assert.match(s, /https:\/\/x\.app\/a\/tok/);
});

// Los tests de `cuerpoAlertaPropietaria` se fueron con la función el
// 2026-09-09: era el cuerpo del canal WhatsApp/SMS de `alertarPropietaria`, y
// ese canal se retiró entero con Twilio (ver contacto.ts). La alerta a la
// propietaria sigue saliendo por email, con su plantilla propia.

test('la plantilla de Meta recibe los MISMOS datos que el texto libre', () => {
  // Las dos versiones del mismo aviso tienen que decir lo mismo: el estudio
  // recibe una u otra según si se aprobó `sustitucion_urgente`, y ese detalle
  // no lo va a comprobar nadie a mano. Que compartan `primerNombre` es justo lo
  // que evita que una diga «Hola Ana» y la otra «Hola Ana María Ruiz».
  const datos = { nombre: 'Ana María Ruiz', claseNombre: 'Reformer', cuando: 'lun 20 · 18:00', url: 'https://x.app/a/tok' };
  assert.deepEqual(parametrosNudgeCandidata(datos), ['Ana', 'Reformer', 'lun 20 · 18:00', 'https://x.app/a/tok']);
});
