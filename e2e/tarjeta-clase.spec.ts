import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// P3.11 — qué se ve de cada alumna en la lista de una clase (diseño 22), tras
// `TARJETA_CLASE`. Apagado es lo de siempre aunque el estudio tenga algo
// guardado; encendido, cada pieza sale de lo que la propietaria eligió, y
// guardar en Configuración solo cambia algo si el servidor dice que sí (con
// contador de peticiones en el camino de fallo).
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const STUDIO_ID = 'studio-test';
const UID = 'auth-e2e-duena';
// `ses-3` del panel sembrado: una clase de mañana (hora de Madrid).
const SESION = 'ses-3';

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

// Mañana en Madrid, 'MM-DD': el cumpleaños de Carmen cae el día de la clase.
const manana = (() => {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(5, 10);
})();

const TODO = { conQueViene: true, confirmacion: true, cumpleanos: true, notaFijada: true, primeraVez: true, salud: 'adaptar' };

const reserva = (id: string, socioId: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, sesion_id: SESION, socio_id: socioId, estado: 'CONFIRMADA', spot_id: null,
  posicion_espera: null, oferta_expira_en: null, check_in_en: null, creado_en: '2026-09-01T09:00:00Z',
  confirmacion_pedida_en: null, confirmado_en: null, recordatorio_confirmacion_en: null,
  valoracion_experiencia: null, cancelada_tardia: null, bono_suscripcion_id: null, ...extra,
});

const socia = (id: string, nombre: string, apellidos: string, lead: string, cumple: string | null) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos, email: `${id}@example.com`, telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', lead_stage: lead, campos_extra: {}, tags: [], cumple_mm_dd: cumple,
});

async function abrirClase(page: Page, o: { encendido: boolean; tarjeta: unknown; recepcion?: boolean }) {
  await montar(page);
  // Registradas DESPUÉS de `montar`: ganan a sus comodines.
  let preguntas = 0;
  let semaforos = 0;
  let condiciones = 0;
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => {
    preguntas++;
    return json(r, { filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false, tarjetaClase: o.encendido });
  });
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: o.recepcion ? 'otra-cuenta' : UID,
    email: 'cloe@example.com', moneda: 'EUR', tarjeta_clase: o.tarjeta,
  }));
  if (o.recepcion) {
    // Recepción: el estudio es de otra cuenta y la ficha del equipo con este usuario tiene rol RECEPCION.
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-rec', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', color: '#8B7355', auth_user_id: UID },
    ]));
    // A recepción el color le llega por la RPC, nunca las condiciones.
    await page.route('**/rest/v1/rpc/semaforo_salud_estudio**', (r) => {
      semaforos++;
      return json(r, [{ socio_id: 'soc-1', nivel: 'AMBAR' }]);
    });
  }
  await page.route('**/rest/v1/socios**', (r) => json(r, [
    socia('soc-1', 'María', 'García Fernández', 'ACTIVA', null),
    socia('soc-2', 'Laura', 'Martín', 'ACTIVA', null),
    // De prueba y sin más reservas que esta: su primera vez.
    socia('soc-3', 'Carmen', 'Del Río Sánchez', 'PRUEBA', manana),
  ]));
  await page.route('**/rest/v1/reservas**', (r) => json(r, [
    reserva('res-maria', 'soc-1', { bono_suscripcion_id: 'sus-1' }),
    reserva('res-laura', 'soc-2', { confirmacion_pedida_en: '2026-09-01T10:00:00Z' }),
    reserva('res-carmen', 'soc-3'),
  ]));
  await page.route('**/rest/v1/notas_internas**', (r) => json(r, [{
    id: 'nota-1', studio_id: STUDIO_ID, socio_id: 'soc-1', texto: 'Trae su propia esterilla', tipo: 'NOTA',
    creado_en: '2026-09-01T09:00:00Z', autor_uid: UID, visibilidad: 'EQUIPO', fijada: true, editada_en: null,
  }, {
    // Privada y fijada: la propietaria puede leerla, pero la lista se mira en el iPad del mostrador.
    id: 'nota-2', studio_id: STUDIO_ID, socio_id: 'soc-2', texto: 'Asunto privado', tipo: 'NOTA',
    creado_en: '2026-09-02T09:00:00Z', autor_uid: 'otra-cuenta', visibilidad: 'PRIVADA', fijada: true, editada_en: null,
  }]));
  // Llega aunque el rol sea recepción (en producción la RLS se lo quita): así se
  // prueba que la pantalla tampoco lo pintaría.
  await page.route('**/rest/v1/condiciones_salud**', (r) => (condiciones++, json(r, [{
    id: 'cs-1', studio_id: STUDIO_ID, socio_id: 'soc-1', categoria: 'LESION', etiqueta: 'Lesión de rodilla', zona: 'RODILLA',
    restricciones: ['EVITAR_FLEXION'], severidad: 'MEDIA', estado: 'ACTIVA', inicio: '2026-01-01', fin: null, revisar_en: null,
    notas: null, creado_por: null, creado_en: '2026-01-01T09:00:00Z', actualizado_en: '2026-01-01T09:00:00Z',
  }])));

  await ir(page, `calendario?sesion=${SESION}`);
  await expect(page.getByRole('link', { name: 'María García Fernández' })).toBeVisible({ timeout: 60_000 });
  return { preguntas: () => preguntas, semaforos: () => semaforos, condiciones: () => condiciones };
}

const filaDe = (page: Page, nombre: string) =>
  page.locator('li[data-reserva-id]', { has: page.getByRole('link', { name: nombre }) });

test.describe('Calendario · qué se ve de cada alumna (P3.11)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('apagado es lo de siempre, aunque el estudio tenga algo guardado', async ({ page }) => {
    const { preguntas } = await abrirClase(page, { encendido: false, tarjeta: { ...TODO, salud: 'nada' } });
    const maria = filaDe(page, 'María García Fernández');
    // Se preguntó de verdad por el interruptor: «no sale nada» no es por no haber mirado.
    await expect.poll(preguntas).toBeGreaterThan(0);
    // El punto de color de siempre (la salud llega en la carga diferida).
    await expect(maria.locator('[data-semaforo]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-pieza]')).toHaveCount(0);

    await ir(page, 'configuracion?tab=panel');
    await expect(page.getByText('Claro u oscuro').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('tarjeta-clase')).toHaveCount(0);
  });

  test('encendido, cada alumna con lo que eligió la propietaria', async ({ page }) => {
    await abrirClase(page, { encendido: true, tarjeta: TODO });
    const maria = filaDe(page, 'María García Fernández');
    const laura = filaDe(page, 'Laura Martín');
    const carmen = filaDe(page, 'Carmen Del Río Sánchez');

    await expect(maria.locator('[data-pieza="con-que-viene"]')).toHaveText('Bono 10 clases · le quedan 6', { timeout: 30_000 });
    // La nota y la salud llegan en cargas diferidas.
    await expect(maria.locator('[data-pieza="nota"]')).toHaveText('Nota: Trae su propia esterilla', { timeout: 30_000 });
    // Qué adaptar: la propietaria tiene la ficha clínica.
    await expect(maria.locator('[data-pieza="adaptar"]')).toContainText('Lesión de rodilla.', { timeout: 30_000 });
    await expect(maria.locator('[data-semaforo]')).toBeVisible();
    // Viene de otra plataforma con historial: nunca «primera vez».
    await expect(maria.locator('[data-pieza="primera-vez"]')).toHaveCount(0);

    await expect(laura.locator('[data-pieza="con-que-viene"]')).toHaveText('Con su Mensual ilimitado');
    // (Lleva «Atención:» delante para un lector de pantalla.)
    await expect(laura.locator('[data-pieza="confirmacion"]')).toContainText('Sin contestar');
    // Su nota fijada es PRIVADA: no sale en la lista.
    await expect(laura.locator('[data-pieza="nota"]')).toHaveCount(0);
    // A María no se le pidió confirmar: nada que decir.
    await expect(maria.locator('[data-pieza="confirmacion"]')).toHaveCount(0);

    await expect(carmen.locator('[data-pieza="primera-vez"]')).toHaveText('Primera vez');
    // La clase es mañana: «ese día», no «hoy».
    await expect(carmen.locator('[data-pieza="cumpleanos"]')).toHaveText('Cumple años ese día');
  });

  test('salud «nada» quita el punto de color', async ({ page }) => {
    await abrirClase(page, { encendido: true, tarjeta: { ...TODO, salud: 'nada' } });
    const maria = filaDe(page, 'María García Fernández');
    await expect(maria.locator('[data-pieza="con-que-viene"]')).toBeVisible({ timeout: 30_000 });
    // Antes de decir «no hay punto», esperar a que la salud HAYA llegado (la barra
    // «Adaptaciones» de la propietaria no depende de la tarjeta): si no, pasaría
    // aunque el ajuste se ignorase.
    await expect(page.getByText('1 clienta con notas de salud')).toBeVisible({ timeout: 30_000 });
    await expect(maria.locator('[data-semaforo]')).toHaveCount(0);
    await expect(maria.locator('[data-pieza="adaptar"]')).toHaveCount(0);
  });

  test('recepción: el color por su RPC y nunca «qué adaptar», aunque esté guardado y le llegaran los datos', async ({ page }) => {
    const { condiciones } = await abrirClase(page, { encendido: true, tarjeta: TODO, recepcion: true });
    const maria = filaDe(page, 'María García Fernández');
    // El punto llega por `semaforo_salud_estudio` (useSemaforoRecepcion), en otra carga.
    await expect(maria.locator('[data-semaforo]')).toBeVisible({ timeout: 30_000 });
    await expect(maria.locator('[data-pieza="con-que-viene"]')).toHaveText('Bono 10 clases · le quedan 6');
    await expect(maria.locator('[data-pieza="nota"]')).toHaveText('Nota: Trae su propia esterilla', { timeout: 30_000 });
    // Las condiciones se pidieron y llegaron (mal, a propósito): aun así, nada de «qué adaptar».
    await expect.poll(condiciones, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    await expect(maria.locator('[data-pieza="adaptar"]')).toHaveCount(0);
  });

  test('recepción con salud «nada»: sin punto de color', async ({ page }) => {
    const { semaforos } = await abrirClase(page, { encendido: true, tarjeta: { ...TODO, salud: 'nada' }, recepcion: true });
    const maria = filaDe(page, 'María García Fernández');
    await expect(maria.locator('[data-pieza="con-que-viene"]')).toBeVisible({ timeout: 30_000 });
    // El color se pidió (y llegó): que se pinta cuando toca lo prueba el test de arriba,
    // con el mismo andamiaje. Aquí, un segundo de margen para que su respuesta se aplique.
    await expect.poll(semaforos, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1_000);
    await expect(maria.locator('[data-semaforo]')).toHaveCount(0);
  });
});

async function abrirConfiguracion(page: Page, respuesta: { status: number; body: unknown }) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false, tarjetaClase: true,
  }));
  const envios: unknown[] = [];
  await page.route((u) => u.pathname === '/api/estudio/tarjeta-clase', (r) => {
    envios.push(r.request().postDataJSON());
    return json(r, respuesta.body, respuesta.status);
  });
  await ir(page, 'configuracion?tab=panel');
  const tarjeta = page.getByTestId('tarjeta-clase');
  await expect(tarjeta).toBeVisible({ timeout: 60_000 });
  return { tarjeta, envios };
}

test.describe('Configuración · Quién viene a cada clase (P3.11)', () => {
  test.describe.configure({ timeout: 180_000 });

  test('se elige con la vista previa delante y se guarda lo que contesta el servidor', async ({ page }) => {
    const elegida = { conQueViene: true, confirmacion: false, cumpleanos: false, notaFijada: false, primeraVez: false, salud: 'color' };
    const { tarjeta, envios } = await abrirConfiguracion(page, { status: 200, body: { tarjeta: elegida } });
    const previa = tarjeta.getByTestId('vista-previa-tarjeta');

    // Lo de serie: nada debajo del nombre, y el punto de color.
    await expect(previa.locator('[data-pieza]')).toHaveCount(0);
    await expect(tarjeta.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    await tarjeta.getByRole('switch', { name: 'Con qué viene' }).click();
    await expect(previa.locator('[data-pieza="con-que-viene"]')).toHaveText('Bono 10 clases · le quedan 3');
    expect(envios).toHaveLength(0);

    await tarjeta.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Guardado. En otros dispositivos se verá al recargar el Calendario')).toBeVisible();
    expect(envios).toEqual([elegida]);
    await expect(tarjeta.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  test('si el servidor dice que no, lo dice y no da nada por guardado', async ({ page }) => {
    const { tarjeta, envios } = await abrirConfiguracion(page, { status: 403, body: { error: 'Solo la propietaria puede cambiar esto' } });

    await tarjeta.getByRole('radio', { name: /Qué adaptar/ }).check();
    await tarjeta.getByRole('button', { name: 'Guardar' }).click();

    await expect(tarjeta.getByRole('alert')).toHaveText('Solo la propietaria puede cambiar esto');
    // El intento SALIÓ de verdad: sin esto el test sería hueco.
    expect(envios.length).toBeGreaterThan(0);
    await expect(page.getByText(/^Guardado\./)).toHaveCount(0);
    // Sigue pendiente de guardar: no finge que se guardó.
    await expect(tarjeta.getByRole('button', { name: 'Guardar' })).toBeEnabled();
    await expect(tarjeta.getByRole('button', { name: 'Descartar' })).toBeVisible();
  });
});
