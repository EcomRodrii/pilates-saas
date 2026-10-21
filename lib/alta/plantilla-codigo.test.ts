import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  APERTURA, ASUNTO_ALTA_NUEVA, CIERRE, SEPARADOR, asuntoCondicional, componerPlantillaCodigo, partirPlantillaDelRepo,
} from './plantilla-codigo.ts';

// El correo del código vive en la plantilla del PROYECTO de Supabase, que es
// una para todas las altas. Lo que se prueba aquí es que la rama nueva solo la
// ve el alta nueva, que no lleva ni botón ni enlace, y que al aplicarlo la rama
// de siempre sea lo que ya hay en producción, byte a byte.

const FICHERO = readFileSync(new URL('../../supabase/templates/confirmation.html', import.meta.url), 'utf8');
const CONFIG = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');

test('la plantilla del repo: la rama nueva arriba y la de siempre debajo', () => {
  const { nueva, deSiempre } = partirPlantillaDelRepo(FICHERO);
  assert.ok(nueva.startsWith('<!DOCTYPE html>') && nueva.endsWith('</html>\n'));
  assert.ok(deSiempre.startsWith('<!DOCTYPE html>') && deSiempre.endsWith('</html>\n'));
  // La de siempre, la que llevaba el repo hasta el alta nueva.
  assert.match(deSiempre, /Verifica tu correo/);
  assert.match(deSiempre, /Tu código de verificación es:/);
  assert.match(deSiempre, /\{\{ \.Token \}\}/);
  assert.doesNotMatch(deSiempre, /alta_nueva|\.Data/);
});

test('la rama nueva: el código, los textos de la maqueta y NINGÚN enlace', () => {
  const { nueva } = partirPlantillaDelRepo(FICHERO);
  assert.match(nueva, /\{\{ \.Token \}\}/);
  for (const texto of [
    'Te damos la bienvenida a Tentare',
    'escribe este código en la pantalla donde te has registrado:',
    'Caduca en 10 minutos',
    'Lo que viene después, en unos 10 minutos:',
    'Dónde está tu estudio y cuándo abre',
    'Tu primera clase, con su precio',
    'Tu enlace de reservas, listo para mandar',
    'Si no has sido tú, ignora este correo: sin el código no se crea nada.',
    'te responde una persona',
    'Tentare · Software para estudios de Pilates · Hecho en España',
  ]) assert.ok(nueva.includes(texto), texto);
  // Decisión 1 del fundador: los escáneres de correo abren los enlaces y gastan el acceso.
  assert.doesNotMatch(nueva, /href=|ConfirmationURL|TokenHash|<a[\s>]/);
  // El nombre del estudio, siempre con `with`: un campo que falte no puede tumbar el envío.
  assert.doesNotMatch(nueva, /\{\{ \.Data\.pending_studio\.nombre \}\}/);
  assert.match(nueva, /\{\{ with \.Data\.pending_studio \}\}\{\{ with \.nombre \}\}/);
});

test('el asunto de referencia: el código solo para el alta nueva, el de siempre para el resto', () => {
  const asunto = /\[auth\.email\.template\.confirmation\][\s\S]*?subject = "([^"]+)"/.exec(CONFIG)?.[1];
  assert.equal(asunto, asuntoCondicional('Tu código de verificación de Tentare'));
  assert.equal(ASUNTO_ALTA_NUEVA, '{{ .Token }} es tu código · Te damos la bienvenida a Tentare');
});

test('al componer, la rama de siempre es la de producción, no la del repo', () => {
  const hoy = '<!DOCTYPE html>\n<p>retocada en el panel {{ .Token }}</p>\n';
  const c = componerPlantillaCodigo({ ficheroDelRepo: FICHERO, contenidoDeHoy: hoy, asuntoDeHoy: 'Asunto de hoy' });
  assert.equal(c.laDeSiempreCoincide, false);
  assert.equal(c.yaAplicada, false);
  assert.ok(c.contenido.startsWith(APERTURA) && c.contenido.endsWith(`${SEPARADOR}${hoy}${CIERRE}`));
  assert.equal(partirPlantillaDelRepo(c.contenido).deSiempre, hoy);
  assert.equal(c.asunto, '{{ if .Data.alta_nueva }}{{ .Token }} es tu código · Te damos la bienvenida a Tentare{{ else }}Asunto de hoy{{ end }}');

  // Con producción igual que el repo, lo dice.
  const igual = componerPlantillaCodigo({
    ficheroDelRepo: FICHERO, contenidoDeHoy: partirPlantillaDelRepo(FICHERO).deSiempre, asuntoDeHoy: 'Tu código de verificación de Tentare',
  });
  assert.equal(igual.laDeSiempreCoincide, true);
  assert.equal(igual.contenido, FICHERO);
});

test('no compone sobre una plantilla vacía ni avisa en falso si ya estaba aplicada', () => {
  assert.throws(() => componerPlantillaCodigo({ ficheroDelRepo: FICHERO, contenidoDeHoy: '  ', asuntoDeHoy: 'x' }));
  assert.throws(() => componerPlantillaCodigo({ ficheroDelRepo: FICHERO, contenidoDeHoy: '<p>x</p>', asuntoDeHoy: '' }));
  const ya = componerPlantillaCodigo({ ficheroDelRepo: FICHERO, contenidoDeHoy: FICHERO, asuntoDeHoy: asuntoCondicional('x') });
  assert.equal(ya.yaAplicada, true);
  assert.throws(() => partirPlantillaDelRepo('<!DOCTYPE html>'));
});
