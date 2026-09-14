import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENTOS, plantillaDe, render } from './catalog.ts';

// Auditoría RGPD 2026-09: el push de «una instructora no puede dar su clase»
// llevaba el motivo entre paréntesis, y el de una ausencia programada ponía
// «baja médica» en el título. Las dos cosas pueden ser salud de una empleada, y
// un push pasa por servicios de terceros y se queda en `notification`.

const EVENTOS_EQUIPO = [EVENTOS.INSTRUCTORA_BAJA, EVENTOS.INSTRUCTORA_AUSENCIA];

test('las plantillas de baja y ausencia no tienen hueco para el motivo ni el tipo', () => {
  for (const evento of EVENTOS_EQUIPO) {
    const pl = plantillaDe(evento, 'PROPIETARIO');
    assert.ok(pl, `falta plantilla ${evento}#PROPIETARIO`);
    for (const texto of [pl.title, pl.body]) {
      assert.doesNotMatch(texto, /\{(motivo|tipo|tipoTexto)\}/, `${evento}: ${texto}`);
    }
  }
});

test('aunque llegue el motivo en los datos, no sale en el aviso', () => {
  const datos = {
    instructora: 'Marta', clase: 'Reformer', cuando: 'martes 9:00',
    desde: '1 sep', hasta: '5 sep', clases: '',
    motivo: ' (dato de salud)', tipoTexto: 'baja médica',
  };
  for (const evento of EVENTOS_EQUIPO) {
    const pl = plantillaDe(evento, 'PROPIETARIO')!;
    const salida = `${render(pl.title, datos)} ${render(pl.body, datos)}`;
    assert.doesNotMatch(salida, /dato de salud|baja médica/, `${evento}: ${salida}`);
    assert.match(salida, /Marta/);
  }
  const ausencia = render(plantillaDe(EVENTOS.INSTRUCTORA_AUSENCIA, 'PROPIETARIO')!.body, datos);
  assert.equal(ausencia, 'Marta no estará disponible del 1 sep al 5 sep.');
});

// El emisor tampoco lo mete en `data`: esa columna se guarda y la lee el push.
function cuerpoDe(fuente: string, nombre: string): string {
  const ini = fuente.indexOf(`export async function ${nombre}(`);
  assert.ok(ini >= 0, `no encuentro ${nombre} en emit.ts`);
  // Hasta la llave de cierre de la función (columna 0), no hasta el siguiente
  // `export`: entre medias va el comentario de la función de al lado.
  const fin = fuente.indexOf('\n}\n', ini);
  assert.ok(fin > ini, `no encuentro el final de ${nombre}`);
  return fuente.slice(ini, fin + 2);
}

test('emitirInstructoraBaja y emitirInstructoraAusencia no mandan motivo ni tipo', () => {
  const fuente = readFileSync(new URL('./emit.ts', import.meta.url), 'utf8');
  for (const nombre of ['emitirInstructoraBaja', 'emitirInstructoraAusencia']) {
    const cuerpo = cuerpoDe(fuente, nombre);
    assert.doesNotMatch(cuerpo, /motivo|tipoTexto|\btipo\b/, `${nombre} vuelve a llevar motivo o tipo`);
  }
});
