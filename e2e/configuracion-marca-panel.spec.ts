import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { CATEGORIAS_POR_ROL } from '../lib/notifications/catalog';

// ─────────────────────────────────────────────────────────────────────────────
// Las cuatro últimas secciones de Configuración con el modelo viejo, ya en filas
// (16-sep): Marca, Textos de tu app (partidos en dos), Tu panel y Mis avisos.
//
// Lo que se fija aquí:
//   · cada fila dice CÓMO ESTÁ, no qué hay dentro (el valor, no la descripción);
//   · en Marca hay UNA sola forma de guardar lo que se escribe: el «Guardar» de
//     su cajón. «Guardar colores» ya no existe;
//   · lo que NO se puede cambiar desde aquí se dice: la foto de la portada;
//   · «Aparecer en Tentare Network» avisa de que el directorio no mira si la
//     página está oculta — las dos filas viven juntas y antes no se decía;
//   · «Mis avisos» tiene fila con su valor, y la tabla vive en su pantalla.
//
// ⚠️ Todo camino de fallo cuenta peticiones: «no dijo Guardado» también sería
// verdad con un botón que no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

const json = (r: Route, b: unknown, s = 200) =>
  r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

// Lo mismo que el panel tiene cargado: con logo, sin favicon, con lema y con
// una frase a mano, para que cada fila tenga un valor que comprobar.
const STUDIO_ROW = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
  iva_por_defecto: 21, nif: 'B12345678', plan: 'ESTUDIO', subscription_status: 'active',
  logo_url: 'https://example.com/logo.png',
  lema: 'Cuerpo y mente', descripcion: 'Estudio boutique', anio_fundacion: 2016,
  normas_texto: null, subtitulo_heroe: null, frase_heroe: null,
  frase_manuscrita: 'Un cuerpo feliz', visible_en_network: false,
};

const TEMA = { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12, faviconUrl: null };
const LAYOUT = { orden: [], ocultos: ['/informes'], menuPosition: 'lateral', home: { orden: [], ocultos: [] } };

async function panel(page: Page, opciones: { fallaPublicar?: boolean } = {}) {
  await montar(page);
  const publicaciones: unknown[] = [];
  // Después de `montar`: Playwright prueba las rutas en orden INVERSO al registro.
  await page.route('**/rest/v1/studios**', r => json(r, STUDIO_ROW));
  await page.route(u => u.pathname === '/api/theme', r => json(r, TEMA));
  await page.route(u => u.pathname === '/api/theme/publish', r => {
    publicaciones.push(r.request().postDataJSON());
    return opciones.fallaPublicar
      ? json(r, { errores: [{ mensaje: 'Ese color no se lee encima del blanco.', categoriaId: 'color-marca' }] }, 422)
      : json(r, { ...TEMA, ...(r.request().postDataJSON() as { campos?: object }).campos });
  });
  await page.route('**/api/layout**', r => json(r, LAYOUT));
  await page.route(u => u.pathname === '/api/notifications/preferences', r => json(r, { prefs: {} }));
  return { publicaciones };
}

const valor = (page: Page, id: string) => page.locator(`#${id} [data-resumen]`);
const tituloCajon = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });

test.describe('Marca, en filas que dicen cómo está', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('cada fila enseña su valor guardado, y la foto de la portada se dice que no se cambia aquí', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=marca');

    // El logo sí, el favicon no: se cuentan por separado.
    await expect(valor(page, 'logo-y-favicon')).toHaveText('Con logo · sin favicon', { timeout: 30_000 });
    await expect(valor(page, 'color-de-marca')).toHaveText('El color de Tentare · #343825');
    await expect(valor(page, 'textos-de-tu-app')).toHaveText('Presentación · lema · desde 2016');
    await expect(valor(page, 'textos-de-bienvenida')).toHaveText('Frase a mano');
    // Y el valor es un valor, no la descripción de la tarjeta.
    for (const id of ['logo-y-favicon', 'color-de-marca', 'textos-de-tu-app', 'textos-de-bienvenida']) {
      await expect(valor(page, id)).toHaveAttribute('data-resumen', 'valor');
    }

    // Lo que no se puede tocar se cuenta sin chevron: no es un ajuste que no
    // lleva a ningún sitio.
    const portada = page.locator('[data-fila-informativa]').filter({ hasText: 'La foto de la portada' });
    await expect(portada).toContainText('Todavía no se cambia desde aquí');
  });

  test('el color se guarda con el «Guardar» de su cajón, y ya no hay «Guardar colores»', async ({ page }) => {
    const { publicaciones } = await panel(page);
    await ir(page, 'configuracion?tab=marca#color-de-marca');
    await expect(tituloCajon(page, 'El color de tu marca')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Guardar colores' })).toHaveCount(0);

    await page.getByRole('textbox', { name: 'Color principal en hexadecimal' }).fill('#224466');
    await expect(page.getByRole('region', { name: 'Cambios sin guardar' }))
      .toContainText('Cambios sin guardar en: El color de tu marca');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect.poll(() => publicaciones.length).toBe(1);
    expect(publicaciones[0]).toEqual({ campos: { primary: '#224466', secondary: '#D9C29E' } });
    // Guardado de verdad: el cajón se cierra, lo dice, y la fila cuenta el nuevo color.
    await expect(page.getByText('Colores aplicados')).toBeVisible();
    await expect(tituloCajon(page, 'El color de tu marca')).toHaveCount(0);
    await expect(valor(page, 'color-de-marca')).toHaveText('Tu color · #224466');
  });

  test('si el servidor rechaza el color, lo dice, no cierra el cajón y no lo da por guardado', async ({ page }) => {
    const { publicaciones } = await panel(page, { fallaPublicar: true });
    await ir(page, 'configuracion?tab=marca#color-de-marca');
    await expect(tituloCajon(page, 'El color de tu marca')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('textbox', { name: 'Color principal en hexadecimal' }).fill('#FFFFFF');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();

    await expect(page.getByText('Ese color no se lee encima del blanco.')).toBeVisible({ timeout: 15_000 });
    // Verde por no haberlo intentado no vale.
    expect(publicaciones.length).toBeGreaterThan(0);
    await expect(tituloCajon(page, 'El color de tu marca')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Color principal en hexadecimal' })).toHaveValue('#FFFFFF');
    await expect(page.getByText('Colores aplicados')).toHaveCount(0);
  });
});

test.describe('Tu panel y Mis avisos, en filas', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('«Tu panel»: cada fila dice cómo está y claro u oscuro es un interruptor', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=panel');

    await expect(valor(page, 'menu-del-panel')).toHaveText(/módulos · 1 escondido$/, { timeout: 30_000 });
    await expect(valor(page, 'inicio-del-panel')).toHaveText(/secciones · ninguna escondida$/);
    await expect(valor(page, 'posicion-del-menu')).toHaveText('Fijo a la izquierda');
    // Se guarda al tocarlo: no abre ningún cajón.
    await expect(page.getByRole('switch', { name: 'Claro u oscuro' })).toBeVisible();
  });

  test('«Mis avisos»: una fila con su valor, y la tabla en su propia pantalla', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=avisos');

    const total = CATEGORIAS_POR_ROL.PROPIETARIO.length;
    // Sin ninguna preferencia guardada, todos llegan.
    await expect(valor(page, 'fila-herramienta-tus-avisos'))
      .toHaveText(new RegExp(`^Los ${total} tipos`), { timeout: 30_000 });

    await page.locator('#fila-herramienta-tus-avisos').click();
    await expect(page).toHaveURL(/\?tab=avisos&abrir=tus-avisos$/);
    await expect(page.getByText('Avisos en este dispositivo')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Ocultar tu página y Tentare Network, que conviven', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // El directorio NO mira si la página está oculta (lib/configuracion/pagina-publica.ts):
  // las dos filas están una al lado de la otra y eso no se decía en ninguna.
  test('la fila de Network avisa de que el directorio no mira si la página está oculta', async ({ page }) => {
    await panel(page);
    await ir(page, 'configuracion?tab=web');

    const network = page.locator('#network');
    await expect(network).toContainText('Aunque ocultes tu página, seguirá saliendo ahí', { timeout: 30_000 });
    await expect(network.getByRole('switch', { name: 'Aparecer en Tentare Network' })).toHaveAttribute('aria-checked', 'false');
  });
});
