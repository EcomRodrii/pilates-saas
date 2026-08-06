import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fusionarAforo } from './portal-aforo.ts';
import type { Reserva } from './types.ts';

const reserva = (over: Partial<Reserva> & { id: string; sesionId: string }): Reserva => ({
  studioId: 'st-1', socioId: '', estado: 'CONFIRMADA', spotId: null,
  posicionEspera: null, checkInEn: null, creadoEn: '2026-01-01T10:00:00Z',
  ofertaExpiraEn: null, ...over,
});

test('las reservas FUERA de la ventana sobreviven intactas', () => {
  // Este es el fallo que la función existe para impedir: el historial de la
  // socia vive en sesiones pasadas, que el refresco ligero nunca trae.
  const pasada = reserva({ id: 'r-vieja', sesionId: 'ses-pasada', socioId: 'soc-1', estado: 'ASISTIDA' });
  const futura = reserva({ id: 'r-nueva', sesionId: 'ses-futura', socioId: 'soc-1' });

  const out = fusionarAforo(
    [pasada, futura],
    ['ses-futura'], // la ventana solo cubre la futura
    [{ id: 'r-nueva', sesion_id: 'ses-futura', estado: 'CONFIRMADA', spot_id: null }],
  );

  assert.deepEqual(out.find(r => r.id === 'r-vieja'), pasada, 'la reserva pasada no puede cambiar');
  assert.equal(out.length, 2);
});

test('conserva el dueño y la fecha de creación, que el aforo anónimo no trae', () => {
  const mia = reserva({ id: 'r-1', sesionId: 'ses-1', socioId: 'soc-1', creadoEn: '2026-05-05T08:00:00Z' });

  const [out] = fusionarAforo([mia], ['ses-1'], [{ id: 'r-1', sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: 'sp-9' }]);

  assert.equal(out.socioId, 'soc-1', 'perder el socioId dejaría a la socia sin "mi reserva"');
  assert.equal(out.creadoEn, '2026-05-05T08:00:00Z');
  assert.equal(out.spotId, 'sp-9', 'la plaza SÍ se actualiza: es lo que el endpoint sabe');
});

test('aplica el cambio de estado que llega del servidor', () => {
  const mia = reserva({ id: 'r-1', sesionId: 'ses-1', socioId: 'soc-1', estado: 'LISTA_ESPERA' });
  const [out] = fusionarAforo([mia], ['ses-1'], [{ id: 'r-1', sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: null }]);
  assert.equal(out.estado, 'CONFIRMADA', 'promocionar de lista de espera tiene que verse');
});

test('una reserva de OTRA persona entra sin dueño', () => {
  const out = fusionarAforo([], ['ses-1'], [{ id: 'r-ajena', sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: null }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].socioId, '', 'el aforo es anónimo: nadie más debe aparecer como dueño');
});

test('una reserva cancelada dentro de la ventana desaparece', () => {
  // El servidor deja de devolverla; sin retirarla, la plaza seguiría contando
  // como ocupada y la clase se vería llena sin estarlo.
  const mia = reserva({ id: 'r-1', sesionId: 'ses-1', socioId: 'soc-1' });
  const ajena = reserva({ id: 'r-2', sesionId: 'ses-1' });

  const out = fusionarAforo([mia, ajena], ['ses-1'], [{ id: 'r-1', sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: null }]);

  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'r-1');
});

test('una clase de la ventana que se queda SIN reservas vacía su aforo', () => {
  // `sesionIds` incluye la sesión aunque no tenga ninguna reserva. Sin esa
  // lista no se podría distinguir "sin reservas" de "fuera de la ventana", y la
  // clase se quedaría enseñando el aforo viejo para siempre.
  const ajena = reserva({ id: 'r-2', sesionId: 'ses-1' });
  const out = fusionarAforo([ajena], ['ses-1'], []);
  assert.deepEqual(out, []);
});

test('sin nada que fusionar, no toca nada', () => {
  const previas = [reserva({ id: 'r-1', sesionId: 'ses-pasada', socioId: 'soc-1' })];
  assert.deepEqual(fusionarAforo(previas, [], []), previas);
});
