import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EJEMPLOS } from './ejemplos.ts';

const raiz = join(import.meta.dirname, '..', '..');
const leer = (f: string) => readFileSync(join(raiz, f), 'utf8');

test('los ejemplos son de Pilates, no de yoga genérico', () => {
  for (const [id, e] of Object.entries(EJEMPLOS)) {
    assert.match(`${e.banda} ${Object.values(e.placeholders).join(' ')}`, /Reformer|Pilates|Suelo|Bono/, id);
    assert.doesNotMatch(e.banda, /yoga|asana|meditaci/i, id);
  }
});

test('la banda dice que nada se guarda solo, y cita el botón que existe', () => {
  assert.match(EJEMPLOS['tipo-clase'].banda, /Nada se guarda hasta que pulses «Crear tipo de clase»/);
  assert.ok(leer('components/configuracion/panel-tipo-clase.tsx').includes("'Crear tipo de clase'"));
  assert.match(EJEMPLOS.bono.banda, /Nada se guarda hasta que pulses «Crear bono de sesiones»/);
  // El botón del bono es `Crear ${NOMBRE_TIPO_PLAN[tipo].toLowerCase()}` (productos/page.tsx) con
  // BONO: 'Bono de sesiones' (lib/planes/formulario.ts): si cambia uno, la banda mentiría.
  assert.ok(leer('app/(dashboard)/productos/page.tsx').includes('`Crear ${NOMBRE_TIPO_PLAN[form.tipo].toLowerCase()}`'));
  assert.ok(leer('lib/planes/formulario.ts').includes("BONO: 'Bono de sesiones'"));
});

test('solo texto en gris de campos obligatorios: nunca un valor que se guarde', () => {
  // Las claves son nombres de campo; un ejemplo no lleva `valores` ni `form`.
  assert.deepEqual(Object.keys(EJEMPLOS['tipo-clase'].placeholders), ['nombre']);
  assert.deepEqual(Object.keys(EJEMPLOS.bono.placeholders).sort(), ['nombre', 'precio', 'sesiones']);
  for (const e of Object.values(EJEMPLOS)) assert.deepEqual(Object.keys(e).sort(), ['banda', 'placeholders']);
});
