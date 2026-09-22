import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Las herramientas grandes de Configuración, cada una en su pantalla.
//
// «Mi app y mi web» medía unas diez pantallas de móvil: el constructor de
// widgets entero, con su vista previa y su código, justo debajo de un
// interruptor de una línea. El fundador: «secciones muy largas», «mezcla de
// cosas muy distintas». Desde el 15-sep (v2) cada herramienta —salas, tipos de
// clase, correos, recompensas y logros, contenido de tu app, widgets— es una
// fila con cómo está, y se abre en `?tab=<sección>&abrir=<herramienta>`.
//
// Lo que se fija aquí, contra el panel sembrado:
//   · cada herramienta se abre desde su fila, con su título y el foco en él, y
//     «volver» —o el atrás del navegador— devuelve a la sección con el foco en
//     la fila;
//   · los enlaces de antes (`?tab=api`, `?tab=gamificacion&sub=canjes`) llegan
//     a la herramienta;
//   · salir de un correo a medio escribir pregunta antes;
//   · a 375 px la lista de correos enseña entera la frase «Se envía…»;
//   · guardar un correo que el servidor rechaza lo dice, no dice «Guardado» y
//     deja lo escrito (con contador: un «no mintió» sin petición no vale).
//
// Los resúmenes de las filas vienen de lib/configuracion/resumenes.ts, con sus
// tests unitarios; los destinos, de lib/configuracion/destino.ts.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  nif: 'B12345674', iva_por_defecto: 21, direccion: 'Calle Mayor 4', ciudad: 'Almería',
  // Motivación va con el plan Estudio.
  plan: 'ESTUDIO', subscription_status: 'active', stripe_account_id: 'acct_e2e',
};

async function panel(page: Page) {
  await montar(page);
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO));
  await page.route(u => u.pathname === '/api/oauth/consentimientos', r => json(r, { apps: [] }));
}

const h2 = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });
const fila = (page: Page, id: string) => page.locator(`#fila-herramienta-${id}`);
const rail = (page: Page) => page.getByRole('navigation', { name: 'Secciones de Configuración' });

// `valor`: lo que tiene que decir su fila con el panel sembrado (2 salas, 2
// tipos de clase, ningún correo apagado). `null`: solo que diga algo.
const HERRAMIENTAS = [
  { id: 'salas', seccion: 'estudio', tituloSeccion: 'Mi estudio', titulo: 'Salas', valor: '2 salas' },
  { id: 'tipos-de-clase', seccion: 'clases', tituloSeccion: 'Mis clases y citas', titulo: 'Tipos de clase', valor: '2 tipos de clase' },
  { id: 'correos-automaticos', seccion: 'comunicacion', tituloSeccion: 'Cómo me comunico', titulo: 'Correos automáticos', valor: 'Los 6 correos se envían' },
  { id: 'recompensas-y-logros', seccion: 'motivacion', tituloSeccion: 'Motivación', titulo: 'Recompensas, logros y retos', valor: null },
  { id: 'codigos-descuento', seccion: 'motivacion', tituloSeccion: 'Motivación', titulo: 'Códigos de descuento', valor: null },
  { id: 'contenido-de-tu-app', seccion: 'web', tituloSeccion: 'Mi app y mi web', titulo: 'Contenido de tu app', valor: null },
  { id: 'widgets', seccion: 'web', tituloSeccion: 'Mi app y mi web', titulo: 'Widgets para tu web', valor: null },
] as const;

const ASUNTO = 'Problema con tu pago — {estudio}';

async function abrirCorreo(page: Page) {
  await ir(page, 'configuracion?tab=comunicacion&abrir=correos-automaticos');
  await page.getByRole('button', { name: /Pago fallido/ }).click({ timeout: 30_000 });
  const editor = page.getByRole('dialog', { name: 'Pago fallido' });
  await expect(editor).toBeVisible();
  return editor;
}

test.describe('En el portátil', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('cada herramienta se abre desde su fila, con su título, y volver deja el foco en la fila', async ({ page }) => {
    test.setTimeout(300_000);
    await panel(page);

    for (const h of HERRAMIENTAS) {
      await ir(page, `configuracion?tab=${h.seccion}`);
      await expect(h2(page, h.tituloSeccion)).toBeVisible({ timeout: 30_000 });
      await expect(fila(page, h.id)).toBeVisible({ timeout: 30_000 });
      await expect(fila(page, h.id)).toContainText(h.titulo);
      if (h.valor) await expect(fila(page, h.id).locator('[data-resumen="valor"]')).toHaveText(h.valor, { timeout: 15_000 });
      else await expect(fila(page, h.id).locator('[data-resumen]')).not.toBeEmpty();
      if (h.id === 'widgets') {
        await page.screenshot({ path: test.info().outputPath('mi-app-y-mi-web-1024x768.png'), fullPage: true });
      }

      await fila(page, h.id).click();
      await expect(h2(page, h.titulo)).toBeFocused({ timeout: 30_000 });
      await expect(page).toHaveURL(new RegExp(`/configuracion\\?tab=${h.seccion}&abrir=${h.id}$`));
      // A todo el ancho: sin la columna de secciones.
      await expect(rail(page)).toHaveCount(0);

      await page.getByRole('button', { name: `Volver a ${h.tituloSeccion}` }).click();
      await expect(h2(page, h.tituloSeccion)).toBeVisible({ timeout: 30_000 });
      await expect(fila(page, h.id)).toBeFocused({ timeout: 15_000 });
      await expect(page).toHaveURL(new RegExp(`/configuracion\\?tab=${h.seccion}$`));
    }
  });

  test('el atrás del navegador, desde una herramienta, vuelve a su sección con el foco en la fila', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=web');
    await fila(page, 'widgets').click({ timeout: 30_000 });
    await expect(h2(page, 'Widgets para tu web')).toBeFocused({ timeout: 30_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/configuracion\?tab=web$/);
    await expect(fila(page, 'widgets')).toBeFocused({ timeout: 15_000 });
  });

  test('los enlaces de antes llegan a su herramienta', async ({ page }) => {
    await panel(page);

    await ir(page, 'configuracion?tab=api');
    await expect(h2(page, 'Widgets para tu web')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#widgets')).toBeAttached({ timeout: 15_000 });

    await ir(page, 'configuracion?tab=gamificacion&sub=canjes');
    await expect(h2(page, 'Recompensas, logros y retos')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#canjes')).toBeInViewport({ timeout: 15_000 });
    // Llegar por un enlace y volver: a la sección, que sustituye a la herramienta.
    await page.getByRole('button', { name: 'Volver a Motivación' }).click();
    await expect(h2(page, 'Motivación')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/configuracion\?tab=motivacion$/);
  });

  test('cerrar un correo a medio escribir pregunta; sin cambios, no', async ({ page }) => {
    await panel(page);
    const editor = await abrirCorreo(page);

    await editor.getByPlaceholder(ASUNTO).fill('Tu cuota no se ha podido cobrar');
    await page.keyboard.press('Escape');
    const pregunta = page.getByRole('dialog', { name: '¿Salir sin guardar?' });
    await expect(pregunta).toBeVisible();
    await expect(pregunta).toContainText('Pago fallido');

    // «Seguir editando» no pierde nada.
    await pregunta.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(pregunta).toHaveCount(0);
    await expect(editor.getByPlaceholder(ASUNTO)).toHaveValue('Tu cuota no se ha podido cobrar');

    // «Salir sin guardar» cierra de verdad.
    await page.keyboard.press('Escape');
    await page.getByRole('dialog', { name: '¿Salir sin guardar?' }).getByRole('button', { name: 'Salir sin guardar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Sin nada escrito, cerrar no pregunta.
    await page.getByRole('button', { name: /Pago fallido/ }).click();
    await expect(editor).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('si el servidor no guarda el correo, lo dice, no dice «Guardado» y deja lo escrito', async ({ page }) => {
    await panel(page);
    let intentos = 0;
    await page.route('**/rest/v1/plantillas_email**', r => {
      if (r.request().method() === 'GET') return json(r, []);
      intentos++;
      return json(r, { message: 'fallo del servidor', code: 'XX000' }, 500);
    });

    const editor = await abrirCorreo(page);
    await editor.getByPlaceholder(ASUNTO).fill('Tu cuota no se ha podido cobrar');
    await editor.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect(editor.getByRole('alert')).toContainText('No se ha guardado', { timeout: 15_000 });
    // Verde sin haber intentado nada no vale.
    expect(intentos).toBeGreaterThan(0);
    await expect(page.getByText('Guardado', { exact: true })).toHaveCount(0);
    await expect(editor).toBeVisible();
    await expect(editor.getByPlaceholder(ASUNTO)).toHaveValue('Tu cuota no se ha podido cobrar');
  });
});

test.describe('En el móvil', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('la lista de correos enseña entera la frase de cuándo se envía, sin salirse de lado', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=comunicacion&abrir=correos-automaticos');
    const frases = page.locator('[data-correo] [data-cuando]');
    await expect(frases).toHaveCount(6, { timeout: 30_000 });

    const medidas = await frases.evaluateAll(els => els.map(el => ({
      texto: (el.textContent ?? '').trim(),
      cortada: el.scrollWidth > el.clientWidth + 1,
      recorte: getComputedStyle(el).textOverflow,
      derecha: el.getBoundingClientRect().right,
    })));
    for (const m of medidas) {
      expect(m.texto).toMatch(/^Se envía .+\.$/);
      expect(m.cortada, m.texto).toBe(false);
      expect(m.recorte, m.texto).not.toBe('ellipsis');
      expect(m.derecha, m.texto).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('correos-375x812.png'), fullPage: true });
  });

  test('el constructor de widgets, a pantalla completa y con su vuelta a la vista', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=web');
    await fila(page, 'widgets').click({ timeout: 30_000 });
    await expect(h2(page, 'Widgets para tu web')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Volver a Mi app y mi web' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath('widgets-375x812.png') });
  });
});
