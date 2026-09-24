import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// RES-2/RES-7: el calendario coloca y agrupa por la hora del ESTUDIO
// (`lib/calendario-hora-estudio.ts`, `franjaLocalDe`). Un `getHours()` sobre el
// instante de una sesión vuelve a poner la geometría en la zona del navegador
// mientras la etiqueta y lo que se escribe van en Madrid: con un navegador
// fuera de Madrid la clase salta de hora al arrastrarla. Los `getDay()` de
// cursores construidos con fechas locales (`new Date(fecha + 'T00:00:00')`) son
// otra cosa y no se prohíben: solo el `getDay()` de un `new Date(<instante>)`.

const FUENTE = readFileSync('app/(dashboard)/calendario/page.tsx', 'utf8');
const CODIGO = FUENTE.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));

test('el calendario no lee horas ni minutos con la zona del navegador', () => {
  const malas = CODIGO.filter((l) => /\.getHours\(\)|\.getMinutes\(\)/.test(l));
  assert.deepEqual(malas, []);
});

test('el día de la semana de una sesión sale del estudio, no de new Date(inicio).getDay()', () => {
  const malas = CODIGO.filter((l) => /new Date\([^)]*\)\.getDay\(\)/.test(l));
  assert.deepEqual(malas, []);
});
