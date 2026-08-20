import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saludIntegracion, textoSalud, cuando, acumuladorSalud, integracionesCaidas, type FilaSalud } from './salud.ts';

const fila = (f: Partial<FilaSalud>): FilaSalud => ({
  activo: true, ultimoOkEn: null, ultimoError: null, ultimoErrorEn: null, ...f,
});

test('sin fila o apagada no se afirma nada del servicio', () => {
  assert.deepEqual(saludIntegracion(null), { estado: 'APAGADA' });
  assert.deepEqual(saludIntegracion(fila({ activo: false, ultimoOkEn: '2026-08-18T11:00:00Z' })), { estado: 'APAGADA' });
});

test('token recién guardado NO es "conectado"', () => {
  // El bug entero en una línea: tener el campo relleno no es haber hablado con
  // Meta. Antes esto pintaba «conectado» en verde.
  assert.deepEqual(saludIntegracion(fila({})), { estado: 'SIN_PROBAR' });
  assert.match(textoSalud(saludIntegracion(fila({})))!.texto, /aún sin usar/);
  assert.equal(textoSalud(saludIntegracion(fila({})))!.tono, 'neutro');
});

test('un envío correcto la deja funcionando', () => {
  const s = saludIntegracion(fila({ ultimoOkEn: '2026-08-18T10:00:00Z' }));
  assert.equal(s.estado, 'FUNCIONA');
  const t = textoSalud(s)!;
  assert.equal(t.tono, 'ok');
  assert.match(t.texto, /18 ago, 12:00/, 'hora del estudio: 10:00Z son las 12:00 en Madrid');
});

test('el token caducado se ve, con el motivo del servicio', () => {
  // Este es el caso que se quedaba invisible: el cron sumaba fallos en un log y
  // la pantalla seguía en verde.
  const s = saludIntegracion(fila({
    ultimoOkEn: '2026-08-15T10:00:00Z',
    ultimoError: 'Error validating access token: Session has expired',
    ultimoErrorEn: '2026-08-18T09:00:00Z',
  }));
  assert.equal(s.estado, 'FALLANDO');
  const t = textoSalud(s)!;
  assert.equal(t.tono, 'error');
  assert.match(t.texto, /18 ago, 11:00/);
  assert.match(t.texto, /Session has expired/, 'el motivo real, no "revisa la configuración"');
});

test('un fallo VIEJO no tapa un éxito posterior', () => {
  // Si un error de ayer dejara la tarjeta en rojo para siempre, la propietaria
  // aprendería a ignorarla — y entonces no vería el aviso que sí importa.
  const s = saludIntegracion(fila({
    ultimoOkEn: '2026-08-18T11:00:00Z',
    ultimoError: 'timeout', ultimoErrorEn: '2026-08-17T11:00:00Z',
  }));
  assert.equal(s.estado, 'FUNCIONA');
});

test('falla sin haber funcionado nunca: también es FALLANDO', () => {
  const s = saludIntegracion(fila({ ultimoError: 'Invalid phone number ID', ultimoErrorEn: '2026-08-18T11:30:00Z' }));
  assert.equal(s.estado, 'FALLANDO');
});

test('un fallo sin mensaje no inventa uno técnico', () => {
  const s = saludIntegracion(fila({ ultimoError: '   ', ultimoErrorEn: '2026-08-18T11:30:00Z' }));
  assert.equal(s.estado === 'FALLANDO' && s.error, 'El servicio rechazó la última petición');
});

test('cuando(): hora del estudio, y una fecha inválida no rompe la tarjeta', () => {
  // 10:00 UTC en agosto son las 12:00 en Madrid. Enseñar UTC haría que la
  // propietaria buscara un fallo dos horas antes de donde ocurrió.
  assert.equal(cuando('2026-08-18T10:00:00Z'), '18 ago, 12:00');
  assert.equal(cuando('no-es-una-fecha'), '');
});

// ── acumuladorSalud ──────────────────────────────────────────────────────────

test('acumulador: sin intentos no hay nada que guardar', () => {
  assert.equal(acumuladorSalud().resultado(), null);
});

test('acumulador: un acierto gana a los fallos de la misma tanda', () => {
  // Tres números mal escritos no significan que el token esté caducado. Pintar
  // rojo aquí manda a la propietaria a revisar algo que funciona.
  const a = acumuladorSalud();
  a.anota({ ok: false, error: 'Invalid recipient' });
  a.anota({ ok: true });
  a.anota({ ok: false, error: 'Invalid recipient' });
  assert.deepEqual(a.resultado(), { ok: true });
});

test('acumulador: si TODO falla, se guarda el último motivo', () => {
  const a = acumuladorSalud();
  a.anota({ ok: false, error: 'primero' });
  a.anota({ ok: false, error: 'Session has expired' });
  assert.deepEqual(a.resultado(), { ok: false, error: 'Session has expired' });
});

// ── integracionesCaidas (aviso de la home) ───────────────────────────────────

test('integracionesCaidas: solo las rotas, y con su motivo', () => {
  const caidas = integracionesCaidas([
    { tipo: 'RESEND', activo: true, ultimoOkEn: '2026-08-18T10:00:00Z' },
    { tipo: 'WHATSAPP', activo: true, ultimoError: 'Session has expired', ultimoErrorEn: '2026-08-18T11:00:00Z' },
    { tipo: 'KISI', activo: false, ultimoError: 'nope', ultimoErrorEn: '2026-08-18T11:00:00Z' },
  ]);
  assert.equal(caidas.length, 1);
  assert.equal(caidas[0].integracion.tipo, 'WHATSAPP');
  assert.equal(caidas[0].error, 'Session has expired');
});

test('integracionesCaidas: un dato con otra forma NO tumba el dashboard', () => {
  // Esta pantalla es la principal del negocio: romperse aquí no cuesta una
  // tarjeta, cuesta la pantalla entera. Ya pasó con `[...data.prioridades]`
  // sobre una respuesta `{}`.
  assert.deepEqual(integracionesCaidas(undefined), []);
  assert.deepEqual(integracionesCaidas(null), []);
  assert.deepEqual(integracionesCaidas({} as never), []);
  assert.deepEqual(integracionesCaidas([undefined as never, { tipo: 'X' }]), []);
});
