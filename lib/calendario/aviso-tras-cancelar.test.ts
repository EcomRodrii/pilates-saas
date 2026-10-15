import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoTrasCancelar } from './aviso-tras-cancelar.ts';

const CLASE = { hecho: 'Clase cancelada', confirmacion: 'La clase sí está cancelada' };

test('todo bien: en verde, y dice si había a quién avisar', () => {
  assert.deepEqual(avisoTrasCancelar({ ...CLASE, avisadas: 3, sinAvisar: 0 }), { texto: 'Clase cancelada · clientas avisadas', error: false });
  // Antes decía «clientas avisadas» sin nadie apuntada.
  assert.deepEqual(avisoTrasCancelar({ ...CLASE, avisadas: 0, sinAvisar: 0 }), { texto: 'Clase cancelada · sin clientas a las que avisar', error: false });
});

test('una alumna sin avisar vendrá a una clase que no existe: en rojo, lo que hay que hacer primero', () => {
  const r = avisoTrasCancelar({ ...CLASE, avisadas: 2, sinAvisar: 1 });
  assert.equal(r.error, true);
  assert.equal(r.texto, 'A 1 clienta no le ha llegado el aviso: escríbele o llámala. La clase sí está cancelada.');
  assert.match(avisoTrasCancelar({ ...CLASE, avisadas: 0, sinAvisar: 2 }).texto, /^A 2 clientas no les ha llegado el aviso: escríbeles o llámalas\./);
});

test('una sesión que no volvió al bono: en rojo, el problema antes que la confirmación', () => {
  const r = avisoTrasCancelar({ ...CLASE, avisadas: 3, sinAvisar: 0, avisoBono: 'No hemos podido devolver la sesión al bono de una clienta. Revísalo a mano.' });
  assert.equal(r.error, true);
  assert.equal(r.texto, 'No hemos podido devolver la sesión al bono de una clienta. Revísalo a mano. La clase sí está cancelada.');
});

test('sin cancelar sus reservas: en rojo y dice qué hacer', () => {
  assert.deepEqual(avisoTrasCancelar({ ...CLASE, reservasCanceladas: false, avisadas: 0, sinAvisar: 0 }),
    { texto: 'Clase cancelada, pero no hemos podido cancelar sus reservas: recarga la página.', error: true });
});

test('el aviso de la app que no salió también cuenta', () => {
  const r = avisoTrasCancelar({ hecho: 'Clase eliminada', confirmacion: 'La clase sí se ha eliminado', avisadas: 1, sinAvisar: 0, enApp: false });
  assert.deepEqual(r, { texto: 'El aviso en su app no ha salido. La clase sí se ha eliminado.', error: true });
});
