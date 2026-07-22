import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Automatizacion, AutomationLog, Socio, Suscripcion, Reserva, Cita } from '@/lib/types';
import { computeAutomatizacionMktCandidatos } from './marketing-automation-engine.ts';

const NOW = new Date('2026-07-13T12:00:00.000Z');
const diasAntes = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const diasDespues = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

let n = 0;
const socio = (p: Partial<Socio> & Pick<Socio, 'id'>): Socio =>
  ({ studioId: 'e1', nombre: 'Ana', apellidos: 'G', email: `a${p.id}@x.com`, telefono: null, nif: null, fechaAlta: diasAntes(100), activo: true, ...p });
const auto = (trigger: Automatizacion['trigger'], p: Partial<Automatizacion> = {}): Automatizacion =>
  ({ id: `auto-${trigger}`, studioId: 'e1', nombre: trigger, trigger, accion: 'EMAIL', asunto: 'Hola {nombre}', mensaje: 'Mensaje para {nombre}', activa: true, ejecutadas: 0, creadaEn: diasAntes(1), ...p });
const sus = (socioId: string, p: Partial<Suscripcion> = {}): Suscripcion =>
  ({ id: `sus-${++n}`, studioId: 'e1', socioId, planId: 'p', estado: 'ACTIVA', fechaInicio: diasAntes(30), fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p });
const reserva = (socioId: string, estado: Reserva['estado'], creadoEn: string): Reserva =>
  ({ id: `r-${++n}`, studioId: 'e1', socioId, sesionId: 's', estado, spotId: null, posicionEspera: null, checkInEn: null, creadoEn });
// S-2: el log de marketing lleva el id en `automatizacionId`, su columna propia.
// Antes iba en `ruleId`, que tenía FK a automation_rules y rechazaba el insert.
const log = (automatizacionId: string, socioId: string, ejecutadoEn: string): AutomationLog =>
  ({ id: `l-${++n}`, studioId: 'e1', ruleId: null, automatizacionId, ruleName: '', socioId, socioNombre: '', pasoIndex: 0, accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', detalle: '', ejecutadoEn, proximaAccionEn: null, reciboId: null });

function run(input: Partial<Parameters<typeof computeAutomatizacionMktCandidatos>[0]>) {
  return computeAutomatizacionMktCandidatos({
    automatizaciones: [], automationLogs: [], socios: [], suscripciones: [], reservas: [], citas: [] as Cita[], ...input,
  }, NOW);
}

test('CUMPLEANOS: socia que cumple hoy dispara, con {nombre} personalizado', () => {
  const s = socio({ id: '1', nombre: 'Lucía', fechaNacimiento: '1990-07-13' });
  const c = run({ automatizaciones: [auto('CUMPLEANOS')], socios: [s] });
  assert.equal(c.length, 1);
  assert.equal(c[0].asunto, 'Hola Lucía');
  assert.equal(c[0].mensaje, 'Mensaje para Lucía');
});

test('SUSCRIPCION_EXPIRA_7D: activa que vence en 5 días dispara; en 20 no', () => {
  const s1 = socio({ id: '1' }), s2 = socio({ id: '2' });
  const c = run({ automatizaciones: [auto('SUSCRIPCION_EXPIRA_7D')], socios: [s1, s2], suscripciones: [sus('1', { fechaFin: diasDespues(5) }), sus('2', { fechaFin: diasDespues(20) })] });
  assert.deepEqual(c.map(x => x.socio.id), ['1']);
});

test('INACTIVIDAD_30D: última asistencia hace 50 días dispara; hace 40 no (umbral subido a 45)', () => {
  const s1 = socio({ id: '1' }), s2 = socio({ id: '2' });
  const c = run({ automatizaciones: [auto('INACTIVIDAD_30D')], socios: [s1, s2], reservas: [reserva('1', 'ASISTIDA', diasAntes(50)), reserva('2', 'ASISTIDA', diasAntes(40))] });
  assert.deepEqual(c.map(x => x.socio.id), ['1']);
});

test('BONO_QUEDA_1 y BONO_AGOTADO leen sesionesRestantes', () => {
  const c1 = run({ automatizaciones: [auto('BONO_QUEDA_1')], socios: [socio({ id: '1' })], suscripciones: [sus('1', { sesionesRestantes: 1 })] });
  assert.equal(c1.length, 1);
  const c0 = run({ automatizaciones: [auto('BONO_AGOTADO')], socios: [socio({ id: '1' })], suscripciones: [sus('1', { sesionesRestantes: 0 })] });
  assert.equal(c0.length, 1);
});

test('dedup: no reenvía si ya hay log reciente de esa automatización+socia', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = run({ automatizaciones: [auto('CUMPLEANOS')], socios: [s], automationLogs: [log('auto-CUMPLEANOS', '1', diasAntes(10))] });
  assert.equal(c.length, 0);
});

test('solo dispara automatizaciones ACTIVAS; NOTIFICACION genera candidata de canal interno', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  assert.equal(run({ automatizaciones: [auto('CUMPLEANOS', { activa: false })], socios: [s] }).length, 0);
  // NOTIFICACION no exige email/teléfono: el envío real crea un aviso interno,
  // no toca a la socia (ver lib/inngest/automatizaciones.ts).
  const c = run({ automatizaciones: [auto('CUMPLEANOS', { accion: 'NOTIFICACION' })], socios: [s] });
  assert.equal(c.length, 1);
  assert.equal(c[0].canal, 'NOTIFICACION');
});

test('canal WHATSAPP: emite con canal WHATSAPP solo si la socia tiene teléfono', () => {
  const sinTel = socio({ id: '1', fechaNacimiento: '1990-07-13', telefono: null });
  assert.equal(run({ automatizaciones: [auto('CUMPLEANOS', { accion: 'WHATSAPP' })], socios: [sinTel] }).length, 0);

  const conTel = socio({ id: '2', fechaNacimiento: '1990-07-13', telefono: '612345678' });
  const c = run({ automatizaciones: [auto('CUMPLEANOS', { accion: 'WHATSAPP' })], socios: [conTel] });
  assert.equal(c.length, 1);
  assert.equal(c[0].canal, 'WHATSAPP');
  assert.equal(c[0].asunto, 'Hola Ana');
});

test('canal EMAIL (por defecto) exige email, no teléfono', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = run({ automatizaciones: [auto('CUMPLEANOS')], socios: [s] });
  assert.equal(c.length, 1);
  assert.equal(c[0].canal, 'EMAIL');
});

test('CITA_RECORDATORIO: cita de mañana dispara', () => {
  const s = socio({ id: '1' });
  const cita: Cita = { id: 'c1', studioId: 'e1', socioId: '1', instructorId: 'i', tipo: 'PRIVADA', inicio: diasDespues(1), fin: diasDespues(1), notas: null, estado: 'CONFIRMADA', precio: null, pagada: false, creadoEn: diasAntes(1) };
  const c = run({ automatizaciones: [auto('CITA_RECORDATORIO')], socios: [s], citas: [cita] });
  assert.equal(c.length, 1);
});
