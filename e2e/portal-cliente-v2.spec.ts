import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { altura, radio } from '../lib/portal-design.ts';
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
  //
  // ⚠️ Van a /login, no a /acceso: desde la reconstrucción de la puerta
  // (816f4971) /acceso empieza en el paso `intro` ("Muévete. Lo demás, ya
  // está.") y hay que pulsar "Ya tengo cuenta" para llegar aquí — ese paso ya
  // lo cubre e2e/portal-tema-editorial.spec.ts. Lo que este test verifica es
  // el CONTRATO del formulario de login en sí (los dos campos a la vez, sin
  // partirlo en pasos), y /login es el atajo que entra directo a él.
  test('la puerta pide email y contraseña a la vez, y deja salida a quien no es clienta', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);

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
  // También va a /login por el mismo motivo que el test anterior: el
  // contrato que se protege es el del formulario de login, no el paso previo
  // de la puerta.
  test('contraseña Y enlace conviven, sin preguntar cuál toca', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);

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

  // Lo que se comprueba es el INVARIANTE DE FORMA —el CTA es una cápsula, sin
  // plano recto en el centro del lado—, no una medida concreta.
  //
  // ⚠️ Antes se escribía como igualdad exacta (`radio * 2 === alto`, 62 → 31)
  // porque el diseño de entonces fijaba el radio a la mitad justa. El kit
  // "Tentare Studio App" cambia las dos cifras a la vez (`altura.botonCta`
  // 62 → 50, `radio.botonCta` 31 → 999): sobre 50 px un radio de 999 se
  // pinta como cápsula perfecta igual —el navegador lo recorta a 25 al
  // dibujar— pero `getComputedStyle` devuelve el valor DECLARADO, 999px, así
  // que la igualdad dejó de describir la forma y solo describía una
  // implementación. Se comprueba `radio >= alto / 2`, que es la regla de
  // verdad y aguanta las dos formas de escribirla.
  //
  // El alto se compara contra el TOKEN, no contra un número copiado: así el
  // test sigue detectando que algo (CSS de fuera, un tema) pise la altura,
  // sin volver a romperse la próxima vez que el kit la remida.
  //
  // /login: el botón "Entrar" solo vive en el paso de login, y este test es
  // sobre la geometría de esa cápsula, no sobre el recorrido de la puerta.
  test('el CTA es una cápsula perfecta: sin plano recto en el lado', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/login`);
    const boton = page.getByRole('button', { name: 'Entrar' });
    await expect(boton).toBeVisible({ timeout: 30_000 });

    const caja = await boton.boundingBox();
    expect(Math.round(caja!.height)).toBe(altura.botonCta);

    const radioPintado = await boton.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
    expect(radioPintado).toBeGreaterThanOrEqual(caja!.height / 2);
    // Y que el token no se haya quedado por debajo de la mitad del alto.
    expect(radio.botonCta).toBeGreaterThanOrEqual(altura.botonCta / 2);
  });
});

test.describe('Portal de la clienta — 02 Inicio', () => {
  test.beforeEach(async ({ page }) => { await montarPortal(page, { conSesion: true }); });

  test('saludo, tarjeta con cuenta atrás y carrusel de la semana', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);

    // El saludo pasó de "Hola, {nombre}" a saludo-por-hora + titular
    // (components/portal/portal-home-view.tsx, ~línea 620): el prefijo
    // ("Buenas noches"/"Buenos días"...) depende de la hora a la que corra la
    // suite, así que solo se ancla el sufijo estable. El titular grande, sin
    // avatar/variantes en el mock (el caso por defecto), es el texto fijo por
    // defecto de `PROXIMA_CLASE` — no depende de la hora.
    await expect(page.getByText(/, Marta 👋/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Hoy tienes una cita contigo.' })).toBeVisible();
    // La volanta y la cuenta atrás de la tarjeta grande.
    await expect(page.getByText('Tu próxima clase')).toBeVisible();
    await expect(page.getByText(/^EN \d+ (H \d+ MIN|MIN)$/)).toBeVisible();
    // El nombre de la clase, en cursiva serif, dentro de la tarjeta de cristal.
    await expect(page.getByText('Reformer Flow').first()).toBeVisible();
    // El carrusel.
    await expect(page.getByRole('heading', { name: 'Esta semana' })).toBeVisible();
  });

  // ⚠️ RETIRADO: "las cuatro filas llevan a cuatro sitios distintos" probaba
  // el bloque "Accesos rápidos" (Mis reservas/Mi progreso/Notificaciones/El
  // equipo), retirado del Inicio el 31-ago por no existir en el diseño real
  // de "Tentare Studio App" (ver e2e/portal-accesos-rapidos.spec.ts, que es
  // la red de seguridad de esa retirada). Este test quedó apuntando a filas
  // que ya no se pintan — no se actualiza, se borra, igual que se hizo con
  // los demás tests de esa rama muerta.

  // Catálogo real hoy (lib/portal-nav.ts, NAV_DEFAULT): Hoy/Buscar/Reservas/
  // Perfil — Clases y Bonos se fusionaron en una sola pantalla "Reservas", y
  // "Buscar" es una pestaña nueva de verdad (antes un overlay sin sitio en la
  // barra). "Inicio" pasó a llamarse "Hoy".
  test('el menú tiene cuatro pestañas y la primera es Hoy', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    const menu = page.getByRole('navigation', { name: 'Secciones' });
    await expect(menu).toBeVisible({ timeout: 30_000 });

    // Solo la pestaña activa muestra el texto visible (las demás van solo con
    // icono, ver components/portal/portal-nav.tsx) — el nombre de cada una se
    // comprueba por `aria-label`, no por texto visible en pantalla.
    // ⚠️ "Horario" abre un overlay (no navega a una ruta), así que es un
    // `<button>`, no un `<Link>` — hay que buscar ambos para ver las 4.
    const etiquetas = await menu.locator('a, button').evaluateAll(els => els.map(el => el.getAttribute('aria-label')));
    expect(etiquetas).toEqual(['Hoy', 'Horario', 'Reservas', 'Perfil']);
    // La pestaña activa se anuncia, no solo se pinta.
    await expect(menu.getByRole('link', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
  });

  // Casi ningún estudio sube foto el primer día, y el diseño da la imagen por
  // hecha. Lo que hay que defender es que, sin foto propia, la tarjeta use la
  // de por defecto y no un hueco de color.
  //
  // ⚠️ Esta prueba exigía `height > 400`. Eso defendía la tarjeta de 476 px de
  // "Tentare App Cliente v2" (foto a sangre + tarjeta de cristal flotando),
  // un diseño ANTERIOR. El kit vigente ("Tentare Studio App",
  // docs/diseno-referencia-portal/CHEATSHEET-CSS.md) la dibuja compacta:
  // padding 14px 15px y alto según contenido. Se comprueba esa forma nueva —
  // no se borra la comprobación, se traslada.
  test('sin foto del estudio la tarjeta usa la de por defecto', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(tarjetaGrande(page)).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    // Compacta: ni la banda de 476 px de antes, ni una tira sin contenido.
    expect(caja!.height).toBeGreaterThan(110);
    expect(caja!.height).toBeLessThan(300);
    // Y que la foto sea la de por defecto, no un hueco con fondo de color.
    await expect(tarjetaGrande(page).locator('img').first())
      .toHaveAttribute('src', /\/por-defecto\/estudio-vertical/);
  });

  // El recorte que motivó el rediseño: a 390 px el titular por defecto
  // ("Tu sitio te espera") pedía 291 px en una caja de 272 y se veía
  // "Tu sitio te esp…", con el CTA igual. Ninguno de los dos puede volver a
  // salir cortado — son el mensaje y la acción principal de la pantalla que
  // más ve una socia.
  test('ni el titular ni el CTA de la tarjeta salen recortados', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/home`);
    await expect(tarjetaGrande(page)).toBeVisible({ timeout: 30_000 });
    const recortados = await tarjetaGrande(page).evaluate((card) =>
      [...card.querySelectorAll<HTMLElement>('*')]
        .filter((el) => el.children.length === 0 && (el.textContent ?? '').trim().length > 3)
        .filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => (el.textContent ?? '').trim()),
    );
    expect(recortados).toEqual([]);
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
      await expect(page.getByRole('button', { name: 'Buscar clases, instructoras' })).toBeVisible({ timeout: 30_000 });

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

  // ⚠️ Antes esto fijaba 476 px exactos. Eran los del diseño ANTERIOR
  // ("Tentare App Cliente v2"); el kit vigente hace la tarjeta compacta y de
  // alto variable según el caso (los cinco estados cambian volanta, titular y
  // metadatos, ver portal-home-view.tsx). Lo que sigue importando es que con
  // foto propia la tarjeta la USE y mantenga la forma compacta.
  test('con foto propia, la tarjeta la usa y mantiene la forma compacta', async ({ page }) => {
    await montarPortal(page, { conSesion: true, imagenBienvenidaUrl: FOTO });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(tarjetaGrande(page)).toBeVisible({ timeout: 30_000 });
    const caja = await tarjetaGrande(page).boundingBox();
    expect(caja!.height).toBeGreaterThan(110);
    expect(caja!.height).toBeLessThan(300);
    await expect(tarjetaGrande(page).locator('img').first()).toHaveAttribute('src', FOTO);
  });
});
