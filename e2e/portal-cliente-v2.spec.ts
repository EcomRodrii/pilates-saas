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

  // La hoja de cápsulas de v2 la sustituyó la PUERTA ÚNICA, y después los dos
  // pasos (email → clave) los sustituyó UNA sola pantalla: el fundador entró en
  // la app, vio dos pantallas seguidas pidiéndole entrar y dijo lo evidente —eso
  // sigue pareciendo dos accesos—. Lo que estos tests protegen no ha cambiado en
  // ninguna de las tres formas: que los métodos ofrecidos existen de verdad, y
  // que hay salida para quien todavía no es clienta.
  test('la puerta pide email y contraseña a la vez, y deja salida a quien no es clienta', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/acceso`);

    // ⚠️ Los DOS campos en la MISMA pantalla. Este es el contrato del cambio:
    // si alguien vuelve a partirlo en dos pasos, aquí salta.
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Tu contraseña')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
    // Y ya no hay ningún «Seguir» que lleve a una segunda pantalla.
    await expect(page.getByRole('button', { name: 'Seguir' })).toHaveCount(0);

    // ⚠️ La regla no ha cambiado —nada que prometa algo que no funciona— pero
    // el hecho sí: el proveedor de GOOGLE está activo en el proyecto, así que
    // ese botón entra de verdad y aquí se exige que esté.
    await expect(page.getByRole('button', { name: /continuar con google/i })).toBeVisible();
    // APPLE sigue fuera: exige cuenta de desarrollador de pago y no está
    // configurado. Un botón suyo hoy seguiría siendo una mentira.
    await expect(page.getByText(/continuar con apple/i)).toHaveCount(0);

    await expect(page.getByRole('link', { name: /reserva tu primera clase/i })).toHaveAttribute('href', `/reservar/${SLUG}`);
  });

  // ⚠️ La regla de negocio que no se puede romper: la puerta NO pregunta al
  // servidor si tal email tiene contraseña —eso filtraría quién está dada de
  // alta—, así que las DOS salidas están a la vista desde el primer momento.
  // Con una sola pantalla esto sale gratis: no hay ni siquiera un instante en
  // el que se pudiera preguntar.
  test('contraseña Y enlace conviven, sin preguntar cuál toca', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/acceso`);

    await expect(page.getByPlaceholder('Tu contraseña')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /mándame un enlace/i })).toBeVisible();
  });

  // /login es la dirección que la gente tiene guardada y la que el estudio ha
  // repartido. Sigue viva y enseña la misma puerta — sin email en la URL, sin
  // rebotes y sin pedir nada raro.
  test('la dirección de siempre (/login) enseña la misma puerta', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);
    await expect(page.getByPlaceholder('tu@email.com')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByPlaceholder('Tu contraseña')).toBeVisible();
  });

  // Y el email que venga en la URL se respeta: es lo que hace que volver atrás
  // desde cualquier sitio no le borre a la socia lo que ya había escrito.
  test('el email de la URL llega escrito', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login?email=quien.sea%40ejemplo.com`);
    await expect(page.getByPlaceholder('tu@email.com')).toHaveValue('quien.sea@ejemplo.com', { timeout: 30_000 });
  });

  // El ritmo de 66 px era el de la hoja de cápsulas de v2, que la puerta única
  // sustituye. El invariante de forma que SÍ sigue vivo —y que el handoff
  // declara como regla, no como medida— es que el radio de un botón es la
  // mitad exacta de su altura: 62 → 31. Redondear a 32 deja un plano recto de
  // 2 px en el centro del lado, y se ve.
  test('el CTA es una cápsula perfecta: radio la mitad exacta del alto', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/acceso`);
    const boton = page.getByRole('button', { name: 'Entrar' });
    await expect(boton).toBeVisible({ timeout: 30_000 });

    const caja = await boton.boundingBox();
    expect(Math.round(caja!.height)).toBe(62);
    const radio = await boton.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
    expect(Math.round(parseFloat(radio) * 2)).toBe(Math.round(caja!.height));
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
  // hecha. Antes eso obligaba a encoger la tarjeta —reservar los 476 px dejaba
  // medio metro de crema vacío— y esta prueba defendía justo ese encogimiento.
  // Con la foto por defecto el hueco no llega a existir, así que la tarjeta se
  // queda a la altura del diseño y lo que hay que defender es lo contrario.
  test('sin foto del estudio la tarjeta usa la de por defecto, a su altura completa', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    expect(caja!.height).toBeGreaterThan(400);
    // Y que la foto sea la de por defecto, no un hueco con fondo de color.
    await expect(tarjetaGrande(page).locator('img').first())
      .toHaveAttribute('src', /\/por-defecto\/estudio-vertical/);
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
  // Un PNG de 1×1 en verde: basta para que `imagenBienvenidaUrl` no sea nulo
  // y la tarjeta entre en su composición de diseño, sin depender de ninguna
  // red. NO se usa `fotoUrl` aquí a propósito: es la foto de perfil de la
  // propietaria, un campo distinto — la tarjeta del portal lee la imagen de
  // bienvenida, y este test existe precisamente para que ambos campos no se
  // mezclen (ver migración 20260810140000_studios_imagen_bienvenida).
  const FOTO = 'data:image/gif;base64,R0lGODlhAQABAIAAACwtJQAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

  test('con foto, la tarjeta mide los 476 px del diseño', async ({ page }) => {
    await montarPortal(page, { conSesion: true, imagenBienvenidaUrl: FOTO });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /Hola, Marta\./ })).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    expect(Math.round(caja!.height)).toBe(476);
  });
});
