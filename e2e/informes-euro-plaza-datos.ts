import { expect, type Page, type Route } from '@playwright/test';
import { montar } from './panel-sembrado';

// Los datos del mapa de «€ por plaza» (pieza E) para su e2e: en el trimestre
// ANTERIOR al de hoy, para que valga cualquier día.

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const mes0 = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) * 3; // 0-based, primer mes del trimestre de hoy
const inicioTrimPasado = new Date(Date.UTC(Number(hoy.slice(0, 4)), mes0 - 3, 1, 12));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const horaMadrid = (d: Date) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(d));
/** El instante en que son las `hora`:00 en Madrid ese día (verano UTC+2, invierno UTC+1). */
function enMadrid(dia: Date, hora: number): string {
  for (const desfase of [2, 1]) {
    const d = new Date(Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), hora - desfase));
    if (horaMadrid(d) === hora) return d.toISOString();
  }
  throw new Error('sin hora');
}
/** El primer día de la semana `dow` (0 = domingo) desde el inicio del trimestre pasado, más `semanas`. */
function diaDe(dow: number, semanas: number): Date {
  const d = new Date(inicioTrimPasado);
  d.setUTCDate(d.getUTCDate() + ((dow - d.getUTCDay() + 7) % 7) + 7 * semanas);
  return d;
}
const cobroEn = ymd(new Date(inicioTrimPasado.getTime() + 5 * 86_400_000));

const SOCIOS = [
  { id: 'ana', nombre: 'Ana', apellidos: 'Ruiz' },
  { id: 'marta', nombre: 'Marta', apellidos: 'Gil' },
  { id: 'lucia', nombre: 'Lucía', apellidos: 'Sanz' },
].map(s => ({ ...s, studio_id: STUDIO_ID, email: `${s.id}@example.com`, telefono: null, activo: true, fecha_alta: '2026-01-01T09:00:00+00:00', lead_stage: 'ACTIVA', campos_extra: {}, tags: [] }));
const PLANES = [
  { id: 'pl-mensual', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true },
  { id: 'pl-bono', studio_id: STUDIO_ID, nombre: 'Bono 4', precio: 80, tipo: 'BONO', sesiones: 4, validez_dias: 90, activo: true },
  { id: 'pl-suelta', studio_id: STUDIO_ID, nombre: 'Clase suelta', precio: 10, tipo: 'PUNTUAL', sesiones: 1, validez_dias: 30, activo: true },
];
const sus = (id: string, socio: string, plan: string) => ({ id, studio_id: STUDIO_ID, socio_id: socio, plan_id: plan, estado: 'EXPIRADA', fecha_inicio: cobroEn, fecha_fin: cobroEn, sesiones_restantes: 0, stripe_subscription_id: null });
const SUSCRIPCIONES = [sus('sus-a', 'ana', 'pl-mensual'), sus('sus-m', 'marta', 'pl-bono'), sus('sus-l', 'lucia', 'pl-suelta')];
const rec = (id: string, socio: string | null, suscripcion: string | null, importe: number) => ({
  id, studio_id: STUDIO_ID, socio_id: socio, suscripcion_id: suscripcion, concepto: 'x', importe, estado: 'COBRADO',
  fecha_vencimiento: cobroEn, fecha_cobro: cobroEn, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'TARJETA',
});
// Ana 60 €, Marta 80 € y Lucía 40 € (4 clases cada una: 15, 20 y 10 € por plaza) y un ticket de caja de 50 €.
const RECIBOS = [rec('rec-a', 'ana', 'sus-a', 60), rec('rec-m', 'marta', 'sus-m', 80), rec('rec-l', 'lucia', 'sus-l', 40), rec('rec-pos-1', null, null, 50)];

const ses = (id: string, inicio: string) => ({
  id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-reformer', sala_id: 'sala-1', instructor_id: 'ins-cloe', inicio, fin: inicio,
  aforo_maximo: 6, cancelada: false, notas: null, google_event_id: null, serie_id: null, incidencia_texto: null,
  precio_puntual: null, zoom_meeting_id: null, zoom_join_url: null,
});
const res = (id: string, sesion: string, socio: string | null) => ({
  id, studio_id: STUDIO_ID, sesion_id: sesion, socio_id: socio, estado: 'ASISTIDA', spot_id: null, posicion_espera: null,
  oferta_expira_en: null, check_in_en: null, creado_en: cobroEn, confirmacion_pedida_en: null, confirmado_en: null,
  recordatorio_confirmacion_en: null, valoracion_experiencia: null, cancelada_tardia: false,
  ...(socio ? {} : { origen: 'CLASSPASS', nombre_externo: 'Reserva externa' }),
});
// Cuatro martes a las 18:00 con las tres; tres jueves a las 10:00 con una de ClassPass («—»).
const MARTES = [0, 1, 2, 3].map(i => ses(`m${i}`, enMadrid(diaDe(2, i), 18)));
const JUEVES = [0, 1, 2].map(i => ses(`j${i}`, enMadrid(diaDe(4, i), 10)));
const RESERVAS = [
  ...MARTES.flatMap(s => ['ana', 'marta', 'lucia'].map(a => res(`r-${s.id}-${a}`, s.id, a))),
  ...JUEVES.map(s => res(`r-${s.id}-cp`, s.id, null)),
];

/**
 * Un horario de verdad: 20 franjas (lunes a viernes a las 09:00, 10:30, 18:00 y
 * 19:30), 4 clases cada una y una alumna distinta en cada franja que paga entre
 * 20 € y 210 €: valores repartidos para ver los tres tonos de la escala.
 */
function horarioCompleto() {
  const socios: typeof SOCIOS = [];
  const recibos: ReturnType<typeof rec>[] = [];
  const sesiones: ReturnType<typeof ses>[] = [];
  const reservas: ReturnType<typeof res>[] = [];
  const suscripciones: ReturnType<typeof sus>[] = [];
  let k = 0;
  for (const dow of [1, 2, 3, 4, 5]) {
    for (const [hora, minuto] of [[9, 0], [10, 30], [18, 0], [19, 30]] as const) {
      k++;
      const alumna = `al-${k}`;
      socios.push({ ...SOCIOS[0], id: alumna, nombre: `Alumna ${k}`, apellidos: '', email: `${alumna}@example.com` });
      suscripciones.push(sus(`sus-${alumna}`, alumna, 'pl-bono'));
      recibos.push(rec(`rec-${alumna}`, alumna, `sus-${alumna}`, 10 + ((k * 37) % 20) * 10));
      for (let i = 0; i < 4; i++) {
        const iso = enMadrid(diaDe(dow, i), hora);
        const inicio = minuto ? new Date(new Date(iso).getTime() + minuto * 60_000).toISOString() : iso;
        const s = ses(`h${k}-${i}`, inicio);
        sesiones.push(s);
        reservas.push(res(`rh${k}-${i}`, s.id, alumna));
      }
    }
  }
  return { socios, recibos, sesiones, reservas, suscripciones };
}

export async function preparar(page: Page, opciones: { euroPlaza?: { status: number; body: unknown }; recibos500?: boolean; horarioCompleto?: boolean } = {}) {
  const peticiones = { euroPlaza: 0, recibos: 0 };
  await montar(page);
  const r = opciones.euroPlaza ?? { status: 200, body: { disponible: true } };
  await page.route((u) => u.pathname === '/api/informes/euro-plaza', (route) => {
    peticiones.euroPlaza++;
    return json(route, r.body, r.status);
  });
  const h = opciones.horarioCompleto ? horarioCompleto() : null;
  await page.route('**/rest/v1/socios**', (route) => json(route, h?.socios ?? SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', (route) => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', (route) => json(route, h?.suscripciones ?? SUSCRIPCIONES));
  await page.route('**/rest/v1/sesiones**', (route) => json(route, h?.sesiones ?? [...MARTES, ...JUEVES]));
  await page.route('**/rest/v1/reservas**', (route) => json(route, h?.reservas ?? RESERVAS));
  await page.route('**/rest/v1/recibos**', (route) => {
    peticiones.recibos++;
    return opciones.recibos500 ? json(route, { message: 'x' }, 500) : json(route, h?.recibos ?? RECIBOS);
  });
  return peticiones;
}

export const bloque = (page: Page) => page.getByTestId('bloque-euro-plaza');

/** Pulsa «Ver el trimestre pasado» sin esperar al mapa (cuando lo que sale es otro aviso). */
export async function alTrimestrePasadoDesdeAviso(page: Page) {
  await expect(bloque(page)).toBeVisible({ timeout: 30_000 });
  const boton = bloque(page).getByRole('button', { name: 'Ver el trimestre pasado' });
  if (await boton.count()) await boton.click();
}

export async function alTrimestrePasado(page: Page) {
  await expect(bloque(page)).toBeVisible({ timeout: 30_000 });
  await bloque(page).getByRole('button', { name: 'Ver el trimestre pasado' }).click();
  await expect(page.getByTestId('euro-plaza-mapa')).toBeVisible();
}
