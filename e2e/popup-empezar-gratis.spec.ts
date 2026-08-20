import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El popup de «Empieza gratis» de la landing.
//
// Lo que hay que proteger aquí NO es que aparezca: es que NO aparezca cuando no
// toca. Un popup que sale al entrar, o que vuelve a salir después de cerrarlo,
// deja de ser una invitación y pasa a ser publicidad — y quien lo sufre es
// alguien que todavía no es clienta y que no se va a quejar, se va.
//
// El disparador por TIEMPO son 30 s, demasiado para un test; aquí se usa el de
// SCROLL, que es el mismo camino de código (`abrir()` y sus reglas de
// frecuencia). Las reglas en sí están cubiertas aparte y sin navegador en
// lib/landing/popup-frecuencia.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = 'tentare:popup-empezar';
const CLAVE_SESION = 'tentare:popup-empezar-sesion';

const popup = (page: Page) => page.getByRole('dialog', { name: /Empieza gratis en 2 minutos/i });

/**
 * Baja más de la mitad de la página, que es lo que dispara el popup.
 *
 * ⚠️ Repite el gesto hasta que aparece (o hasta agotar los intentos) porque el
 * listener de scroll lo instala un `useEffect`: si el `scrollTo` llega antes de
 * que React hidrate —y bajo carga llega—, ese primer scroll no lo escucha
 * nadie. En un navegador real da igual (la persona sigue moviendo la rueda, y
 * además está el disparador de 30 s), pero en un test es un falso rojo.
 */
async function bajarHastaLaMitad(page: Page) {
  for (let intento = 0; intento < 10; intento++) {
    await page.evaluate(() => {
      const alto = document.documentElement.scrollHeight - window.innerHeight;
      // Se vuelve arriba antes de bajar para que SIEMPRE haya un evento de
      // scroll nuevo, aunque ya estuviéramos a la altura buena.
      window.scrollTo(0, 0);
      window.scrollTo(0, alto * 0.6);
    });
    if (await page.getByRole('dialog').count() > 0) return;
    await page.waitForTimeout(150);
  }
}

test.describe('El popup invita, no persigue', () => {
  test('no aparece nada más entrar', async ({ page }) => {
    await page.goto('/');
    // Sin scroll y sin esperar 30 s no hay motivo para interrumpir a nadie.
    await expect(popup(page)).toHaveCount(0);
  });

  test('aparece al bajar por la página, con el copy exacto', async ({ page }) => {
    await page.goto('/');
    await bajarHastaLaMitad(page);

    await expect(popup(page)).toBeVisible();
    await expect(popup(page)).toContainText('Sin tarjeta de crédito • Configuración en 2 minutos');
    await expect(popup(page).getByRole('link', { name: 'Empezar gratis' })).toHaveAttribute('href', '/crear-estudio');
  });

  test('cerrarlo lo calla en lo que queda de sesión, aunque se siga navegando', async ({ page }) => {
    await page.goto('/');
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toBeVisible();

    await popup(page).getByRole('button', { name: 'Cerrar' }).click();
    await expect(popup(page)).toHaveCount(0);

    // Recargar y volver a bajar: no debe reaparecer.
    await page.reload();
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toHaveCount(0);

    const registro = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), CLAVE);
    expect(registro.vistas, 'no debería contarse una segunda vista').toBe(1);
    expect(registro.cerradoEn).not.toBeNull();
  });

  test('«Ahora no» también lo cierra', async ({ page }) => {
    await page.goto('/');
    await bajarHastaLaMitad(page);
    await popup(page).getByRole('button', { name: 'Ahora no' }).click();
    await expect(popup(page)).toHaveCount(0);
  });

  test('Escape lo cierra, sin buscar el botón', async ({ page }) => {
    await page.goto('/');
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup(page)).toHaveCount(0);
  });

  test('quien ya pulsó «Empezar gratis» no vuelve a verlo nunca', async ({ page }) => {
    await page.addInitScript(([k, ks]) => {
      localStorage.setItem(k, JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
      sessionStorage.removeItem(ks);
    }, [CLAVE, CLAVE_SESION] as const);

    await page.goto('/');
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toHaveCount(0);
  });

  test('tras tres apariciones se calla para siempre', async ({ page }) => {
    await page.addInitScript((k) => {
      localStorage.setItem(k, JSON.stringify({ vistas: 3, ultimaVista: 1, cerradoEn: null, convertido: false }));
    }, CLAVE);

    await page.goto('/');
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toHaveCount(0);
  });

  test('no interrumpe a quien ya está en el CTA final del pie', async ({ page }) => {
    await page.goto('/');
    // Abajo del todo ya hay un botón grande de «Probar Tentare»: taparlo con
    // un modal es interrumpir justo a quien iba a pulsarlo.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(popup(page)).toHaveCount(0);
  });
});

test.describe('En el móvil', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('cabe en pantalla y se puede cerrar con el dedo', async ({ page }) => {
    await page.goto('/');
    await bajarHastaLaMitad(page);
    await expect(popup(page)).toBeVisible();

    const caja = await popup(page).boundingBox();
    expect(caja).not.toBeNull();
    expect(caja!.width).toBeLessThanOrEqual(375);
    expect(caja!.height).toBeLessThanOrEqual(812);

    await popup(page).getByRole('button', { name: 'Cerrar' }).click();
    await expect(popup(page)).toHaveCount(0);
  });
});
