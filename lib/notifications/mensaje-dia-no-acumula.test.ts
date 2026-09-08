import test from 'node:test';
import assert from 'node:assert/strict';
import { criterioArchivadoMensajeDia, EVENTO_MENSAJE_DIA } from './mensaje-dia-archivado.ts';

// Regresión de lo medido en producción: el mismo asunto se acumulaba en la
// bandeja un día tras otro porque la clave de dedup lleva la fecha. Lo que se
// fija aquí es el criterio de archivado, condición por condición: cada una
// evita un daño distinto, y las cuatro son fáciles de perder en un refactor.

test('acota al estudio: no puede archivar avisos de otro', () => {
  const c = criterioArchivadoMensajeDia('stu-1', 'FINANZAS:BONO_CADUCA:carmen');
  assert.equal(c?.studioId, 'stu-1');
});

test('acota al mensaje del día: no toca reservas ni cobros', () => {
  const c = criterioArchivadoMensajeDia('stu-1', 'k');
  assert.equal(c?.eventType, EVENTO_MENSAJE_DIA);
});

test('solo lo que sigue vivo en la bandeja: lo leído es historial', () => {
  const c = criterioArchivadoMensajeDia('stu-1', 'k');
  assert.equal(c?.sinLeer, true, 'sin esto se borraría de la vista lo que ya leyó');
  assert.equal(c?.sinArchivar, true);
});

test('compara por asunto, no por título', () => {
  // El título cambia solo con que cambie una cifra: «40 clases van casi
  // vacías» → «37 clases van casi vacías» es el mismo asunto dos días
  // seguidos, y agrupando por título no se juntarían nunca.
  const c = criterioArchivadoMensajeDia('stu-1', 'AGENDA:CLASES_VACIAS');
  assert.equal(c?.campoAsunto, 'data->>asuntoKey');
  assert.equal(c?.asuntoKey, 'AGENDA:CLASES_VACIAS');
});

test('sin asunto no archiva: dos filas molestan, una borrada no se recupera', () => {
  for (const vacio of [null, undefined, '']) {
    assert.equal(criterioArchivadoMensajeDia('stu-1', vacio), null, String(vacio));
  }
});
