import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { montar, ir, enOscuro } from './panel-sembrado';
import { recolectarScripts } from './recolector-scripts';

// ─────────────────────────────────────────────────────────────────────────────
// «Pregúntale a Tentare» — la interfaz (PR D de la fase 1).
//
//   · Las puertas: la barra bajo el h1 del Centro de Control y la fila de ⌘K
//     (primera si lo escrito parece una pregunta). Sin rol, sin plan o con el
//     servidor apagado para el estudio, no se pintan.
//   · El panel: la pregunta como línea de contexto, el texto con los nombres
//     que llegan aparte (evento `referencias`) y las tarjetas (métricas, clases
//     con BarraPlazas). Tenti en la cabecera, por momentos.
//   · Los errores con su texto exacto: sin saldo, la IA no responde, la red se
//     corta. Cada caso cuenta sus peticiones (`expect(n).toBeGreaterThan(0)`):
//     un «no mintió» sin intento no prueba nada.
//   · El panel no viaja con el Centro de Control: llega al abrirlo.
//
// Nunca se llama a Anthropic: POST /api/asistente va mockeado como NDJSON.
// Andamiaje: `panel-sembrado.ts`, y DESPUÉS los mocks de esta suite (gana la
// última ruta registrada).
// ─────────────────────────────────────────────────────────────────────────────

test.describe.configure({ timeout: 120_000 });

const STUDIO_ID = 'studio-test';
const UID = 'auth-e2e-duena';
const CONVERSACION = '4f1d2c3b-7a8e-4b9c-9d0e-1f2a3b4c5d6e';
/** Un literal que solo está en components/asistente/panel-asistente.tsx. */
const HUELLA_DEL_PANEL = 'Todavía no hago cambios: te digo dónde se hacen';

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });
const ndjson = (eventos: unknown[]) => eventos.map(e => JSON.stringify(e)).join('\n') + '\n';

const CLASES = [
  { sesionId: 'ses-a', hora: '08:00', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_2', ocupadas: 6, aforo: 8, enEspera: 0, senal: 'OK', motivo: null },
  { sesionId: 'ses-b', hora: '10:00', tipoClase: 'Mat', sala: 'Sala Pequeña', instructora: 'EQUIPO_1', ocupadas: 4, aforo: 8, enEspera: 0, senal: 'ATENCION', motivo: 'Va floja: 4 huecos' },
  { sesionId: 'ses-c', hora: '13:30', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_2', ocupadas: 7, aforo: 8, enEspera: 0, senal: 'OK', motivo: null },
  { sesionId: 'ses-d', hora: '18:00', tipoClase: 'Barre', sala: 'Sala Pequeña', instructora: '', ocupadas: 5, aforo: 10, enEspera: 0, senal: 'PROBLEMA', motivo: 'Sin instructora' },
  { sesionId: 'ses-e', hora: '19:00', tipoClase: 'Reformer', sala: 'Sala Grande', instructora: 'EQUIPO_1', ocupadas: 8, aforo: 8, enEspera: 3, senal: 'ATENCION', motivo: 'Llena, con 3 en espera' },
];

/** Una conversación de ejemplo: métricas, la lista de clases y el texto con una persona. */
const RESPUESTA = [
  { t: 'inicio', conversacionId: CONVERSACION, disponibles: 182 },
  { t: 'herramienta', id: 'tu_1', nombre: 'agenda_del_dia', etiqueta: 'Mirando la agenda del miércoles 7 de octubre…' },
  { t: 'referencias', refs: { EQUIPO_1: { nombre: 'Marta Ruiz', href: null }, EQUIPO_2: { nombre: 'Cloe', href: null } } },
  { t: 'bloque', id: 'tu_1-0', bloque: {
    tipo: 'metricas', titulo: 'Mañana, miércoles 7 de octubre',
    metricas: [
      { etiqueta: 'Clases', valor: '5', tipo: 'n', href: '/calendario' },
      { etiqueta: 'Alumnas apuntadas', valor: '30', tipo: 'n', comparacion: { texto: '+4', tono: 'sube', frente: 'el miércoles pasado' } },
      { etiqueta: 'Huecos libres', valor: '12', tipo: 'n' },
      { etiqueta: 'Cobrado este mes', valor: '4.215,00 €', tipo: 'eur', href: '/cobros', comparacion: { texto: '+12 %', tono: 'sube', frente: 'septiembre' } },
    ],
  } },
  { t: 'bloque', id: 'tu_1-1', bloque: { tipo: 'clases', titulo: 'Clases del miércoles 7 de octubre', href: '/calendario', total: 5, clases: CLASES } },
  ...['Mañana tienes 5 clases con 30 alumnas apuntadas. ', 'La que pide atención es la de las 19:00 con [EQUIPO_1]: ', 'está llena y tiene 3 en espera. ', 'A la de las 18:00 le falta instructora.'].map(delta => ({ t: 'texto', delta })),
  { t: 'fin', unidades: 1, disponibles: 181, motivo: 'OK' },
];

const SALDO = { enPrueba: false, cuota: 200, usadas: 18, disponibles: 182, renuevaEl: '2026-11-01' };

/**
 * El panel sembrado con el asistente: plan con la feature, el servidor
 * encendido (o no) y POST /api/asistente con `responder`. Devuelve los
 * contadores de cada petición del asistente.
 */
async function conAsistente(page: Page, o: {
  rol?: 'PROPIETARIO' | 'MANAGER' | 'RECEPCION';
  disponible?: boolean;
  responder?: (r: Route) => Promise<void> | void;
} = {}) {
  await montar(page);
  const rol = o.rol ?? 'PROPIETARIO';
  const n = { disponible: 0, saldo: 0, preguntas: 0, cuerpos: [] as unknown[] };
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', email: 'cloe@example.com', moneda: 'EUR',
    owner_auth_user_id: rol === 'PROPIETARIO' ? UID : 'auth-e2e-otra-duena',
    plan: 'ESTUDIO', subscription_status: 'active',
  }));
  if (rol !== 'PROPIETARIO') {
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-yo', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol, color: '#343825', auth_user_id: UID },
      { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#D9C29E', auth_user_id: 'auth-marta' },
    ]));
  }
  await page.route((u) => u.pathname === '/api/asistente/saldo', (r) => {
    if (new URL(r.request().url()).searchParams.get('solo') === 'disponible') {
      n.disponible++;
      return json(r, { disponible: o.disponible ?? true });
    }
    n.saldo++;
    return json(r, SALDO);
  });
  await page.route((u) => u.pathname === '/api/asistente', async (r) => {
    n.preguntas++;
    n.cuerpos.push(r.request().postDataJSON());
    if (o.responder) return o.responder(r);
    return r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(RESPUESTA) });
  });
  return n;
}

const panel = (page: Page) => page.getByRole('dialog', { name: 'Tentare' });
const barra = (page: Page) => page.getByTestId('barra-preguntar');
const tenti = (page: Page) => panel(page).locator('[data-tenti-asistente]');

async function abrirDesdeLaBarra(page: Page) {
  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 30_000 });
  await barra(page).click();
  await expect(panel(page)).toBeVisible({ timeout: 30_000 });
  await expect(panel(page).getByText('¿Qué quieres saber de tu estudio?')).toBeVisible({ timeout: 30_000 });
}

const CAPTURAS = process.env.ASISTENTE_CAPTURAS;
async function captura(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await page.waitForTimeout(700); // las animaciones de entrada
  await page.screenshot({ path: join(CAPTURAS, nombre.startsWith('chat-') ? `${nombre}.png` : `asistente-${nombre}.png`) });
}

test('propietaria: la barra del Centro de Control abre el panel; una pregunta trae texto, métricas y clases', async ({ page }) => {
  const scripts = recolectarScripts(page);
  const n = await conAsistente(page);
  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 30_000 });
  // El panel no viaja con el Centro de Control: llega al abrirlo.
  expect(await scripts.contiene(HUELLA_DEL_PANEL)).toBe(false);
  expect(n.disponible).toBe(1);
  expect(n.saldo).toBe(0);

  await barra(page).click();
  await expect(panel(page).getByText('¿Qué quieres saber de tu estudio?')).toBeVisible({ timeout: 30_000 });
  expect(await scripts.contiene(HUELLA_DEL_PANEL)).toBe(true);
  await expect(panel(page).getByTestId('asistente-saldo')).toHaveText('Te quedan 182 consultas este mes');
  await expect(panel(page).getByRole('button', { name: '¿Cuánto he facturado este mes?' })).toBeVisible();

  await panel(page).getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  expect(n.preguntas).toBeGreaterThan(0);
  expect(n.cuerpos[0]).toEqual({ pregunta: '¿Qué clases hay mañana?' });
  await expect(panel(page).getByTestId('asistente-texto')).toContainText('Mañana tienes 5 clases con 30 alumnas apuntadas.');
  // El nombre llegó aparte y se pinta donde iba la marca.
  await expect(panel(page).getByTestId('asistente-texto')).toContainText('con Marta Ruiz: está llena');
  await expect(panel(page).getByTestId('asistente-texto')).not.toContainText('[EQUIPO_1]');
  const metricas = panel(page).locator('[data-bloque="metricas"]');
  await expect(metricas.locator('[data-metrica="Alumnas apuntadas"]')).toContainText('30');
  await expect(metricas.locator('[data-metrica="Cobrado este mes"]')).toContainText('frente a septiembre');
  const clases = panel(page).locator('[data-bloque="clases"]');
  await expect(clases.locator('[data-clase]')).toHaveCount(5);
  await expect(clases.locator('[data-clase="ses-e"]')).toHaveAttribute('href', '/calendario?sesion=ses-e');
  await expect(clases.locator('[data-clase="ses-e"]')).toContainText('+3 esp.');
  await expect(clases.getByText('Sin instructora')).toBeVisible();
  // Tenti terminó (y a los 1,5 s vuelve a reposo); el saldo, con lo que dijo el servidor.
  await expect(tenti(page)).toHaveAttribute('data-momento', /terminado|listo/);
  await expect(tenti(page)).toHaveAttribute('data-momento', 'listo', { timeout: 5_000 });
  await expect(panel(page).getByTestId('asistente-saldo')).toHaveText('Te quedan 181 consultas este mes');

  // La siguiente pregunta sigue en la misma conversación.
  await panel(page).getByLabel('Pregunta sobre tu estudio').fill('¿Y pasado mañana?');
  await panel(page).getByRole('button', { name: 'Preguntar' }).click();
  await expect.poll(() => n.preguntas).toBe(2);
  expect(n.cuerpos[1]).toEqual({ pregunta: '¿Y pasado mañana?', conversacionId: CONVERSACION });

  // Escape cierra; reabrir trae la conversación tal cual, sin pedir nada nuevo a la IA.
  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await barra(page).click();
  await expect(panel(page).locator('[data-turno]')).toHaveCount(2);
  expect(n.preguntas).toBe(2);
});

test('sin saldo: el texto exacto, y Tenti en fallo', async ({ page }) => {
  const n = await conAsistente(page, { responder: (r) => json(r, { error: 'Sin consultas disponibles', codigo: 'SIN_SALDO', disponibles: 0 }, 429) });
  await abrirDesdeLaBarra(page);
  await panel(page).getByRole('button', { name: '¿Cuántas alumnas activas tengo?' }).click();
  await expect(panel(page).getByRole('alert')).toHaveText('Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  expect(n.preguntas).toBeGreaterThan(0);
  await expect(tenti(page)).toHaveAttribute('data-momento', 'fallo');
  await expect(panel(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
});

test('la IA no responde (500) y la red se cae: el texto exacto y «Reintentar», que vuelve a preguntar', async ({ page }) => {
  let caso: 'error' | 'red' | 'bien' = 'error';
  const n = await conAsistente(page, {
    responder: (r) => caso === 'error' ? json(r, { error: 'x' }, 500)
      : caso === 'red' ? r.abort('connectionreset')
      : r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(RESPUESTA) }),
  });
  await abrirDesdeLaBarra(page);
  await panel(page).getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  await expect(panel(page).getByRole('alert')).toContainText('No he podido responder ahora. No se ha descontado ninguna consulta.');
  expect(n.preguntas).toBe(1);

  caso = 'red';
  await panel(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(panel(page).getByRole('alert').last()).toContainText('Se ha cortado la conexión.');
  expect(n.preguntas).toBe(2);

  caso = 'bien';
  await panel(page).getByRole('button', { name: 'Reintentar' }).last().click();
  await expect(panel(page).getByTestId('asistente-texto')).toContainText('Mañana tienes 5 clases');
  expect(n.preguntas).toBe(3);
});

test('un aviso de cifra quitada se ve bajo el texto; con privacidad, los importes van difuminados', async ({ page }) => {
  const conAviso = [...RESPUESTA.slice(0, -1), { t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' }, RESPUESTA[RESPUESTA.length - 1]];
  const n = await conAsistente(page, { responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(conAviso) }) });
  await page.addInitScript(() => localStorage.setItem('panel-privacidad', '1'));
  await abrirDesdeLaBarra(page);
  await panel(page).getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  await expect(panel(page).getByText('He quitado una cifra que no salía de tus datos.')).toBeVisible();
  expect(n.preguntas).toBeGreaterThan(0);
  await expect(panel(page).locator('[data-metrica="Cobrado este mes"] .blur-sm')).toHaveCount(1);
});

test('servidor apagado para el estudio: ni barra, ni fila en ⌘K, ni ⌘J', async ({ page }) => {
  const n = await conAsistente(page, { disponible: false });
  await ir(page, 'centro-de-control');
  await expect(page.getByRole('heading', { name: 'Centro de Control' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => n.disponible).toBeGreaterThan(0);
  await expect(barra(page)).toHaveCount(0);
  await page.keyboard.press('Control+j');
  await page.waitForTimeout(500);
  await expect(panel(page)).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const buscador = page.getByRole('dialog', { name: 'Buscar' });
  await expect(buscador).toBeVisible({ timeout: 30_000 });
  await buscador.getByRole('textbox').fill('¿cuántas alumnas activas tengo?');
  await expect(buscador.getByText('Sin resultados', { exact: false }).or(buscador.getByText('Acciones'))).toBeVisible();
  await expect(page.getByTestId('buscador-preguntar')).toHaveCount(0);
  expect(n.preguntas).toBe(0);
});

test('gerente: ⌘K con una pregunta pone «Preguntar a Tentare» la primera y abre el panel ya preguntando; sus sugerencias no son de dinero', async ({ page }) => {
  const n = await conAsistente(page, { rol: 'MANAGER' });
  await ir(page, 'clientas');
  await expect(barra(page)).toHaveCount(0);
  await page.keyboard.press('Control+k');
  const buscador = page.getByRole('dialog', { name: 'Buscar' });
  await expect(buscador).toBeVisible({ timeout: 30_000 });
  // Con la caja vacía, tres de ejemplo y ninguna de dinero.
  await expect(buscador.getByRole('button', { name: '¿Cuántas alumnas activas tengo?' })).toBeVisible({ timeout: 15_000 });
  await expect(buscador.getByRole('button', { name: /facturado|pagos/ })).toHaveCount(0);
  await buscador.getByRole('textbox').fill('¿cuántas alumnas activas tengo?');
  const fila = page.getByTestId('buscador-preguntar');
  await expect(fila).toBeVisible();
  // La primera de todas las filas del buscador.
  const primera = buscador.locator('.overflow-y-auto button').first();
  await expect(primera).toHaveAttribute('data-testid', 'buscador-preguntar');
  await fila.click();
  await expect(panel(page)).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => n.preguntas).toBe(1);
  expect(n.cuerpos[0]).toEqual({ pregunta: '¿cuántas alumnas activas tengo?' });
  await expect(panel(page).locator('[data-turno]').first()).toContainText('¿cuántas alumnas activas tengo?');
  // Una búsqueda que no es pregunta deja la fila al final (no le roba la navegación).
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await buscador.getByRole('textbox').fill('Calendario');
  await expect(buscador.getByText('Secciones')).toBeVisible();
  const botones = buscador.locator('button[data-testid="buscador-preguntar"], button:has-text("Calendario")');
  await expect(botones.last()).toHaveAttribute('data-testid', 'buscador-preguntar');
});

test('recepción: ni barra ni fila, y nunca pregunta al servidor', async ({ page }) => {
  const n = await conAsistente(page, { rol: 'RECEPCION' });
  await ir(page, 'clientas');
  await page.keyboard.press('Control+k');
  const buscador = page.getByRole('dialog', { name: 'Buscar' });
  await expect(buscador).toBeVisible({ timeout: 30_000 });
  await buscador.getByRole('textbox').fill('¿cuántas alumnas activas tengo?');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('buscador-preguntar')).toHaveCount(0);
  expect(n.disponible).toBe(0);
});

test('móvil y oscuro: hoja desde abajo, el campo dentro de la ventana', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enOscuro(page);
  const n = await conAsistente(page);
  await abrirDesdeLaBarra(page);
  // Cuando acaba de subir (la hoja entra deslizándose desde abajo).
  await expect.poll(async () => { const b = await panel(page).boundingBox(); return b ? Math.round(b.y + b.height) : 9999; }).toBeLessThanOrEqual(844);
  const caja = await panel(page).boundingBox();
  expect(caja!.y).toBeGreaterThan(30); // hoja, no pantalla completa
  await panel(page).getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
  await expect(panel(page).locator('[data-bloque="clases"]')).toBeVisible();
  const campo = await panel(page).getByLabel('Pregunta sobre tu estudio').boundingBox();
  expect(campo!.y + campo!.height).toBeLessThanOrEqual(844);
  expect(n.preguntas).toBeGreaterThan(0);
});

// ── Capturas para revisar a ojo (solo con ASISTENTE_CAPTURAS=<carpeta>) ─────

const SEGUNDA = [
  { t: 'inicio', conversacionId: CONVERSACION, disponibles: 181 },
  { t: 'herramienta', id: 'tu_2', nombre: 'pagos_pendientes', etiqueta: 'Mirando los pagos pendientes…' },
  { t: 'referencias', refs: { ALUMNA_1: { nombre: 'Laura Martín', href: '/clientas/soc-2' }, ALUMNA_2: { nombre: 'Bea Ortega', href: '/clientas/soc-4' }, ALUMNA_3: { nombre: 'María García', href: '/clientas/soc-1' } } },
  { t: 'bloque', id: 'tu_2-0', bloque: { tipo: 'recibos', titulo: 'Sin cobrar', href: '/cobros', total: 3, importeTotal: '168,00 €', recibos: [
    { reciboId: 'r1', alumna: 'ALUMNA_1', importe: '89,00 €', situacion: 'IMPAGADO', vence: 'jueves 1 de octubre' },
    { reciboId: 'r2', alumna: 'ALUMNA_2', importe: '79,00 €', situacion: 'POR_COBRAR', vence: 'lunes 5 de octubre' },
    { reciboId: 'r3', alumna: 'ALUMNA_3', importe: '79,00 €', situacion: 'EN_CURSO', vence: 'martes 6 de octubre' },
  ] } },
  ...['Tienes 168,00 € pendientes de cobro entre 2 alumnas. ', 'El que más urge es el de [ALUMNA_1]: **89,00 €** impagados desde el jueves 1 de octubre. ', 'El de [ALUMNA_3] ya está en el banco y todavía no es deuda.'].map(delta => ({ t: 'texto', delta })),
  { t: 'fin', unidades: 1, disponibles: 180, motivo: 'OK' },
];

const LISTA = [
  { id: CONVERSACION, titulo: '¿Qué clases hay mañana?', ultimaEn: new Date().toISOString() },
  { id: '0b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Quién lleva más de 30 días sin venir?', ultimaEn: new Date().toISOString() },
  { id: '1b0c0d0e-1111-4222-8333-944445555666', titulo: 'Hazme un resumen del estudio', ultimaEn: new Date(Date.now() - 86_400_000).toISOString() },
  { id: '2b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Qué bonos caducan esta semana?', ultimaEn: new Date(Date.now() - 3 * 86_400_000).toISOString() },
  { id: '3b0c0d0e-1111-4222-8333-944445555666', titulo: 'Quiero hacer un taller: ¿qué día me conviene?', ultimaEn: new Date(Date.now() - 12 * 86_400_000).toISOString() },
  { id: '4b0c0d0e-1111-4222-8333-944445555666', titulo: '¿Cuánto cobré con Laura Martín el mes pasado?', ultimaEn: new Date(Date.now() - 40 * 86_400_000).toISOString() },
];

const chat = (page: Page) => page.getByTestId('chat-asistente');

for (const tema of ['claro', 'oscuro'] as const) {
  for (const ancho of [1280, 390] as const) {
    test(`capturas del chat · ${tema} · ${ancho}`, async ({ page }) => {
      test.skip(!CAPTURAS, 'Solo con ASISTENTE_CAPTURAS=<carpeta>');
      await page.setViewportSize({ width: ancho, height: ancho === 1280 ? 860 : 844 });
      if (tema === 'oscuro') await enOscuro(page);
      let vez = 0;
      await conAsistente(page, {
        responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(vez++ === 0 ? RESPUESTA : SEGUNDA) }),
      });
      await page.route((u) => u.pathname === '/api/asistente/conversaciones', (r) => json(r, { conversaciones: LISTA }));

      // La puerta del Centro de Control.
      await ir(page, 'centro-de-control');
      await expect(barra(page)).toBeVisible({ timeout: 30_000 });
      await captura(page, `chat-barra-${tema}-${ancho}`);
      await barra(page).click();
      await expect(chat(page)).toBeVisible({ timeout: 60_000 });
      await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 30_000 });
      await captura(page, `chat-vacio-${tema}-${ancho}`);

      // Dos preguntas, con texto y tarjetas.
      await chat(page).getByLabel('Preguntas de ejemplo').getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
      await expect(chat(page).locator('[data-bloque="clases"]')).toBeVisible();
      await chat(page).getByLabel('Pregunta sobre tu estudio').fill('¿Y qué pagos tengo pendientes?');
      await chat(page).getByLabel('Pregunta sobre tu estudio').press('Enter');
      await expect(chat(page).locator('[data-bloque="recibos"]')).toBeVisible();
      await expect(chat(page).locator('[data-tenti-asistente]').last()).toHaveAttribute('data-momento', 'listo', { timeout: 10_000 });
      await chat(page).getByTestId('chat-mensajes').evaluate(el => { el.scrollTop = 0; });
      await captura(page, `chat-conversacion-${tema}-${ancho}`);
      await chat(page).getByTestId('chat-mensajes').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await captura(page, `chat-conversacion-final-${tema}-${ancho}`);

      if (ancho === 390) {
        await chat(page).getByRole('button', { name: 'Tus conversaciones' }).click();
        await expect(page.getByRole('dialog', { name: 'Tus conversaciones' })).toBeVisible();
        await captura(page, `chat-lista-${tema}-${ancho}`);
        await page.keyboard.press('Escape');
      }
    });

    test(`captura del chat respondiendo en streaming · ${tema} · ${ancho}`, async ({ page }) => {
      test.skip(!CAPTURAS, 'Solo con ASISTENTE_CAPTURAS=<carpeta>');
      await page.setViewportSize({ width: ancho, height: ancho === 1280 ? 860 : 844 });
      if (tema === 'oscuro') await enOscuro(page);
      // Un stream que se queda a medias (page.route no entrega por partes): el
      // fetch de POST /api/asistente se sustituye en la página por uno que
      // empuja medio turno y no cierra.
      const parcial = ndjson([...RESPUESTA.slice(0, 5), { t: 'texto', delta: 'Mañana tienes 5 clases con 30 alumnas apuntadas. La que pide atención es la de las 19:00 con [EQUIPO_1]' }]);
      await page.addInitScript((cuerpo) => {
        const original = window.fetch.bind(window);
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (new URL(url, location.href).pathname === '/api/asistente' && init?.method === 'POST') {
            const flujo = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(cuerpo)); } });
            return Promise.resolve(new Response(flujo, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } }));
          }
          return original(input, init);
        };
      }, parcial);
      await conAsistente(page);
      await page.route((u) => u.pathname === '/api/asistente/conversaciones', (r) => json(r, { conversaciones: LISTA }));
      await ir(page, 'centro-de-control');
      await expect(barra(page)).toBeVisible({ timeout: 30_000 });
      await barra(page).click();
      await expect(chat(page).getByText(/¿En qué te ayudo hoy/)).toBeVisible({ timeout: 60_000 });
      await chat(page).getByLabel('Preguntas de ejemplo').getByRole('button', { name: '¿Qué clases hay mañana?' }).click();
      await expect(chat(page).getByTestId('chat-respuesta')).toContainText('Marta Ruiz');
      await chat(page).locator('[data-turno]').last().evaluate(el => el.scrollIntoView({ block: 'start' }));
      await captura(page, `chat-respondiendo-${tema}-${ancho}`);
    });
  }
}
