import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ir, enOscuro } from './panel-sembrado';
import { recolectarScripts } from './recolector-scripts';
import {
  CONVERSACION, HUELLA_DEL_CHAT, json, ndjson, RESPUESTA, conAsistente, chat, barra, tenti, sugerencia, campoChat, abrirDesdeLaBarra, SEGUNDA, LISTA,
} from './asistente-andamiaje';

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


const CAPTURAS = process.env.ASISTENTE_CAPTURAS;
async function captura(page: Page, nombre: string) {
  if (!CAPTURAS) return;
  mkdirSync(CAPTURAS, { recursive: true });
  await page.waitForTimeout(700); // las animaciones de entrada
  await page.screenshot({ path: join(CAPTURAS, nombre.startsWith('chat-') ? `${nombre}.png` : `asistente-${nombre}.png`) });
}

test('propietaria: la barra del Centro de Control lleva al chat; una pregunta trae texto, métricas y clases', async ({ page }) => {
  const scripts = recolectarScripts(page);
  const n = await conAsistente(page);
  await ir(page, 'centro-de-control');
  await expect(barra(page)).toBeVisible({ timeout: 30_000 });
  // El chat no viaja con el Centro de Control: llega al entrar en /asistente.
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(false);
  expect(n.disponible).toBe(1);
  expect(n.saldo).toBe(0);

  await barra(page).click();
  await expect(chat(page).getByText('¿En qué te ayudo hoy, Cloe?')).toBeVisible({ timeout: 60_000 });
  expect(await scripts.contiene(HUELLA_DEL_CHAT)).toBe(true);
  await expect(chat(page).getByTestId('asistente-saldo')).toContainText('Te quedan 182 consultas este mes');
  await expect(sugerencia(page, '¿Cuánto he facturado este mes?')).toBeVisible();

  await sugerencia(page, '¿Qué clases hay mañana?').click();
  await expect.poll(() => n.preguntas).toBe(1);
  expect(n.cuerpos[0]).toEqual({ pregunta: '¿Qué clases hay mañana?' });
  await expect(chat(page).getByTestId('chat-pregunta')).toHaveText('¿Qué clases hay mañana?');
  const respuesta = chat(page).getByTestId('chat-respuesta');
  await expect(respuesta).toContainText('Mañana tienes 5 clases con 30 alumnas apuntadas.');
  // El nombre llegó aparte y se pinta donde iba la marca.
  await expect(respuesta).toContainText('con Marta Ruiz: está llena');
  await expect(respuesta).not.toContainText('[EQUIPO_1]');
  const metricas = chat(page).locator('[data-bloque="metricas"]');
  await expect(metricas.locator('[data-metrica="Alumnas apuntadas"]')).toContainText('30');
  await expect(metricas.locator('[data-metrica="Cobrado este mes"]')).toContainText('frente a septiembre');
  const clases = chat(page).locator('[data-bloque="clases"]');
  await expect(clases.locator('[data-clase]')).toHaveCount(5);
  await expect(clases.locator('[data-clase="ses-e"]')).toHaveAttribute('href', '/calendario?sesion=ses-e');
  await expect(clases.locator('[data-clase="ses-e"]')).toContainText('+3 esp.');
  await expect(clases.getByText('Sin instructora')).toBeVisible();
  // Tenti terminó (y a los 1,5 s vuelve a reposo); el saldo, con lo que dijo el servidor.
  await expect(tenti(page)).toHaveAttribute('data-momento', 'listo', { timeout: 5_000 });
  await expect(chat(page).getByTestId('asistente-saldo')).toContainText('Te quedan 181 consultas este mes');
  await expect(chat(page).getByRole('button', { name: 'Copiar respuesta' })).toBeVisible();

  // La siguiente pregunta, con Intro, sigue en la misma conversación.
  await campoChat(page).fill('¿Y pasado mañana?');
  await campoChat(page).press('Enter');
  await expect.poll(() => n.preguntas).toBe(2);
  expect(n.cuerpos[1]).toEqual({ pregunta: '¿Y pasado mañana?', conversacionId: CONVERSACION });
  await expect(chat(page).locator('[data-turno]')).toHaveCount(2);
  // Mayúsculas+Intro es un salto de línea, no un envío.
  await campoChat(page).fill('una');
  await campoChat(page).press('Shift+Enter');
  await expect(campoChat(page)).toHaveValue('una\n');
  expect(n.preguntas).toBe(2);
});

test('sin saldo: el texto exacto, y Tenti en fallo', async ({ page }) => {
  const n = await conAsistente(page, { responder: (r) => json(r, { error: 'Sin consultas disponibles', codigo: 'SIN_SALDO', disponibles: 0 }, 429) });
  await abrirDesdeLaBarra(page);
  await sugerencia(page, '¿Cuántas alumnas activas tengo?').click();
  await expect(chat(page).getByRole('alert')).toHaveText('Has usado las consultas de este mes. Vuelven el 1 de noviembre.');
  expect(n.preguntas).toBeGreaterThan(0);
  await expect(tenti(page)).toHaveAttribute('data-momento', 'fallo');
  await expect(chat(page).getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
});

test('la IA no responde (500) y la red se cae: el texto exacto y «Reintentar», que vuelve a preguntar', async ({ page }) => {
  let caso: 'error' | 'red' | 'bien' = 'error';
  const n = await conAsistente(page, {
    responder: (r) => caso === 'error' ? json(r, { error: 'x' }, 500)
      : caso === 'red' ? r.abort('connectionreset')
      : r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(RESPUESTA) }),
  });
  await abrirDesdeLaBarra(page);
  await sugerencia(page, '¿Qué clases hay mañana?').click();
  await expect(chat(page).getByRole('alert')).toContainText('No he podido responder ahora. No se ha descontado ninguna consulta.');
  expect(n.preguntas).toBe(1);

  caso = 'red';
  await chat(page).getByRole('button', { name: 'Reintentar' }).click();
  await expect(chat(page).getByRole('alert').last()).toContainText('Se ha cortado la conexión.');
  expect(n.preguntas).toBe(2);

  caso = 'bien';
  await chat(page).getByRole('button', { name: 'Reintentar' }).last().click();
  await expect(chat(page).getByTestId('chat-respuesta').last()).toContainText('Mañana tienes 5 clases');
  expect(n.preguntas).toBe(3);
});

test('un aviso de cifra quitada se ve bajo el texto; con privacidad, los importes van difuminados', async ({ page }) => {
  const conAviso = [...RESPUESTA.slice(0, -1), { t: 'aviso', codigo: 'CIFRA_SIN_RESPALDO' }, RESPUESTA[RESPUESTA.length - 1]];
  const n = await conAsistente(page, { responder: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: ndjson(conAviso) }) });
  await page.addInitScript(() => localStorage.setItem('panel-privacidad', '1'));
  await abrirDesdeLaBarra(page);
  await sugerencia(page, '¿Qué clases hay mañana?').click();
  await expect(chat(page).getByText('He quitado una cifra que no salía de tus datos.')).toBeVisible();
  expect(n.preguntas).toBeGreaterThan(0);
  await expect(chat(page).locator('[data-metrica="Cobrado este mes"] .blur-sm')).toHaveCount(1);
});

test('servidor apagado para el estudio: ni barra, ni fila en ⌘K, ni ⌘J; /asistente lo dice y no pregunta', async ({ page }) => {
  const n = await conAsistente(page, { disponible: false });
  await ir(page, 'centro-de-control');
  await expect(page.getByRole('heading', { name: 'Centro de Control' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => n.disponible).toBeGreaterThan(0);
  await expect(barra(page)).toHaveCount(0);
  await page.keyboard.press('Control+j');
  await page.waitForTimeout(500);
  await expect(page).toHaveURL(/centro-de-control/);
  await page.keyboard.press('Control+k');
  const buscador = page.getByRole('dialog', { name: 'Buscar' });
  await expect(buscador).toBeVisible({ timeout: 30_000 });
  await buscador.getByRole('textbox').fill('¿cuántas alumnas activas tengo?');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('buscador-preguntar')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await ir(page, 'asistente');
  await expect(page.getByText('El asistente no está disponible para tu estudio.')).toBeVisible({ timeout: 30_000 });
  await expect(chat(page)).toHaveCount(0);
  expect(n.preguntas).toBe(0);
  expect(n.saldo).toBe(0);
});

test('gerente: ⌘K con una pregunta pone «Preguntar a Tentare» la primera y lleva al chat ya preguntando; sus sugerencias no son de dinero', async ({ page }) => {
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
  await expect(buscador.locator('.overflow-y-auto button').first()).toHaveAttribute('data-testid', 'buscador-preguntar');
  await fila.click();
  await expect(page).toHaveURL(/\/asistente$/, { timeout: 30_000 });
  await expect.poll(() => n.preguntas, { timeout: 60_000 }).toBe(1);
  expect(n.cuerpos[0]).toEqual({ pregunta: '¿cuántas alumnas activas tengo?' });
  await expect(chat(page).getByTestId('chat-pregunta')).toHaveText('¿cuántas alumnas activas tengo?');
  // La pregunta no viaja en la URL (puede llevar el nombre de una alumna).
  expect(page.url()).not.toContain('alumnas');
  // Una búsqueda que no es pregunta deja la fila al final (no le roba la navegación).
  await page.keyboard.press('Control+k');
  await buscador.getByRole('textbox').fill('Calendario');
  await expect(buscador.getByText('Secciones')).toBeVisible();
  await expect(buscador.locator('.overflow-y-auto button').last()).toHaveAttribute('data-testid', 'buscador-preguntar');
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

test('móvil y oscuro: el chat a pantalla completa, el campo encima de la barra de abajo, y la lista en un cajón', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enOscuro(page);
  const n = await conAsistente(page);
  await abrirDesdeLaBarra(page);
  await sugerencia(page, '¿Qué clases hay mañana?').click();
  await expect(chat(page).locator('[data-bloque="clases"]')).toBeVisible();
  const campo = await campoChat(page).boundingBox();
  // Por encima de la barra de navegación de abajo (56 px).
  expect(campo!.y + campo!.height).toBeLessThanOrEqual(844 - 56);
  expect(n.preguntas).toBeGreaterThan(0);
  await chat(page).getByRole('button', { name: 'Tus conversaciones' }).click();
  await expect(page.getByRole('dialog', { name: 'Tus conversaciones' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Tus conversaciones' }).getByRole('button', { name: 'Nueva conversación' })).toBeVisible();
});

// ── Capturas para revisar a ojo (solo con ASISTENTE_CAPTURAS=<carpeta>) ─────

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
