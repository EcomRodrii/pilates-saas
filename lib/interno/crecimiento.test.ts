import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparPeticiones, deDondeVienen, loQueQuemaHoy, resumirEmbudo, validarLead,
  type Lead, type Peticion,
} from './crecimiento.ts';

const HOY = Date.parse('2026-07-29T12:00:00Z');
const haceDias = (n: number) => new Date(HOY - n * 86_400_000).toISOString();
const dia = (n: number) => new Date(HOY - n * 86_400_000).toISOString().slice(0, 10);

const lead = (o: Partial<Lead> & { id: string }): Lead => ({
  email: `${o.id}@ejemplo.com`, nombre: null, estudio: null, telefono: null, ciudad: null,
  softwareActual: null, mensaje: null, origen: 'CONCIERGE', estado: 'NUEVO',
  motivoPerdida: null, proximoPaso: null, proximaFecha: null, studioId: null, notas: null,
  creadoEn: haceDias(0), actualizadoEn: haceDias(0), ...o,
});

test('un lead nuevo de hoy no quema: la promesa es de 24h', () => {
  assert.equal(loQueQuemaHoy([lead({ id: 'a' })], HOY).length, 0);
});

test('un lead nuevo de hace 2 días sí quema: la promesa de 24h ya está rota', () => {
  const r = loQueQuemaHoy([lead({ id: 'a', creadoEn: haceDias(2) })], HOY);
  assert.equal(r.length, 1);
  assert.match(r[0].motivo, /hace 2 días y nadie le ha escrito/);
});

test('un siguiente paso vencido quema, y con el retraso en el motivo', () => {
  const r = loQueQuemaHoy([lead({ id: 'a', estado: 'DEMO', proximaFecha: dia(3) })], HOY);
  assert.equal(r.length, 1);
  assert.match(r[0].motivo, /venció hace 3 día/);
});

test('un siguiente paso en el futuro NO quema: está bajo control', () => {
  const futuro = new Date(HOY + 5 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(loQueQuemaHoy([lead({ id: 'a', estado: 'DEMO', proximaFecha: futuro })], HOY).length, 0);
});

test('un lead parado 20 días sin siguiente paso quema: así es como se mueren', () => {
  // No se pierden, se olvidan. Este es el caso que un CRM tiene que cazar.
  const r = loQueQuemaHoy([
    lead({ id: 'a', estado: 'CONTACTADO', creadoEn: haceDias(40), actualizadoEn: haceDias(20) }),
  ], HOY);
  assert.equal(r.length, 1);
  assert.match(r[0].motivo, /20 días parado/);
});

test('un cliente y un perdido no queman nunca, por muy viejos que sean', () => {
  const viejos = [
    lead({ id: 'a', estado: 'CLIENTE', creadoEn: haceDias(300), actualizadoEn: haceDias(300) }),
    lead({ id: 'b', estado: 'PERDIDO', creadoEn: haceDias(300), actualizadoEn: haceDias(300) }),
  ];
  assert.equal(loQueQuemaHoy(viejos, HOY).length, 0);
});

test('lo más retrasado sale primero', () => {
  const r = loQueQuemaHoy([
    lead({ id: 'poco', estado: 'DEMO', proximaFecha: dia(1) }),
    lead({ id: 'mucho', estado: 'DEMO', proximaFecha: dia(30) }),
  ], HOY);
  assert.deepEqual(r.map(x => x.lead.id), ['mucho', 'poco']);
});

test('la conversión se calcula sobre los CERRADOS, no sobre el total', () => {
  // Con los que siguen en curso dentro, el porcentaje subiría solo según se
  // vacía el embudo y no significaría nada.
  const e = resumirEmbudo([
    lead({ id: '1', estado: 'CLIENTE' }),
    lead({ id: '2', estado: 'PERDIDO', motivoPerdida: 'Precio' }),
    lead({ id: '3', estado: 'PERDIDO', motivoPerdida: 'Precio' }),
    lead({ id: '4', estado: 'NUEVO' }),
    lead({ id: '5', estado: 'DEMO' }),
  ]);
  assert.equal(e.conversion, 33, '1 ganado de 3 cerrados');
  assert.equal(e.enCurso, 2);
});

test('sin nada cerrado, la conversión es null y no 0%', () => {
  // 0% se lee como "no convertimos a nadie"; null es "todavía no se sabe".
  assert.equal(resumirEmbudo([lead({ id: '1', estado: 'NUEVO' })]).conversion, null);
});

test('los motivos de pérdida salen agrupados y de más a menos', () => {
  const e = resumirEmbudo([
    lead({ id: '1', estado: 'PERDIDO', motivoPerdida: 'Precio' }),
    lead({ id: '2', estado: 'PERDIDO', motivoPerdida: 'Se quedó en Momence' }),
    lead({ id: '3', estado: 'PERDIDO', motivoPerdida: 'Precio' }),
  ]);
  assert.deepEqual(e.motivosDePerdida, [
    { motivo: 'Precio', n: 2 },
    { motivo: 'Se quedó en Momence', n: 1 },
  ]);
});

test('«sin responder» no es un canal: se cuenta aparte', () => {
  // El campo es opcional en el alta. Meterlo en el reparto lo convertiría en el
  // canal ganador y no es ningún canal.
  const r = deDondeVienen([
    { comoNosConocio: 'Instagram' }, { comoNosConocio: 'Instagram' },
    { comoNosConocio: null }, { comoNosConocio: '  ' }, { comoNosConocio: 'Google' },
  ]);
  assert.deepEqual(r.canales, [{ canal: 'Instagram', n: 2 }, { canal: 'Google', n: 1 }]);
  assert.equal(r.sinResponder, 2);
  assert.equal(r.respondieron, 3);
});

test('las peticiones se agrupan por lo que piden, no por quién lo pide', () => {
  // La diferencia entre "Pilates Boutique escribió 4 veces" y "3 estudios
  // quieren ClassPass". Lo segundo se puede priorizar.
  const p = (o: Partial<Peticion> & { id: string }): Peticion => ({
    tipo: 'MEJORA', mensaje: 'x', contacto: null, estudio: null, creadoEn: haceDias(1), ...o,
  });
  const r = agruparPeticiones([
    p({ id: '1', mensaje: 'Quiero ClassPass', estudio: 'A', creadoEn: haceDias(10) }),
    p({ id: '2', mensaje: 'quiero  classpass', estudio: 'B', creadoEn: haceDias(2) }),
    p({ id: '3', mensaje: 'Quiero ClassPass', estudio: 'C', creadoEn: haceDias(5) }),
    p({ id: '4', mensaje: 'Quiero WhatsApp', estudio: 'A', creadoEn: haceDias(1) }),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].n, 3);
  assert.deepEqual(r[0].estudios, ['A', 'B', 'C']);
  assert.equal(r[0].ultima, haceDias(2), 'se queda la fecha más reciente del grupo');
  assert.equal(r[1].mensaje, 'Quiero WhatsApp');
});

test('una petición repetida por un solo estudio no adelanta a otra de tres', () => {
  const p = (o: Partial<Peticion> & { id: string }): Peticion => ({
    tipo: 'MEJORA', mensaje: 'x', contacto: null, estudio: null, creadoEn: haceDias(1), ...o,
  });
  const r = agruparPeticiones([
    p({ id: '1', mensaje: 'Insiste', estudio: 'A' }), p({ id: '2', mensaje: 'Insiste', estudio: 'A' }),
    p({ id: '3', mensaje: 'Insiste', estudio: 'A' }), p({ id: '4', mensaje: 'Insiste', estudio: 'A' }),
    p({ id: '5', mensaje: 'Consenso', estudio: 'X' }), p({ id: '6', mensaje: 'Consenso', estudio: 'Y' }),
    p({ id: '7', mensaje: 'Consenso', estudio: 'Z' }),
  ]);
  assert.equal(r[0].mensaje, 'Consenso', '3 estudios pesan más que 4 mensajes de uno');
});

test('un PERDIDO sin motivo no se guarda', () => {
  const r = validarLead({ email: 'a@b.com', estado: 'PERDIDO', motivoPerdida: '   ' });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /por qué se ha perdido/);
});

test('un PERDIDO con motivo sí, y un email inválido no', () => {
  assert.equal(validarLead({ email: 'a@b.com', estado: 'PERDIDO', motivoPerdida: 'Precio' }).ok, true);
  assert.equal(validarLead({ email: 'no-es-email', estado: 'NUEVO' }).ok, false);
});
