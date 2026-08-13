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
  ({ id: `r-${++n}`, studioId: 'e1', socioId, sesionId: 's', estado, spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn });
// S-2: el log de marketing lleva el id en `automatizacionId`, su columna propia.
// Antes iba en `ruleId`, que tenía FK a automation_rules y rechazaba el insert.
const log = (automatizacionId: string, socioId: string, ejecutadoEn: string): AutomationLog =>
  ({ id: `l-${++n}`, studioId: 'e1', ruleId: null, automatizacionId, ruleName: '', socioId, socioNombre: '', pasoIndex: 0, accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO', detalle: '', ejecutadoEn, proximaAccionEn: null, reciboId: null });

// Por defecto, TODAS las socias del test tienen consentimiento vigente —
// así los tests existentes (escritos antes del guard de consentimiento)
// siguen probando lo que probaban. Los tests del guard en sí pasan su
// propio `consentimientosMarketing`/`textoConsentimientoVigente`.
const TEXTO_CONSENTIMIENTO_TEST = 'texto-consentimiento-vigente-en-el-test';
function consentirTodas(socios: Socio[]): Map<string, string> {
  return new Map(socios.map(s => [s.id, TEXTO_CONSENTIMIENTO_TEST]));
}

function run(input: Partial<Parameters<typeof computeAutomatizacionMktCandidatos>[0]>) {
  const socios = input.socios ?? [];
  return computeAutomatizacionMktCandidatos({
    automatizaciones: [], automationLogs: [], socios, suscripciones: [], reservas: [], citas: [] as Cita[],
    consentimientosMarketing: consentirTodas(socios),
    textoConsentimientoVigente: TEXTO_CONSENTIMIENTO_TEST,
    ...input,
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
  assert.equal(c[0].marcaInactividad, true, 'INACTIVIDAD_30D debe marcarse para el dedup cruzado');
});

// ── Dedup CRUZADO con AUSENCIA_DIAS (motor clásico) ────────────────────────────
// docs/marketing-solape-motores-diseno.md §2: los dos motores comparten
// automation_logs, marcados con el prefijo [INACTIVIDAD] en `detalle`.
test('INACTIVIDAD_30D: NO dispara si AUSENCIA_DIAS (motor clásico) ya avisó hace <72h', () => {
  const s = socio({ id: '1' });
  // Log del OTRO motor: con ruleId (no automatizacionId) — igual que escribe
  // procesarCandidato — y marcado con el prefijo compartido.
  const logCruzado: AutomationLog = {
    id: 'l-cruzado', studioId: 'e1', ruleId: 'rule-AUSENCIA_DIAS', automatizacionId: null,
    ruleName: '', socioId: '1', socioNombre: '', pasoIndex: 0, accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO',
    detalle: '[INACTIVIDAD] Email enviado a a1@x.com: "Te echamos de menos"',
    ejecutadoEn: diasAntes(0), proximaAccionEn: null, reciboId: null,
  };
  const c = run({
    automatizaciones: [auto('INACTIVIDAD_30D')], socios: [s],
    reservas: [reserva('1', 'ASISTIDA', diasAntes(50))],
    automationLogs: [logCruzado],
  });
  assert.equal(c.length, 0, 'el motor de marketing no debe pisar un aviso de inactividad reciente del motor clásico');
});

test('INACTIVIDAD_30D: SÍ dispara si el aviso de inactividad cruzado es antiguo (>72h)', () => {
  const s = socio({ id: '1' });
  const logCruzado: AutomationLog = {
    id: 'l-cruzado', studioId: 'e1', ruleId: 'rule-AUSENCIA_DIAS', automatizacionId: null,
    ruleName: '', socioId: '1', socioNombre: '', pasoIndex: 0, accion: 'ENVIAR_EMAIL', resultado: 'EJECUTADO',
    detalle: '[INACTIVIDAD] Email enviado a a1@x.com: "Te echamos de menos"',
    ejecutadoEn: diasAntes(30), proximaAccionEn: null, reciboId: null,
  };
  const c = run({
    automatizaciones: [auto('INACTIVIDAD_30D')], socios: [s],
    reservas: [reserva('1', 'ASISTIDA', diasAntes(50))],
    automationLogs: [logCruzado],
  });
  assert.equal(c.length, 1, 'pasada la ventana de gracia, las dos secuencias pueden convivir (caso de uso legítimo)');
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

// ── Guard de consentimiento de marketing (art. 7.4 RGPD) ───────────────────────
// docs/marketing-integrations-arquitectura.md §7: sin consentimiento vigente,
// EMAIL/WHATSAPP nunca disparan — NOTIFICACION (aviso interno) sí, porque no
// toca a la socia.
test('sin consentimiento de marketing → EMAIL no dispara', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = computeAutomatizacionMktCandidatos({
    automatizaciones: [auto('CUMPLEANOS')], automationLogs: [], socios: [s], suscripciones: [], reservas: [], citas: [],
    consentimientosMarketing: new Map(), // nadie ha consentido
    textoConsentimientoVigente: 'texto vigente',
  }, NOW);
  assert.equal(c.length, 0);
});

test('consentimiento con texto DESACTUALIZADO (cambió la cláusula) → no dispara', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = computeAutomatizacionMktCandidatos({
    automatizaciones: [auto('CUMPLEANOS')], automationLogs: [], socios: [s], suscripciones: [], reservas: [], citas: [],
    consentimientosMarketing: new Map([['1', 'texto viejo, antes de añadir una cláusula']]),
    textoConsentimientoVigente: 'texto nuevo, con la cláusula añadida',
  }, NOW);
  assert.equal(c.length, 0, 'un cambio en el texto de consentimiento invalida el consentimiento anterior, igual que AceptacionContrato.versionTexto');
});

test('consentimiento vigente (texto coincide) → EMAIL SÍ dispara', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = computeAutomatizacionMktCandidatos({
    automatizaciones: [auto('CUMPLEANOS')], automationLogs: [], socios: [s], suscripciones: [], reservas: [], citas: [],
    consentimientosMarketing: new Map([['1', 'texto vigente']]),
    textoConsentimientoVigente: 'texto vigente',
  }, NOW);
  assert.equal(c.length, 1);
});

test('sin consentimiento de marketing → NOTIFICACION (aviso interno) SÍ dispara, no toca a la socia', () => {
  const s = socio({ id: '1', fechaNacimiento: '1990-07-13' });
  const c = computeAutomatizacionMktCandidatos({
    automatizaciones: [auto('CUMPLEANOS', { accion: 'NOTIFICACION' })], automationLogs: [], socios: [s], suscripciones: [], reservas: [], citas: [],
    consentimientosMarketing: new Map(),
    textoConsentimientoVigente: 'texto vigente',
  }, NOW);
  assert.equal(c.length, 1);
  assert.equal(c[0].canal, 'NOTIFICACION');
});
