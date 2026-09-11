import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpretarEventoResend, normalizarEmail, motivoLegible } from './rebotes.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los dos casos medidos en producción el 11-sep-2026, que son los que dan
// nombre a este módulo:
//
//   · `fashionbeatriz553@email.com` — la propietaria quiso escribir @gmail.com.
//     Resend devolvió 200 y un id; el correo REBOTÓ 2 s después.
//   · `meri@gmail.com` — dirección ya en la lista de supresión de la cuenta por
//     un rebote anterior. Resend devolvió 200 y un id y NO lo mandó.
//
// En los dos, el panel dijo «1 aviso enviado». Lo que se prueba aquí es que el
// evento que llega después se interpreta como lo que es.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = { email_id: 'e-1', from: 'hola@tentare.app', subject: 'Se ha quedado un hueco', created_at: '2026-09-11T01:12:09Z' };

test('un rebote permanente marca la dirección', () => {
  const efecto = interpretarEventoResend({
    type: 'email.bounced',
    created_at: BASE.created_at,
    data: {
      ...BASE,
      to: ['fashionbeatriz553@email.com'],
      bounce: { type: 'Permanent', subType: 'General', message: 'The recipient does not exist' },
    },
  });

  assert.equal(efecto.accion, 'anotar');
  assert.deepEqual(efecto.accion === 'anotar' ? efecto.rebotes : null, [{
    email: 'fashionbeatriz553@email.com',
    tipo: 'REBOTE',
    motivo: 'The recipient does not exist',
    emailId: 'e-1',
  }]);
});

test('una supresión también: es el caso que «funciona» y no llega', () => {
  // Resend contesta 200 con un id y descarta el envío. Sin este evento, la
  // única señal que tenía Tentare era la de éxito.
  const efecto = interpretarEventoResend({
    type: 'email.suppressed',
    data: { ...BASE, to: ['meri@gmail.com'], suppressed: { type: 'bounce', message: 'On the suppression list' } },
  });
  assert.equal(efecto.accion, 'anotar');
  assert.equal(efecto.accion === 'anotar' && efecto.rebotes[0].tipo, 'SUPRIMIDO');
});

test('un rebote TRANSITORIO no marca nada', () => {
  // Buzón lleno: se vacía solo. Marcarlo dejaría a una socia sin recibir nada
  // por una mala semana de su correo.
  const efecto = interpretarEventoResend({
    type: 'email.bounced',
    data: { ...BASE, to: ['laura@gmail.com'], bounce: { type: 'Transient', subType: 'MailboxFull', message: 'Mailbox full' } },
  });
  assert.equal(efecto.accion, 'ignorar');
});

test('un rebote sin tipo cuenta como permanente', () => {
  // El error caro va en la otra dirección: no anotarlo devuelve el
  // comportamiento que este módulo arregla (decir «enviado» a un buzón muerto),
  // y anotarlo de más solo hace que el panel avise.
  const efecto = interpretarEventoResend({ type: 'email.bounced', data: { ...BASE, to: ['x@y.com'], bounce: {} } });
  assert.equal(efecto.accion, 'anotar');
});

test('una queja de spam se anota como QUEJA', () => {
  const efecto = interpretarEventoResend({ type: 'email.complained', data: { ...BASE, to: ['harta@gmail.com'] } });
  assert.equal(efecto.accion, 'anotar');
  assert.equal(efecto.accion === 'anotar' && efecto.rebotes[0].tipo, 'QUEJA');
});

test('entregado OLVIDA la dirección: un buzón arreglado deja de estar marcado', () => {
  // Si no, corregir la errata del correo no serviría de nada: la dirección
  // buena quedaría marcada para siempre por el rebote de la mala.
  const efecto = interpretarEventoResend({ type: 'email.delivered', data: { ...BASE, to: ['ya@funciona.com'] } });
  assert.deepEqual(efecto, { accion: 'olvidar', emails: ['ya@funciona.com'] });
});

test('un fallo de ENVÍO no acusa al buzón', () => {
  // `email.failed` es plantilla/adjunto/cuota nuestra. Apuntarlo aquí marcaría
  // como rota una dirección que está perfectamente.
  const efecto = interpretarEventoResend({
    type: 'email.failed',
    data: { ...BASE, to: ['buena@gmail.com'], failed: { reason: 'Attachment too large' } },
  });
  assert.equal(efecto.accion, 'ignorar');
});

test('los eventos que no dicen nada del buzón se ignoran', () => {
  for (const type of ['email.sent', 'email.opened', 'email.clicked', 'email.delivery_delayed', 'contact.created', 'domain.updated']) {
    assert.equal(interpretarEventoResend({ type, data: { ...BASE, to: ['a@b.com'] } }).accion, 'ignorar', type);
  }
});

test('sin destinatario no hay nada que anotar', () => {
  assert.equal(interpretarEventoResend({ type: 'email.bounced', data: { ...BASE, to: [] } }).accion, 'ignorar');
  assert.equal(interpretarEventoResend({ type: 'email.bounced', data: { ...BASE } }).accion, 'ignorar');
  assert.equal(interpretarEventoResend(null).accion, 'ignorar');
  assert.equal(interpretarEventoResend({}).accion, 'ignorar');
});

test('un envío a varias direcciones marca todas', () => {
  const efecto = interpretarEventoResend({
    type: 'email.bounced',
    data: { ...BASE, to: ['una@x.com', 'otra@x.com'], bounce: { type: 'Permanent' } },
  });
  assert.equal(efecto.accion === 'anotar' && efecto.rebotes.length, 2);
});

test('la dirección se normaliza: mayúsculas y espacios son el mismo buzón', () => {
  // Es la clave primaria de `email_rebotes` y con lo que se cruza contra
  // `socios.email`. Sin normalizar, «Meri@Gmail.com» sería otro buzón y el
  // aviso volvería a salir.
  assert.equal(normalizarEmail('  Meri@Gmail.COM '), 'meri@gmail.com');
  const efecto = interpretarEventoResend({
    type: 'email.bounced',
    data: { ...BASE, to: ['  Meri@Gmail.COM '], bounce: { type: 'Permanent' } },
  });
  assert.equal(efecto.accion === 'anotar' && efecto.rebotes[0].email, 'meri@gmail.com');
});

test('el motivo que ve la propietaria va en castellano', () => {
  // El texto del proveedor («The recipient does not exist») se guarda para
  // depurar, pero no es lo que se le enseña a nadie.
  for (const tipo of ['REBOTE', 'QUEJA', 'SUPRIMIDO'] as const) {
    assert.match(motivoLegible(tipo), /[a-záéíóúñ]{4,}/i);
    assert.doesNotMatch(motivoLegible(tipo), /\b(bounce|suppress|complaint)\b/i);
  }
});
