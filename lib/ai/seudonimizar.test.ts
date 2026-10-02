import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { restaurar, seudonimizar } from './seudonimizar.ts';

const alumna = { marca: 'ALUMNA', nombre: 'María José', apellidos: 'Álvarez de la Torre' };
const equipo = [{ marca: 'EQUIPO1', nombre: 'Marta Ruiz' }, { marca: 'EQUIPO2', nombre: 'Lucía' }];

test('quita nombre y apellidos de la alumna y del equipo, sin tildes ni mayúsculas que valgan', () => {
  const { texto } = seudonimizar('maria jose vino con la rodilla mejor. Alvarez dice que Marta le corrigió la postura.', [alumna, ...equipo]);
  assert.ok(!/mar[ií]a|jos[eé]|[aá]lvarez|marta/i.test(texto), texto);
  assert.match(texto, /\[ALUMNA_1\] \[ALUMNA_2\] vino con la rodilla mejor/);
  assert.match(texto, /\[EQUIPO1_1\] le corrigió/);
  // Las partículas del apellido no se tocan: «la rodilla», «la postura».
  assert.match(texto, /con la rodilla/);
});

test('correos y teléfonos fuera, aunque lleven el nombre dentro', () => {
  const { texto } = seudonimizar('Escribir a maria.alvarez@example.com o al 600 123 456', [alumna]);
  assert.ok(!texto.includes('@') && !/600/.test(texto), texto);
  assert.match(texto, /\[EMAIL_1\]/);
  assert.match(texto, /\[TELEFONO_1\]/);
});

test('restaurar deshace las marcas, también en lo que escribe la IA', () => {
  const s = seudonimizar('Lucía ve a María muy bien', [alumna, ...equipo]);
  const respuesta = 'Progreso de [ALUMNA_1]: bien. Lo comenta [EQUIPO2_1]. [DESCONOCIDA_1] se queda.';
  assert.equal(restaurar(respuesta, s.tabla), 'Progreso de María: bien. Lo comenta Lucía. [DESCONOCIDA_1] se queda.');
  assert.equal(restaurar(null, s.tabla), null);
});

test('una palabra que comparten la alumna y el equipo se queda como de la alumna', () => {
  const s = seudonimizar('Ruiz', [{ marca: 'ALUMNA', nombre: 'Ana', apellidos: 'Ruiz' }, { marca: 'EQUIPO1', nombre: 'Marta Ruiz' }]);
  assert.equal(s.texto, '[ALUMNA_2]');
});

test('un nombre que es también una palabra de la nota no se come el síntoma', () => {
  const dolores = { marca: 'ALUMNA', nombre: 'Dolores', apellidos: 'Martín' };
  const s = seudonimizar('Dolores Martín llega con dolores lumbares; a Dolores le molesta girar.', [dolores]);
  assert.match(s.texto, /^\[ALUMNA_1\] \[ALUMNA_2\] llega con dolores lumbares/);
  // Suelta, la palabra común se queda: mejor un nombre de pila a la vista que perder el síntoma.
  assert.match(s.texto, /a Dolores le molesta/);
  // Una ficha anonimizada del equipo no convierte «instructora» en una marca.
  const t = seudonimizar('La instructora corrige la postura', [dolores, { marca: 'EQUIPO1', nombre: 'Instructora eliminada' }]);
  assert.equal(t.texto, 'La instructora corrige la postura');
});

test('la nota dictada pasa por aquí antes de salir hacia la IA', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/ai/instructor-note/route.ts'), 'utf8');
  assert.match(ruta, /seudonimizar\(texto,/);
  assert.match(ruta, /content: seudo\.texto/);
  assert.doesNotMatch(ruta, /content: texto \}/, 'el texto original no puede ir en la petición');
});
