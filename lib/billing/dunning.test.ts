import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planificarTrasFallo, primerReintentoISO, sumarDiasISO, debeAutoCancelarSuscripcion, MAX_REINTENTOS, OFFSETS_REINTENTO_DIAS } from './dunning.ts';

const VENC = '2026-07-01';
// Cuándo se registra cada fallo en el caso normal: en el barrido de su día
// (08:30 UTC), unos segundos después de que el dispatcher tomase su `nowISO`.
// Con un `ahora` de las 00:00 del vencimiento —lo que usaban estos tests antes—
// la base caía en el vencimiento y se escondía el desliz de cada reintento.
const FALLO_DIA_1 = '2026-07-02T08:30:15.986Z';
const FALLO_DIA_3 = '2026-07-04T08:30:15.986Z';
const FALLO_DIA_7 = '2026-07-08T08:30:15.986Z';

test('primer reintento se programa al día +1 del vencimiento', () => {
  assert.equal(primerReintentoISO(VENC), '2026-07-02T00:00:00.000Z');
});

test('1er fallo → intentos=1, sigue PENDIENTE, próximo reintento el día +3 del vencimiento, marcado como primer fallo', () => {
  const p = planificarTrasFallo(0, VENC, FALLO_DIA_1);
  assert.equal(p.intentos, 1);
  assert.equal(p.estado, 'PENDIENTE');
  assert.equal(p.proximoReintento, '2026-07-04T00:00:00.000Z'); // +3, a las 00:00 UTC
  assert.equal(p.esPrimerFallo, true);
  assert.equal(p.esDefinitivo, false);
});

test('2.º fallo → intentos=2, PENDIENTE, próximo reintento el día +7 del vencimiento, no es primer fallo ni definitivo', () => {
  const p = planificarTrasFallo(1, VENC, FALLO_DIA_3);
  assert.equal(p.intentos, 2);
  assert.equal(p.estado, 'PENDIENTE');
  assert.equal(p.proximoReintento, '2026-07-08T00:00:00.000Z'); // +7 del vencimiento, no +7 del fallo
  assert.equal(p.esPrimerFallo, false);
  assert.equal(p.esDefinitivo, false);
});

test('3.er fallo → intentos=3, FALLIDO, sin próximo reintento, es definitivo', () => {
  const p = planificarTrasFallo(2, VENC, FALLO_DIA_7);
  assert.equal(p.intentos, 3);
  assert.equal(p.estado, 'FALLIDO');
  assert.equal(p.proximoReintento, null);
  assert.equal(p.esPrimerFallo, false);
  assert.equal(p.esDefinitivo, true);
});

test('hay exactamente 3 intentos antes de FALLIDO', () => {
  assert.equal(MAX_REINTENTOS, 3);
  assert.equal(OFFSETS_REINTENTO_DIAS.length, 3);
  // simulación completa desde 0 fallos
  let intentos = 0;
  const estados: string[] = [];
  for (const fallo of [FALLO_DIA_1, FALLO_DIA_3, FALLO_DIA_7]) {
    const p = planificarTrasFallo(intentos, VENC, fallo);
    intentos = p.intentos;
    estados.push(p.estado);
  }
  assert.deepEqual(estados, ['PENDIENTE', 'PENDIENTE', 'FALLIDO']);
});

test('intentos_reintento negativo o nulo se normaliza (defensivo)', () => {
  const p = planificarTrasFallo(-5, VENC, FALLO_DIA_1);
  assert.equal(p.intentos, 1);
  assert.equal(p.esPrimerFallo, true);
});

test('el reintento no depende de la hora del fallo dentro de su día, ni hereda los segundos del barrido', () => {
  for (const fallo of ['2026-07-02T00:00:00.000Z', FALLO_DIA_1, '2026-07-02T23:59:59.999Z']) {
    assert.equal(planificarTrasFallo(0, VENC, fallo).proximoReintento, '2026-07-04T00:00:00.000Z', `fallo a las ${fallo}`);
  }
});

// ── La hora del cron y la regla de «vencido» ─────────────────────────────────
//
// El barrido coge los recibos con `proximo_reintento <= nowISO`, y `nowISO` lo
// toma el dispatcher al dispararse su cron (lib/inngest/dunning.ts). Un
// reintento del día D tiene que estar vencido ANTES de que pase el barrido de
// D: si cae unos segundos después, ese barrido no lo ve y se va a D+1. Es lo
// que pasaba hasta el 2-oct-2026, porque llevaba la hora del fallo (08:30:15
// contra un `nowISO` de 08:30:02) — en producción, el +3 se cobró el +5.
// El cron se lee del fuente, mismo idioma que lib/inngest/crons-cadencia.test.ts:
// ese fichero arrastra Supabase y Stripe y no se puede importar aquí.

const RAIZ = join(import.meta.dirname, '../..');

function horaDelBarrido(): string {
  const fuente = readFileSync(join(RAIZ, 'lib/inngest/dunning.ts'), 'utf8');
  const cron = fuente.match(/id:\s*'dunning-dispatcher'[^}]*?cron:\s*'([^']+)'/)?.[1];
  assert.ok(cron, 'no encuentro el cron de dunning-dispatcher en lib/inngest/dunning.ts');
  const [minuto, hora, ...resto] = cron.split(' ');
  assert.ok(/^\d+$/.test(minuto) && /^\d+$/.test(hora) && resto.join(' ') === '* * *',
    `el barrido tiene que pasar una vez al día a una hora fija; si cambia la forma del cron ('${cron}'), hay que revisar cómo se programa el reintento`);
  return `${hora.padStart(2, '0')}:${minuto.padStart(2, '0')}:00.000Z`;
}

/** El primer `nowISO` posible del barrido de ese día: la hora exacta del cron. */
const barridoDe = (dia: string) => `${dia}T${horaDelBarrido()}`;

test('el reintento está vencido para el barrido de su día y no para el del día anterior', () => {
  for (const [intentosPrevios, diaDelFallo, objetivo] of [
    [0, '2026-07-02', '2026-07-04'],
    [1, '2026-07-04', '2026-07-08'],
  ] as const) {
    // Justo detrás del barrido (lo normal), a mediodía, al filo de la medianoche
    // y a las 00:00 (una devolución SEPA llega a cualquier hora).
    for (const hora of [horaDelBarrido().replace(':00.000Z', ':15.986Z'), '12:00:00.000Z', '23:59:59.999Z', '00:00:00.000Z']) {
      const { proximoReintento } = planificarTrasFallo(intentosPrevios, VENC, `${diaDelFallo}T${hora}`);
      assert.ok(proximoReintento, 'no es el fallo definitivo');
      assert.equal(proximoReintento.slice(0, 10), objetivo, `fallo ${intentosPrevios + 1} a las ${hora}: el reintento va el día ${objetivo}`);
      // Con una hora de margen, no con igualdad: un cron a las 00:00 coincidiría con
      // la hora del reintento y cualquier desfase de reloj se lo saltaría.
      assert.ok(Date.parse(barridoDe(objetivo)) - Date.parse(proximoReintento) >= 3_600_000,
        `${proximoReintento} no está vencido con margen a las ${barridoDe(objetivo)}: el barrido de su día no lo vería y se iría al siguiente`);
      assert.ok(proximoReintento > barridoDe(sumarDiasISO(objetivo, -1).slice(0, 10)), 'el barrido del día anterior no lo puede coger');
    }
  }
});

/**
 * Los días (contados desde el vencimiento) en que el barrido intenta cobrar un
 * recibo cuya tarjeta nunca entra. Un barrido al día a la hora del cron, con su
 * `nowISO` unos segundos tarde, y el rechazo registrado unos segundos después.
 */
function diasDeLosIntentos(venc: string, primerIntentoISO: string): number[] {
  let intentos = 0;
  let proximo: string | null = primerIntentoISO;
  const dias: number[] = [];
  for (let d = 0; d <= 60 && proximo !== null; d++) {
    const nowISO = new Date(Date.parse(barridoDe(sumarDiasISO(venc, d).slice(0, 10))) + 2_000).toISOString();
    if (proximo > nowISO) continue;
    dias.push(d);
    const plan = planificarTrasFallo(intentos, venc, new Date(Date.parse(nowISO) + 13_000).toISOString());
    intentos = plan.intentos;
    proximo = plan.proximoReintento;
  }
  return dias;
}

test('ciclo completo con el barrido diario: intentos los días +1, +3 y +7 del vencimiento', () => {
  // La renovación crea el recibo a las 08:00 del día siguiente a `fecha_fin` y
  // lo deja listo para el barrido de esa mañana (lib/inngest/renovaciones.ts).
  assert.deepEqual(diasDeLosIntentos(VENC, '2026-07-02T08:00:00.000Z'), [1, 3, 7], 'antes salían el +1, el +5 y el +13');
});

test('vencimiento ya pasado → los intentos guardan su separación desde el primero, no colapsan (#353)', () => {
  // Una renovación adoptada 20 días tarde (la socia guardó la tarjeta después):
  // venc+3 y venc+7 ya pasaron, y sin suelo el barrido gastaría los dos
  // reintentos en los dos días siguientes.
  assert.deepEqual(diasDeLosIntentos(VENC, '2026-07-21T08:00:00.000Z'), [20, 22, 26]);
  // Uno de hace años, contado a mano.
  const vencPasado = '2024-01-01';
  const f1 = planificarTrasFallo(0, vencPasado, '2026-07-25T10:00:00.000Z');
  assert.equal(f1.proximoReintento, '2026-07-27T00:00:00.000Z'); // 2 días después del primer intento
  const f2 = planificarTrasFallo(1, vencPasado, '2026-07-27T08:30:15.000Z');
  assert.equal(f2.proximoReintento, '2026-07-31T00:00:00.000Z'); // y 4 después del segundo
});

test('devolución SEPA que llega días después del adeudo → el reintento nunca va antes de su separación', () => {
  // El adeudo del +1 lo devuelve el banco el +6 por la tarde: venc+3 ya pasó, y
  // se reintenta 2 días después de saberlo, no al día siguiente.
  assert.equal(planificarTrasFallo(0, VENC, '2026-07-07T14:00:00.000Z').proximoReintento, '2026-07-09T00:00:00.000Z');
  // El de ese +8 vuelve el +14 a las 23:30 UTC (ya el +15 en Madrid): 4 días después.
  assert.equal(planificarTrasFallo(1, VENC, '2026-07-15T23:30:00.000Z').proximoReintento, '2026-07-19T00:00:00.000Z');
});

// Hallazgo A (auditoría dunning 2026-08-10): condición pura de auto-cancelación
// tras agotar los 3 reintentos — el efecto (UPDATE en `suscripciones`) vive en
// dunning-server.ts (no testeable con `node --test` por la cascada de imports
// '@/...' en impago-server.ts/sellar-factura-server.ts, fuera de alcance de
// este cambio), así que esta es la parte que sí queda cubierta por test.
test('auto-cancelación: solo en el fallo definitivo Y con suscripción asociada', () => {
  const definitivo = planificarTrasFallo(2, VENC, FALLO_DIA_7); // 3.er fallo
  const noDefinitivo = planificarTrasFallo(0, VENC, FALLO_DIA_1); // 1.er fallo

  assert.equal(debeAutoCancelarSuscripcion(definitivo, 'sus-1'), true);
  assert.equal(debeAutoCancelarSuscripcion(noDefinitivo, 'sus-1'), false, 'un fallo intermedio no cancela nada');
  assert.equal(debeAutoCancelarSuscripcion(definitivo, null), false, 'sin suscripción asociada (p.ej. una penalización) no hay nada que cancelar');
  assert.equal(debeAutoCancelarSuscripcion(definitivo, undefined), false);
});
