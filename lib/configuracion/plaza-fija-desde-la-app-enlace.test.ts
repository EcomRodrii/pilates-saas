import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeAbrirEnConfiguracion } from './destino.ts';

// El aviso de la vista «Horario» ofrece «Dejar que la pidan ellas» solo a quien
// puede abrir ese ajuste: un enlace que aterriza en «Esta parte la gestiona la
// propietaria» es peor que no ofrecerlo (ver `puedeAbrirEnConfiguracion`).
const HREF = '/configuracion?tab=reservas#plaza-fija-desde-la-app';

test('solo la propietaria abre el ajuste de las peticiones desde la app', () => {
  assert.equal(puedeAbrirEnConfiguracion('PROPIETARIO', HREF), true);
  // La gerencia y recepción ven el aviso, pero sin el enlace.
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR']) {
    assert.equal(puedeAbrirEnConfiguracion(rol, HREF), false, rol);
  }
});
