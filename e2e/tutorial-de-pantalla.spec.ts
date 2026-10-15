import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { montar, ir } from './panel-sembrado';
import { TUTORIALES_DESDE_INSTANTE } from '../lib/ayuda/tutorial-progreso';

// ─────────────────────────────────────────────────────────────────────────────
// El tutorial de cada pantalla (P1.1–P1.3) y el arranque (P1.4), en un
// navegador de verdad.
//
// Lo que se fija:
//   · a la propietaria de un estudio NUEVO se le abre solo, una vez: ← → y Esc;
//     saltado, al recargar no vuelve, y el «?» lo repite;
//   · a recepción y a un estudio que ya trabajaba no se les abre solo (con el «?», sí);
//   · con la visita guiada en marcha no hay tutoriales, ni «?»;
//   · irse a otra pantalla lo cierra SIN anotar nada (antes guardaba un
//     «completado» falso tras «perder» cada control);
//   · la máscara no se come los clics; Esc en el buscador es del buscador;
//   · con «reducir movimiento», nada se mueve; a 390 px cabe; axe sin fallos;
//   · gerencia ve los pasos que le tocan (sin el de crear tarifas);
//   · «Hazlo conmigo» (bono y tipo de clase): el ejemplo va en gris y «Crear»
//     sin escribir NO escribe nada (contador + control positivo);
//   · «Siguiente paso» sale JUSTO DESPUÉS de crear el primer tipo de clase, no
//     por lo que ya estaba; descartado, no vuelve; la lista del Resumen.
//
// ⚠️ «Estudio nuevo» es creado desde `TUTORIALES_DESDE` (00:00 de Madrid). Hasta
// ese día, la fecha de alta sembrada es ese mismo instante, que `debeObservar`
// admite (un día de margen hacia delante); después, «ahora».
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const UID = 'auth-e2e-duena';
const CLAVE_PROGRESO = `tentare:tutoriales:v1:${UID}:${STUDIO_ID}`;
const ALTA = new Date(Math.max(Date.now(), TUTORIALES_DESDE_INSTANTE)).toISOString();
const TIPOS_CLASE = 'configuracion?tab=clases&abrir=tipos-de-clase';

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

function estudio(extra: Record<string, unknown> = {}) {
  return {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
    owner_auth_user_id: UID, email: 'cloe@example.com', moneda: 'EUR',
    iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
    creado_en: ALTA,
    ...extra,
  };
}

/** El panel sembrado, de un estudio nacido con los tutoriales. Va DESPUÉS de `montar` (la última ruta gana). */
async function estudioNuevo(page: Page, extra: Record<string, unknown> = {}) {
  await montar(page);
  await page.route('**/rest/v1/studios**', (r) => json(r, estudio(extra)));
}

/** Quien entra no es la dueña: su ficha de equipo dice el rol. */
async function comoRol(page: Page, rol: 'RECEPCION' | 'MANAGER') {
  await estudioNuevo(page, { owner_auth_user_id: 'auth-otra-duena' });
  await page.route('**/rest/v1/instructores**', (r) => json(r, [
    { id: 'ins-ana', studio_id: STUDIO_ID, nombre: 'Ana Peña', activo: true, rol, color: '#8B7355', auth_user_id: UID },
  ]));
}

const tarjeta = (page: Page) => page.getByTestId('tutorial-tarjeta');
const titulo = (page: Page) => tarjeta(page).getByRole('heading');
const progresoGuardado = (page: Page) =>
  page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, unknown>, CLAVE_PROGRESO);

test.describe('el tutorial de la pantalla', () => {
  test('se abre solo a la propietaria de un estudio nuevo; ← → Esc; saltado no vuelve; el «?» lo repite', async ({ page }) => {
    await estudioNuevo(page);
    await ir(page, 'productos');

    await expect(titulo(page)).toHaveText('Suscripción, bono o clase suelta', { timeout: 20_000 });
    await expect(tarjeta(page)).toHaveAttribute('aria-modal', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(titulo(page)).toHaveText('Borrador: no sale en tu página');
    await page.keyboard.press('ArrowLeft');
    await expect(titulo(page)).toHaveText('Suscripción, bono o clase suelta');
    await page.keyboard.press('Escape');
    await expect(tarjeta(page)).toHaveCount(0);
    expect((await progresoGuardado(page))['/productos']).toEqual({ version: 1, como: 'saltado' });

    await ir(page, 'productos');
    const boton = page.getByTestId('boton-tutorial');
    await expect(boton).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(tarjeta(page)).toHaveCount(0);

    await boton.click();
    await expect(titulo(page)).toHaveText('Suscripción, bono o clase suelta');
    await expect(boton).toHaveAccessibleName('Enséñame «Paquetes» paso a paso');
    // Abierto con el «?», el foco entra en la tarjeta (y las teclas van con él).
    await expect(tarjeta(page)).toBeFocused();
  });

  test('a un estudio que ya trabajaba no se le abre solo; con el «?», sí', async ({ page }) => {
    await estudioNuevo(page, { creado_en: '2026-03-01T10:00:00.000Z' });
    await ir(page, 'productos');
    const boton = page.getByTestId('boton-tutorial');
    await expect(boton).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(tarjeta(page)).toHaveCount(0);
    await boton.click();
    await expect(tarjeta(page)).toBeVisible();
  });

  test('a recepción no se le abre solo; con el «?», sí', async ({ page }) => {
    await comoRol(page, 'RECEPCION');
    await ir(page, 'clientas');
    const boton = page.getByTestId('boton-tutorial');
    await expect(boton).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1500);
    await expect(tarjeta(page)).toHaveCount(0);

    await boton.click();
    await expect(tarjeta(page)).toBeVisible();
  });

  test('gerencia ve los pasos que le tocan: sin el de crear tarifas ni «Hazlo conmigo»', async ({ page }) => {
    await comoRol(page, 'MANAGER');
    await ir(page, 'productos');
    await page.getByTestId('boton-tutorial').click({ timeout: 20_000 });
    await expect(tarjeta(page)).toContainText('1 de 2');
    await tarjeta(page).getByRole('button', { name: /Siguiente/ }).click();
    await expect(titulo(page)).toHaveText('Borrador: no sale en tu página');
    await expect(tarjeta(page).getByRole('button', { name: 'Listo' })).toBeVisible();
    await expect(tarjeta(page).getByRole('button', { name: 'Hazlo conmigo' })).toHaveCount(0);
  });

  test('con la visita guiada en marcha no hay tutoriales: ni se abre ni se pinta el «?»', async ({ page }) => {
    // Una visita opcional empezada: lo que deja «Recorrido completo» en el navegador.
    await page.addInitScript(() => localStorage.setItem('panel-tour-v2', '{}'));
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(page.getByRole('dialog', { name: 'Visita guiada de Tentare' })).toBeVisible({ timeout: 20_000 });
    // Control: la cabecera de la pantalla SÍ está (el «?» no falta por no haber cargado).
    await expect(page.getByRole('heading', { name: 'Paquetes', level: 1 })).toBeAttached();
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('boton-tutorial')).toHaveCount(0);
    await expect(tarjeta(page)).toHaveCount(0);
  });

  test('irse a otra pantalla lo cierra sin anotar nada (y allí se abre el suyo)', async ({ page }) => {
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(titulo(page)).toHaveText('Suscripción, bono o clase suelta', { timeout: 20_000 });

    // La máscara no tapa el menú: se puede ir a Clientas con el tutorial abierto.
    await page.locator('a[href="/clientas"]:visible').first().click();
    await expect(page).toHaveURL(/\/clientas$/);
    await expect(titulo(page)).toHaveText('Cada clienta, su estado', { timeout: 20_000 });
    // Paquetes no se dio por visto ni completado: la próxima vez se volverá a abrir.
    expect((await progresoGuardado(page))['/productos']).toBeUndefined();
  });

  test('la máscara no se come los clics, y con un diálogo abierto la tarjeta se aparta', async ({ page }) => {
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('tutorial-anillo')).toBeVisible();

    // «Crear» está fuera de lo que señala el primer paso, bajo la máscara oscura.
    await page.getByRole('button', { name: 'Crear', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Nueva tarifa' })).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
  });

  test('Esc en el buscador es del buscador: el tutorial sigue', async ({ page }) => {
    await estudioNuevo(page);
    await ir(page, 'clientas');
    await expect(titulo(page)).toHaveText('Cada clienta, su estado', { timeout: 20_000 });
    const buscador = page.getByLabel('Buscar clientas').first();
    await buscador.fill('Laura');
    await buscador.press('Escape');
    await page.waitForTimeout(400);
    await expect(tarjeta(page)).toBeVisible();
    // Control: con el foco en la tarjeta, Esc sí lo salta.
    await tarjeta(page).focus();
    await page.keyboard.press('Escape');
    await expect(tarjeta(page)).toHaveCount(0);
  });

  test('con «reducir movimiento», ni la tarjeta ni el anillo se animan', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    const estilos = await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('[data-testid="tutorial-tarjeta"]')!;
      const anillo = document.querySelector<HTMLElement>('[data-testid="tutorial-anillo"] > div')!;
      return { animacion: getComputedStyle(t).animationName, transicionMs: parseFloat(getComputedStyle(anillo).transitionDuration) * 1000 };
    });
    expect(estilos.animacion).toBe('none');
    // La hoja global deja las transiciones en 0,00001 s con «reducir movimiento»: a efectos, ninguna.
    expect(estilos.transicionMs).toBeLessThan(1);
  });

  test('a 390 px cabe entera, con sus botones a mano', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    const caja = (await tarjeta(page).boundingBox())!;
    expect(caja.x).toBeGreaterThanOrEqual(0);
    expect(caja.x + caja.width).toBeLessThanOrEqual(390);
    expect(caja.y + caja.height).toBeLessThanOrEqual(844);
    const saltar = tarjeta(page).getByRole('button', { name: 'Saltar' });
    await expect(saltar).toBeInViewport();
    await expect(tarjeta(page).getByRole('button', { name: /Siguiente/ })).toBeInViewport();
    // Zona táctil de 40 px en el móvil.
    expect((await saltar.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  });

  test('axe: la tarjeta no tiene fallos de accesibilidad', async ({ page }) => {
    await estudioNuevo(page);
    await ir(page, 'productos');
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(400); // que termine su fundido de entrada antes de medir el contraste
    const { violations } = await new AxeBuilder({ page }).include('[data-testid="tutorial-tarjeta"]').analyze();
    expect(violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('«Hazlo conmigo» del bono: el ejemplo va en gris y «Crear» sin escribir no escribe nada (y escribiendo, sí)', async ({ page }) => {
    await estudioNuevo(page);
    const altas: unknown[] = [];
    await page.route('**/rest/v1/planes_tarifa**', (r) => {
      if (r.request().method() === 'POST') { altas.push(r.request().postDataJSON()); return json(r, [], 201); }
      return json(r, []);
    });
    await ir(page, 'productos');
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(titulo(page)).toHaveText('Crea tu primer bono');
    await tarjeta(page).getByRole('button', { name: 'Hazlo conmigo' }).click();

    const d = page.getByRole('dialog', { name: 'Nueva tarifa' });
    await expect(d).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
    await expect(d.getByTestId('banda-ejemplo')).toContainText('Nada se guarda hasta que pulses «Crear bono de sesiones»');
    await expect(d.getByRole('radio', { name: /Bono de sesiones/ })).toHaveAttribute('aria-checked', 'true');
    const nombre = d.getByLabel('Nombre', { exact: false }).first();
    await expect(nombre).toHaveValue('');
    await expect(nombre).toHaveAttribute('placeholder', 'Bono 10 clases');

    await d.getByRole('button', { name: 'Crear bono de sesiones' }).click();
    await page.waitForTimeout(800);
    await expect(d).toBeVisible();
    expect(altas).toHaveLength(0);

    // Control positivo: con los datos escritos, la misma pantalla SÍ crea.
    await nombre.fill('Bono 10 clases');
    await d.getByLabel('Precio', { exact: false }).first().fill('120');
    await d.getByLabel('Sesiones que incluye').fill('10');
    await d.getByLabel('Caducidad').fill('90');
    await d.getByRole('button', { name: 'Crear bono de sesiones' }).click();
    await expect(d).toBeHidden();
    expect(altas).toHaveLength(1);
  });

  test('«Hazlo conmigo» del tipo de clase: sin escribir no crea; escribiendo, sí; el siguiente «Nuevo» ya va sin ejemplo', async ({ page }) => {
    await estudioNuevo(page);
    const altas: unknown[] = [];
    await page.route('**/rest/v1/tipos_clase**', (r) => {
      if (r.request().method() === 'POST') { altas.push(r.request().postDataJSON()); return json(r, [], 201); }
      return json(r, []);
    });
    await ir(page, TIPOS_CLASE);
    await expect(titulo(page)).toHaveText('Tu catálogo de clases', { timeout: 20_000 });
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(titulo(page)).toHaveText('Crea tu primer tipo de clase');
    await tarjeta(page).getByRole('button', { name: 'Hazlo conmigo' }).click();

    const panel = page.getByRole('dialog', { name: 'Nuevo tipo de clase' });
    await expect(panel.getByTestId('banda-ejemplo')).toContainText('Nada se guarda hasta que pulses «Crear tipo de clase»');
    const nombre = panel.getByLabel('Nombre de la clase');
    await expect(nombre).toHaveValue('');
    await expect(nombre).toHaveAttribute('placeholder', 'Reformer iniciación');

    await panel.getByRole('button', { name: 'Crear tipo de clase' }).click();
    await page.waitForTimeout(800);
    expect(altas).toHaveLength(0);

    await nombre.fill('Reformer iniciación');
    await panel.getByRole('button', { name: 'Crear tipo de clase' }).click();
    await expect.poll(() => altas.length).toBe(1);
    await expect(panel).toBeHidden();

    // El siguiente «Nuevo tipo de clase» es el de siempre, sin la banda del ejemplo.
    await page.getByRole('button', { name: /Nuevo tipo de clase/ }).first().click();
    await expect(page.getByRole('dialog', { name: 'Nuevo tipo de clase' })).toBeVisible();
    await expect(page.getByTestId('banda-ejemplo')).toHaveCount(0);
  });
});

test.describe('el arranque de un estudio nuevo (P1.4)', () => {
  /** Salas y equipo sembrados; sin tipos de clase ni clases todavía. */
  async function sinTipos(page: Page, extra: Record<string, unknown> = {}) {
    await estudioNuevo(page, extra);
    await page.route('**/rest/v1/sesiones**', (r) => json(r, []));
    await page.route('**/rest/v1/reservas**', (r) => json(r, []));
    const altas: unknown[] = [];
    await page.route('**/rest/v1/tipos_clase**', (r) => {
      if (r.request().method() === 'POST') { altas.push(r.request().postDataJSON()); return json(r, [], 201); }
      return json(r, []);
    });
    return altas;
  }

  test('tras crear el primer tipo de clase: «Ahora: Programa tus clases»; lo que ya estaba no se celebra; descartado, no vuelve', async ({ page }) => {
    const altas = await sinTipos(page);
    await ir(page, TIPOS_CLASE);
    await expect(tarjeta(page)).toBeVisible({ timeout: 20_000 });
    await page.keyboard.press('Escape');
    // Las salas y el equipo ya estaban al abrir: no hay banda por ellos.
    const banda = page.getByTestId('siguiente-paso');
    await page.waitForTimeout(800);
    await expect(banda).toHaveCount(0);

    await page.getByRole('button', { name: /Nuevo tipo de clase/ }).first().click();
    const panel = page.getByRole('dialog', { name: 'Nuevo tipo de clase' });
    await panel.getByLabel('Nombre de la clase').fill('Reformer');
    await panel.getByRole('button', { name: 'Crear tipo de clase' }).click();
    await expect.poll(() => altas.length).toBe(1);

    await expect(banda).toBeVisible({ timeout: 10_000 });
    await expect(banda).toContainText('Tu primer tipo de clase está creado.');
    await expect(banda.getByRole('link', { name: /Programa tus clases/ })).toHaveAttribute('href', '/calendario');

    await banda.getByRole('button', { name: 'Ocultar este aviso' }).click();
    await expect(banda).toHaveCount(0);
    await ir(page, 'informes');
    await page.waitForTimeout(1000);
    await expect(page.getByTestId('siguiente-paso')).toHaveCount(0);
  });

  test('en el Resumen está la lista, con su «Hacer» al sitio exacto (y sin banda)', async ({ page }) => {
    await estudioNuevo(page);
    await page.route('**/rest/v1/sesiones**', (r) => json(r, []));
    await page.route('**/rest/v1/reservas**', (r) => json(r, []));
    await ir(page, 'dashboard');
    const lista = page.getByTestId('lista-arranque');
    await expect(lista).toBeVisible({ timeout: 20_000 });
    await expect(lista).toContainText('Tu estudio, listo para reservar');
    const fila = lista.getByRole('listitem').filter({ hasText: 'Programa tus clases' });
    await expect(fila.getByRole('link', { name: 'Hacer' })).toHaveAttribute('href', '/calendario');
    await expect(lista.getByRole('listitem').filter({ hasText: 'Crea tu primera clase' })).toContainText('hecho');
    await expect(page.getByTestId('siguiente-paso')).toHaveCount(0);
  });

  test('a un estudio que ya trabajaba no le cambia nada: ni banda ni lista nueva', async ({ page }) => {
    // Creado dos días ANTES de `TUTORIALES_DESDE`: aún en su primer mes (los hitos se
    // observan), así que lo único que lo deja fuera es haber nacido antes.
    const antes = new Date(Math.min(Date.now(), TUTORIALES_DESDE_INSTANTE) - 2 * 86_400_000).toISOString();
    const altas = await sinTipos(page, { creado_en: antes });
    await ir(page, TIPOS_CLASE);
    await page.getByRole('button', { name: /Nuevo tipo de clase/ }).first().click({ timeout: 20_000 });
    const panel = page.getByRole('dialog', { name: 'Nuevo tipo de clase' });
    await panel.getByLabel('Nombre de la clase').fill('Reformer');
    await panel.getByRole('button', { name: 'Crear tipo de clase' }).click();
    await expect.poll(() => altas.length).toBe(1);
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('siguiente-paso')).toHaveCount(0);

    await ir(page, 'dashboard');
    // La tarjeta de siempre, tal cual (control: si no se pintara nada, el «0» no diría nada).
    await expect(page.getByText(/Tu estudio está al \d+%/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('lista-arranque')).toHaveCount(0);
  });
});
