import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

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

  test('hero con saludo + buscador, y la tarjeta "Tu próxima clase" con cuenta atrás', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Buscar clases, instructoras…')).toBeVisible();
    // La volanta y la cuenta atrás de la tarjeta de "Tu próxima clase".
    await expect(page.getByText('Tu próxima clase')).toBeVisible();
    await expect(page.getByText(/^EN \d+ (H \d+ MIN|MIN)$/)).toBeVisible();
    // El nombre de la clase, dentro de esa misma tarjeta.
    await expect(page.getByText('Reformer Flow').first()).toBeVisible();
  });

  test('el menú tiene cuatro pestañas y la primera es Hoy', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    const menu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(menu).toBeVisible({ timeout: 30_000 });

    // Solo la pestaña activa muestra el texto visible (las demás van solo con
    // icono, ver components/portal/portal-nav.tsx) — el nombre de cada una se
    // comprueba por `aria-label`, no por texto visible en pantalla.
    const etiquetas = await menu.getByRole('link').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    // Hoy/Horario/Reservas/Perfil — el menú literal de "Tentare Studio App"
    // (Fase 1 de la sustitución de Oliva/Bloom/Noir). "Bonos" ya no tiene
    // pestaña propia: el saldo vive en "Tu ritmo", dentro de Hoy.
    expect(etiquetas).toEqual(['Hoy', 'Horario', 'Reservas', 'Perfil']);
    // La pestaña activa se anuncia, no solo se pinta.
    await expect(menu.getByRole('link', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
  });

  // Casi ningún estudio sube foto el primer día, y el diseño da la imagen por
  // hecha — el hero mide siempre 314 px, con o sin foto propia, y sin foto usa
  // la de por defecto en vez de dejar un hueco de color.
  test('sin foto del estudio, el hero usa la de por defecto, a su altura fija', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    const hero = page.locator('[data-bloque-sistema="cabecera"]');
    const caja = await hero.boundingBox();
    expect(Math.round(caja!.height)).toBe(314);
    await expect(hero.locator('img').first())
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
      await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });

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

  test('con foto propia, el hero la usa en vez de la de por defecto', async ({ page }) => {
    await montarPortal(page, { conSesion: true, imagenBienvenidaUrl: FOTO });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    const hero = page.locator('[data-bloque-sistema="cabecera"]');
    await expect(hero.locator('img').first()).toHaveAttribute('src', FOTO);
    // El hero mide siempre 314 px — con o sin foto propia no cambia de alto.
    const caja = await hero.boundingBox();
    expect(Math.round(caja!.height)).toBe(314);
  });
});
