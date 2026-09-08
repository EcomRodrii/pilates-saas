// ─────────────────────────────────────────────────────────────────────────────
// «Pedir confirmación a quien suele no venir»: un solo mando, y con su puerta.
//
// La regla vivía sola en Centro de Control, bajo un desplegable cerrado por
// defecto: se cancelaban reservas y la propietaria no encontraba dónde se
// decidía eso. Se ha movido a Configuración → Reservas y cancelaciones, con las
// otras trece reglas de reserva.
//
// Estructural a propósito. Lo que hay que impedir no es un cálculo mal hecho:
//   · que vuelva a haber DOS interruptores para la misma columna (y con ello,
//     la duda de cuál manda);
//   · que alguien la enchufe al `updateStudio` del resto de la pestaña. Esa
//     columna solo la escribe `/api/decisiones/confirmacion-riesgo`, que además
//     del rol exige plan con Centro de Control — el riesgo lo calcula el motor
//     de decisiones. Un UPDATE del cliente contra la RLS la regalaría a
//     cualquier plan sin que se notara.
// El comportamiento (que guarde, y que sin plan no se pulse) lo cubre
// e2e/confirmacion-asistencia-en-configuracion.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raiz = join(import.meta.dirname, '..');
// Sin comentarios: este mismo fichero explica en los suyos lo que los guardias
// prohíben, y la documentación buena no puede hacer fallar al guardia.
const leerCodigo = (p: string) =>
  readFileSync(join(raiz, p), 'utf8').split('\n')
    .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');

const RESERVAS = 'components/configuracion/tab-estudio-reservas.tsx';
const PLANTON = 'components/decision/riesgo-planton.tsx';

test('el ajuste se ofrece entre las reglas de reserva', () => {
  const src = leerCodigo(RESERVAS);
  assert.match(src, /Pedir confirmación a quien suele no venir/,
    'Si no está aquí, vuelve a estar donde nadie lo encuentra.');
  assert.match(src, /obtenerConfirmacionRiesgo|actualizarConfirmacionRiesgo/,
    'Tiene que leerse y escribirse por su endpoint, no por la política del estudio.');
});

test('la letra pequeña dice que NO se le pide a todo el mundo', () => {
  // El motor solo se lo pide a quien tiene riesgo ALTO
  // (`riesgoNoShowDeSocio`, lib/inngest/confirmacion-riesgo.ts). Sin ese matiz,
  // «se cancela su reserva» se lee como que le pasa a cualquiera que reserve —
  // que es justo como se entendió la primera vez.
  const src = leerCodigo(RESERVAS);
  assert.match(src, /No se le pide a todo el mundo/);
});

test('NO viaja en la política del estudio: por ahí no hay comprobación de plan', () => {
  const src = leerCodigo(RESERVAS);
  assert.doesNotMatch(src, /pedirConfirmacionRiesgo:/,
    'Metida en el formulario, se guardaría con updateStudio y se saltaría el plan.');
  const datos = leerCodigo('lib/supabase-data.ts');
  assert.doesNotMatch(datos, /db\.pedir_confirmacion_riesgo\s*=/,
    'La lista blanca de dbUpdateStudio no debe mapear esta columna.');
});

test('Centro de Control informa y enlaza, pero ya no escribe', () => {
  const src = leerCodigo(PLANTON);
  assert.doesNotMatch(src, /actualizarConfirmacionRiesgo/,
    'Dos interruptores para la misma columna es como se acaba discutiendo cuál manda.');
  assert.match(src, /obtenerConfirmacionRiesgo/,
    'Sigue enseñando si la regla está encendida: quitarlo obliga a adivinarlo.');
  assert.match(src, /\/configuracion\?tab=estudio&sub=reservas/,
    'Y tiene que llevar a donde se decide, no solo decir que se decide en otro sitio.');
});
