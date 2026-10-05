import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lineaDelPiloto, lineaEnSeguimiento } from './veredicto-copy.ts';

// El veredicto del día dice lo que ha pasado, nunca cómo está el estudio.
//
// Decía «Todo bajo control» con un cobro rechazado del piloto dentro, «nada más
// necesita tu criterio» con nueve sugerencias abiertas a un clic, «Ya te
// ocupaste de lo de hoy» sumando como resueltas las que habían fallado, y
// «Vuelve en un rato» cuando el análisis llegaba ocho horas después. Este test
// falla si alguna de esas frases vuelve a la pantalla (comentarios incluidos: un
// comentario que la cita es el primer paso para copiarla de vuelta).

const RAIZ = join(import.meta.dirname, '..', '..');
const PROHIBIDAS = [/bajo control/i, /nada necesita/i, /ninguna necesita/i, /Ya te ocupaste/i, /Vuelve en un rato/i];

for (const fichero of ['components/decision/veredicto-del-dia.tsx', 'lib/decision/veredicto-copy.ts']) {
  test(`${fichero} no vuelve a los textos de «todo bien»`, () => {
    const src = readFileSync(join(RAIZ, fichero), 'utf8');
    for (const p of PROHIBIDAS) assert.doesNotMatch(src, p, `${fichero} contiene ${p}`);
  });
}

test('el veredicto saca sus textos de veredicto-copy.ts (y no tapa el desenlace de la tarjeta)', () => {
  const src = readFileSync(join(RAIZ, 'components/decision/veredicto-del-dia.tsx'), 'utf8');
  assert.match(src, /from '@\/lib\/decision\/veredicto-copy'/);
  for (const t of ['TITULO_SILENCIO', 'TITULO_RESPONDIDO', 'TITULO_POSPUESTA', 'TEXTO_SIN_ANALIZAR', 'lineaDelPiloto', 'lineaEnSeguimiento']) {
    // Importado y usado: al menos dos apariciones.
    assert.ok((src.match(new RegExp(`\\b${t}\\b`, 'g')) ?? []).length >= 2, `falta ${t}`);
  }
  // Una recomendación del mensaje ya decidida sigue pintando su tarjeta, con lo
  // que pasó de verdad (cobro fallido, sin confirmar, mensaje que no salió…):
  // la rama «aplazada» solo se toma si sigue PENDIENTE.
  assert.match(src, /if \(veredicto\.pospuesta && r\.estado === 'PENDIENTE'\)/);
  assert.match(src, /<AccionesRecomendacion/);
});

test('lineaDelPiloto: sin nada hecho, ninguna línea', () => {
  assert.equal(lineaDelPiloto(0, 0), null);
});

test('lineaDelPiloto: lo que salió, con su número', () => {
  assert.equal(lineaDelPiloto(1, 0), 'Tentare ha resuelto 1 acción por su cuenta.');
  assert.equal(lineaDelPiloto(3, 0), 'Tentare ha resuelto 3 acciones por su cuenta.');
});

test('lineaDelPiloto: una FALLIDA se dice aparte, nunca sumada a las resueltas', () => {
  assert.equal(lineaDelPiloto(2, 1), 'Tentare ha resuelto 2 acciones por su cuenta. 1 no salió: lo ves en Actividad.');
  assert.equal(lineaDelPiloto(0, 1), 'Tentare ha intentado 1 acción por su cuenta. 1 no salió: lo ves en Actividad.');
  assert.equal(lineaDelPiloto(0, 2), 'Tentare ha intentado 2 acciones por su cuenta. 2 no salieron: las ves en Actividad.');
});

test('lineaEnSeguimiento: cuánto y dónde, sin calificarlo', () => {
  assert.equal(lineaEnSeguimiento(0), null);
  assert.equal(lineaEnSeguimiento(1), 'Tienes 1 sugerencia en seguimiento; la ves en el detalle.');
  assert.equal(lineaEnSeguimiento(9), 'Tienes 9 sugerencias en seguimiento; las ves en el detalle.');
});
