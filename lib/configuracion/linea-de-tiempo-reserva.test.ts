import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reglasGuardadas } from './reglas-reserva.ts';
import { claseDeEjemplo, instante, lineaDeTiempoReserva, reglasEfectivasDeTipo, resumenClasesPorSemana } from './linea-de-tiempo-reserva.ts';
import { queCambiaElTipo } from './reglas-reserva.ts';

// Jueves 1 de octubre de 2026 a las 18:00 en Madrid (UTC+2).
const JUEVES_18 = new Date('2026-10-01T16:00:00Z');
const estudio = reglasGuardadas({});
const paso = (pasos: ReturnType<typeof lineaDeTiempoReserva>, id: string) => pasos.find(p => p.id === id)!;

test('las horas van en la del estudio, no en la del servidor', () => {
  assert.equal(instante(JUEVES_18), 'jue 1 · 18:00');
});

test('con las reglas de fábrica: sin límite para reservar y cancela gratis hasta 12 h antes', () => {
  const pasos = lineaDeTiempoReserva(estudio, JUEVES_18);
  assert.equal(paso(pasos, 'abre').detalle, 'Sin límite de antelación');
  assert.equal(paso(pasos, 'cierra').cuando, 'Hasta el jue 1 · 18:00');
  assert.equal(paso(pasos, 'cancela-a-tiempo').cuando, 'Hasta el jue 1 · 06:00');
  // Las mismas frases que lee la alumna en su app.
  assert.equal(paso(pasos, 'cancela-a-tiempo').detalle, 'Si cancela con más de 12 h de antelación, recupera la sesión.');
  assert.equal(paso(pasos, 'cancela-tarde').detalle, 'Si cancela con menos de 12 h, no recupera la sesión.');
  assert.equal(paso(pasos, 'llena').que, 'Entra en la lista de espera');
});

test('pedir plan o bono se resuelve como en el servidor: sin nada a la venta no se exige', () => {
  const pide = { ...estudio, reservaExigirPlan: true };
  const exige = (planes?: { activo: boolean; esPrueba?: boolean }[]) => reglasEfectivasDeTipo(pide, null, planes).reservaExigirPlan;
  assert.equal(exige(), true, 'sin planes, el ajuste tal cual');
  assert.equal(exige([]), false);
  assert.equal(exige([{ activo: false }]), false, 'solo planes archivados');
  assert.equal(exige([{ activo: true, esPrueba: true }]), false, 'solo la clase de prueba');
  assert.equal(exige([{ activo: true }]), true);
  assert.match(paso(lineaDeTiempoReserva(reglasEfectivasDeTipo(pide, null, []), JUEVES_18), 'cierra').detalle, /sin plan ni bono/);
});

test('el tope de clases al día sale en «Puede reservar»', () => {
  assert.match(paso(lineaDeTiempoReserva({ ...estudio, reservaMaxPorDia: 1 }, JUEVES_18), 'cierra').detalle, /una al día como mucho/);
  assert.match(paso(lineaDeTiempoReserva({ ...estudio, reservaMaxPorDia: 2 }, JUEVES_18), 'cierra').detalle, /2 al día como mucho/);
});

test('se abre 2 días antes y se cierra 30 min antes, con máximo a la vez y aprobación', () => {
  const pasos = lineaDeTiempoReserva({ ...estudio, reservaAntelacionMaximaDias: 2, reservaVentanaMinimaMinutos: 30, reservaMaxSimultaneas: 3, requiereAprobacion: true }, JUEVES_18);
  assert.equal(paso(pasos, 'abre').cuando, 'Desde el mar 29 · 18:00');
  assert.equal(paso(pasos, 'cierra').cuando, 'Hasta el jue 1 · 17:30');
  assert.match(paso(pasos, 'cierra').detalle, /Se cierra 30 min antes · como mucho 3 a la vez · .* · la apruebas tú/);
});

test('sin plazo de cancelación no hay «cancela tarde»', () => {
  const pasos = lineaDeTiempoReserva({ ...estudio, cancelacionVentanaHoras: 0 }, JUEVES_18);
  assert.equal(pasos.some(p => p.id === 'cancela-tarde'), false);
  assert.equal(paso(pasos, 'cancela-a-tiempo').cuando, 'Hasta que empieza');
});

test('sin lista de espera, lo dice', () => {
  const pasos = lineaDeTiempoReserva({ ...estudio, permiteListaEspera: false }, JUEVES_18);
  assert.equal(paso(pasos, 'llena').que, 'No puede apuntarse');
  assert.equal(paso(pasos, 'llena').tono, 'aviso');
});

test('el cargo sale solo si se aplica de verdad', () => {
  const conCargo = { ...estudio, penalizacionImporteEur: 5, penalizacionCobroAutomatico: true };
  assert.match(paso(lineaDeTiempoReserva(conCargo, JUEVES_18), 'cancela-tarde').detalle, /se le cobran 5 €\./);
  assert.match(paso(lineaDeTiempoReserva(conCargo, JUEVES_18), 'dia').detalle, /Si no viene, se le cobran 5 €/);
  const soloTarde = { ...conCargo, penalizacionAplicaNoShow: false };
  assert.doesNotMatch(paso(lineaDeTiempoReserva(soloTarde, JUEVES_18), 'dia').detalle, /cobran/);
});

test('las reglas del tipo mandan si las tiene; NULL hereda del estudio', () => {
  const r = reglasEfectivasDeTipo(estudio, { id: 't', nombre: 'HIIT', ventanaCancelacionHoras: 24, permiteListaEspera: null });
  assert.equal(r.cancelacionVentanaHoras, 24);
  assert.equal(r.permiteListaEspera, estudio.permiteListaEspera);
  assert.equal(paso(lineaDeTiempoReserva(r, JUEVES_18), 'cancela-a-tiempo').cuando, 'Hasta el mié 30 · 18:00');
});

test('un cargo propio distinto del del estudio no se promete (no se cobra nunca)', () => {
  const e = { ...estudio, penalizacionImporteEur: 5 };
  assert.equal(reglasEfectivasDeTipo(e, { id: 't', nombre: 'X', penalizacionImporteEur: 8 }).penalizacionImporteEur, 0);
  assert.equal(reglasEfectivasDeTipo(e, { id: 't', nombre: 'X', penalizacionImporteEur: 5 }).penalizacionImporteEur, 5);
  assert.equal(reglasEfectivasDeTipo(e, { id: 't', nombre: 'X', penalizacionImporteEur: 0 }).penalizacionImporteEur, 0);
});

test('la clase de ejemplo: la próxima de verdad que valga, o un jueves a las 18:00', () => {
  const ahora = new Date('2026-09-30T10:00:00Z'); // miércoles
  const sesiones = [
    { inicio: '2026-09-29T16:00:00Z', cancelada: false, tipoClaseId: 'a' }, // pasada
    { inicio: '2026-10-02T08:00:00Z', cancelada: true, tipoClaseId: 'a' },  // cancelada
    { inicio: '2026-10-03T08:00:00Z', cancelada: false, tipoClaseId: 'b' },
    { inicio: '2026-10-05T08:00:00Z', cancelada: false, tipoClaseId: 'a' },
  ];
  const nombre = (id: string) => ({ a: 'Reformer', b: 'Mat' } as Record<string, string>)[id] ?? null;
  assert.deepEqual(claseDeEjemplo(sesiones, nombre, ahora).nombre, 'Mat');
  const soloA = claseDeEjemplo(sesiones, nombre, ahora, id => id === 'a');
  assert.equal(soloA.nombre, 'Reformer');
  assert.equal(soloA.inicio.toISOString(), '2026-10-05T08:00:00.000Z');
  const ejemplo = claseDeEjemplo([], nombre, ahora);
  assert.equal(ejemplo.deEjemplo, true);
  assert.equal(instante(ejemplo.inicio), 'jue 1 · 18:00');
  // En invierno también son las 18:00 de Madrid.
  assert.equal(instante(claseDeEjemplo([], nombre, new Date('2026-12-01T10:00:00Z')).inicio), 'jue 3 · 18:00');
});

test('qué cambia cada tipo, en palabras (y nada si no cambia)', () => {
  const t = { id: 't', nombre: 'HIIT', ventanaCancelacionHoras: 24, permiteListaEspera: false, reservaAntelacionMaximaDias: 7 };
  assert.equal(queCambiaElTipo('cancelar-y-recuperar', t, estudio), 'cancela gratis hasta 24 h antes');
  assert.equal(queCambiaElTipo('lista-de-espera', t, estudio), 'sin lista de espera');
  assert.equal(queCambiaElTipo('reservar', t, estudio), 'se abre 7 días antes');
  assert.equal(queCambiaElTipo('asistencia', t, estudio), null);
  // Un valor propio igual al del estudio no cambia nada.
  assert.equal(queCambiaElTipo('cancelar-y-recuperar', { id: 'u', nombre: 'U', ventanaCancelacionHoras: 12 }, estudio), null);
});

test('clases por semana: lo que pone cada plan activo', () => {
  assert.equal(resumenClasesPorSemana([
    { nombre: 'Mensual 2', limiteSemanal: 2 }, { nombre: 'Bono 10', limiteSemanal: null }, { nombre: 'Viejo', limiteSemanal: 1, activo: false },
  ]), 'Mensual 2 2×/semana · 1 plan más sin tope');
  assert.equal(resumenClasesPorSemana([{ nombre: 'Bono', limiteSemanal: null }]), 'Ningún plan pone tope');
  assert.equal(resumenClasesPorSemana([]), null);
});
