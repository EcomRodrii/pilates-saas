import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import type { Page } from '@playwright/test';

// La tarjeta grande dejó de ser un enlace cuando el botón «Ver mi acceso» pasó
// a abrir la hoja del pase: un botón dentro de un enlace no es HTML válido ni
// se puede recorrer con el teclado. No tiene rol ni texto fijo con el que
// localizarla —el titular cambia con el estado—, así que lleva un ancla.
const tarjetaGrande = (page: Page) => page.locator('[data-tarjeta="principal"]');

// ─────────────────────────────────────────────────────────────────────────────
// Las dos pantallas del diseño "Tentare App Cliente v2": 01 Acceso y 02 Inicio.
//
// Fija lo que el diseño da por sentado y una refactorización podría llevarse por
// delante sin que salte nada: la pila de cápsulas del acceso, el saludo en
// serif, la tarjeta grande con su cuenta atrás, el carrusel de la semana, las
// cuatro filas y el menú de cuatro pestañas con Inicio la primera.
//
// También hace de banco de pruebas visual: `--update-snapshots` regenera las
// capturas para comparar contra el lienzo del diseño.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal de la clienta — 01 Acceso', () => {
  test.beforeEach(async ({ page }) => { await montarPortal(page, { conSesion: false }); });

  test('la hoja de acceso mantiene la pila de cápsulas del diseño', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);

    // El nombre del estudio, en serif y grande, es la portada.
    await expect(page.getByRole('heading', { name: 'Estudio Alma' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Bienvenida de nuevo')).toBeVisible();
    await expect(page.getByText('a tu calma.')).toBeVisible();

    // Los dos métodos que existen de verdad — ni Apple ni Google, que no hay.
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Entrar con un enlace' })).toHaveAttribute('href', `/portal/${SLUG}/acceso`);
    await expect(page.getByText(/continuar con (apple|google)/i)).toHaveCount(0);

    // Y la salida para quien todavía no es clienta.
    await expect(page.getByRole('link', { name: /reserva tu primera clase/i })).toHaveAttribute('href', `/reservar/${SLUG}`);
  });

  test('los campos y el botón miden 66 px, que es lo que da el ritmo', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);
    const boton = page.getByRole('button', { name: 'Entrar' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    for (const el of [page.getByPlaceholder('Tu email'), page.getByPlaceholder('Tu contraseña'), boton]) {
      const caja = await el.boundingBox();
      expect(Math.round(caja!.height)).toBe(66);
    }
  });
});

test.describe('Portal de la clienta — 02 Inicio', () => {
  test.beforeEach(async ({ page }) => { await montarPortal(page, { conSesion: true }); });

  test('saludo, tarjeta con cuenta atrás y carrusel de la semana', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    // La volanta y la cuenta atrás de la tarjeta grande.
    await expect(page.getByText('Tu próxima clase')).toBeVisible();
    await expect(page.getByText(/^EN \d+ (H \d+ MIN|MIN)$/)).toBeVisible();
    // El nombre de la clase, en cursiva serif, dentro de la tarjeta de cristal.
    await expect(page.getByText('Reformer Flow').first()).toBeVisible();
    // El carrusel.
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  });

  test('las cuatro filas llevan a cuatro sitios distintos', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });

    const destinos = [
      ['Mis reservas', 'reservas'], ['Mi progreso', 'progreso'],
      ['Notificaciones', 'notificaciones'], ['El equipo', 'instructores'],
    ] as const;
    for (const [etiqueta, seg] of destinos) {
      await expect(page.getByRole('link', { name: new RegExp(`^${etiqueta}`) }).first())
        .toHaveAttribute('href', `/portal/${SLUG}/${seg}`);
    }
  });

  test('el menú tiene cuatro pestañas y la primera es Inicio', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    const menu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(menu).toBeVisible({ timeout: 30_000 });

    // Solo la pestaña activa muestra el texto visible (las demás van solo con
    // icono, ver components/portal/portal-nav.tsx) — el nombre de cada una se
    // comprueba por `aria-label`, no por texto visible en pantalla.
    const etiquetas = await menu.getByRole('link').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    // «Mi plan» pasó a ser «Bonos» al partir esa ruta en /bonos + /compras:
    // la pestaña lleva a mirar el saldo, no a pasar por caja.
    expect(etiquetas).toEqual(['Inicio', 'Clases', 'Bonos', 'Perfil']);
    // La pestaña activa se anuncia, no solo se pinta.
    await expect(menu.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  });

  // Casi ningún estudio sube foto el primer día, y el diseño da la imagen por
  // hecha. Sin ella, reservar los 476 px dejaba medio metro de crema vacío con
  // una tarjeta pegada abajo. La pieza es la misma; lo que desaparece es el
  // hueco.
  test('sin foto del estudio la tarjeta no reserva el hueco de la imagen', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    expect(caja!.height).toBeLessThan(300);
  });
});

test.describe('Portal de la clienta — se ve bien en cualquier teléfono', () => {
  // El diseño está dibujado sobre un marco de 402×874 (iPhone 16). Lo que no
  // puede pasar es que en un SE se salga nada por el lado: el nombre del
  // estudio a 44 px y el saludo a 50 px son los dos candidatos a desbordar.
  for (const [nombre, ancho, alto] of [['iPhone SE', 375, 667], ['iPhone 16', 402, 874], ['Android grande', 412, 915]] as const) {
    test(`${nombre}: nada se sale por el lado`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto });
      await montarPortal(page, { conSesion: true });
      await page.goto(`/portal/${SLUG}/home`);
      await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });

      const desborde = await page.evaluate(() => {
        const main = document.querySelector('main');
        return main ? main.scrollWidth - main.clientWidth : 0;
      });
      expect(desborde).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('Portal de la clienta — con foto del estudio', () => {
  // Un PNG de 1×1 en verde: basta para que `fotoUrl` no sea nulo y la tarjeta
  // entre en su composición de diseño, sin depender de ninguna red.
  const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAACwtJQAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

  test('con foto, la tarjeta mide los 476 px del diseño', async ({ page }) => {
    await montarPortal(page, { conSesion: true, fotoUrl: FOTO });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    expect(Math.round(caja!.height)).toBe(476);
  });
});
