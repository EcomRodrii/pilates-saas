import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirEnvioGestoria, MENSAJES_ENVIO_GESTORIA, textoCambioGestoria } from './envio-gestoria-reglas.ts';

const GUARDADO = 'gestoria@asesoria.es';
const OTRO = 'buzon@externo.com';
const ROLES = ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const;

test('instructora y manager no envían el cierre, pidan el email que pidan', () => {
  for (const rol of ['INSTRUCTOR', 'MANAGER'] as const) {
    for (const emailPedido of [GUARDADO, OTRO, '', null]) {
      assert.deepEqual(
        decidirEnvioGestoria({ rol, emailPedido, emailGuardado: GUARDADO }),
        { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.sinPermiso },
        `${rol} con ${emailPedido}`,
      );
    }
  }
});

test('la propietaria envía a cualquier email y lo deja guardado si es distinto', () => {
  assert.deepEqual(
    decidirEnvioGestoria({ rol: 'PROPIETARIO', emailPedido: OTRO, emailGuardado: GUARDADO }),
    { ok: true, destinatario: OTRO, cambiaGuardado: true },
  );
  assert.deepEqual(
    decidirEnvioGestoria({ rol: 'PROPIETARIO', emailPedido: OTRO, emailGuardado: null }),
    { ok: true, destinatario: OTRO, cambiaGuardado: true },
  );
});

test('la propietaria reenviando al mismo email (espacios o mayúsculas) no cuenta como cambio', () => {
  assert.deepEqual(
    decidirEnvioGestoria({ rol: 'PROPIETARIO', emailPedido: '  Gestoria@Asesoria.es ', emailGuardado: GUARDADO }),
    { ok: true, destinatario: 'Gestoria@Asesoria.es', cambiaGuardado: false },
  );
});

test('la propietaria con un email mal escrito recibe 400', () => {
  for (const emailPedido of ['', 'no-es-email', null]) {
    assert.deepEqual(
      decidirEnvioGestoria({ rol: 'PROPIETARIO', emailPedido, emailGuardado: GUARDADO }),
      { ok: false, status: 400, error: MENSAJES_ENVIO_GESTORIA.emailInvalido },
    );
  }
});

test('recepción envía al email guardado, y el destinatario sale de la BD, no del body', () => {
  for (const emailPedido of [GUARDADO, ' GESTORIA@asesoria.es ', '', null]) {
    assert.deepEqual(
      decidirEnvioGestoria({ rol: 'RECEPCION', emailPedido, emailGuardado: GUARDADO }),
      { ok: true, destinatario: GUARDADO, cambiaGuardado: false },
      String(emailPedido),
    );
  }
});

test('recepción con otro email recibe 403: el ataque de H-1', () => {
  assert.deepEqual(
    decidirEnvioGestoria({ rol: 'RECEPCION', emailPedido: OTRO, emailGuardado: GUARDADO }),
    { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.soloPropietariaCambia },
  );
});

test('recepción sin email guardado no puede estrenarlo', () => {
  for (const emailGuardado of [null, undefined, '', '   ', 'roto']) {
    for (const emailPedido of [OTRO, '']) {
      assert.deepEqual(
        decidirEnvioGestoria({ rol: 'RECEPCION', emailPedido, emailGuardado }),
        { ok: false, status: 403, error: MENSAJES_ENVIO_GESTORIA.sinEmailGuardado },
        `${emailPedido} / ${emailGuardado}`,
      );
    }
  }
});

test('matriz rol × email: solo la propietaria puede cambiar el guardado o elegir destino', () => {
  for (const rol of ROLES) {
    for (const emailGuardado of [GUARDADO, null]) {
      for (const emailPedido of [GUARDADO, OTRO, '', 'roto']) {
        const d = decidirEnvioGestoria({ rol, emailPedido, emailGuardado });
        if (!d.ok) continue;
        if (d.cambiaGuardado) assert.equal(rol, 'PROPIETARIO', `${rol} cambió el guardado`);
        if (rol !== 'PROPIETARIO') assert.equal(d.destinatario, emailGuardado, `${rol} eligió destino`);
      }
    }
  }
});

test('el rastro dice de dónde a dónde', () => {
  assert.equal(textoCambioGestoria(GUARDADO, OTRO), `Email de la gestoría cambiado: ${GUARDADO} → ${OTRO}`);
  assert.equal(textoCambioGestoria(null, OTRO), `Email de la gestoría cambiado: ninguno → ${OTRO}`);
});
