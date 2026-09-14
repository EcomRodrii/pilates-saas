import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_OCULTO_TRAS_DESCARTAR, avisoAppDescartado, claveAvisoApp, hastaTrasDescartar, urlAppInstructora,
} from './app-instructora.ts';

test('«Ahora no» lo oculta una semana y después vuelve', () => {
  const ahora = Date.parse('2026-09-14T10:00:00Z');
  const guardado = hastaTrasDescartar(ahora);
  assert.equal(avisoAppDescartado(guardado, ahora), true);
  assert.equal(avisoAppDescartado(guardado, ahora + (DIAS_OCULTO_TRAS_DESCARTAR * 86_400_000) - 1), true);
  assert.equal(avisoAppDescartado(guardado, ahora + DIAS_OCULTO_TRAS_DESCARTAR * 86_400_000), false);
});

test('sin nada guardado, o con algo ilegible, el aviso se ve', () => {
  const ahora = Date.parse('2026-09-14T10:00:00Z');
  assert.equal(avisoAppDescartado(null, ahora), false);
  assert.equal(avisoAppDescartado('', ahora), false);
  assert.equal(avisoAppDescartado('mañana', ahora), false);
});

test('la clave es por estudio y el enlace lleva a «Hoy» de su app', () => {
  assert.notEqual(claveAvisoApp('sede-a'), claveAvisoApp('sede-b'));
  assert.equal(urlAppInstructora('pilates-centro'), '/portal/pilates-centro/equipo');
  assert.equal(urlAppInstructora('con espacio'), '/portal/con%20espacio/equipo');
});
