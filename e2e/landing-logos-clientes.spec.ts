import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La franja «Estudios que ya usan Tentare» de la home (19-oct-2026).
//
// La home lee sus logos en servidor y se regenera cada hora, así que ninguna prueba
// puede cambiarle el número de logos: el servidor de e2e (E2E_TEST=1) devuelve CERO
// (`E2E_LOGOS_LANDING`, por defecto 0) y el mismo componente se prueba en
// `/e2e-franja-logos?n=` con logos de MENTIRA (nombres inventados, SVG en línea).
//
// Lo que fija esta spec es lo que un test unitario no ve: que con cero logos no
// haya franja NI hueco, que el layout no se mueva (CLS 0), que no haya scroll
// lateral a 375 px y que la marquesina pare con `prefers-reduced-motion`.
// ⚠️ Cada test lleva su control: una comprobación que no puede fallar no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

async function abrirPrueba(page: Page, n: number, ancho = 1440) {
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.goto(`/e2e-franja-logos?n=${n}`, { waitUntil: 'load' });
}

async function sinScrollLateral(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/** Suma de los desplazamientos de layout (CLS) desde el principio de la carga. */
async function cls(page: Page) {
  return page.evaluate(() => new Promise<number>((resolve) => {
    let total = 0;
    const po = new PerformanceObserver((lista) => {
      for (const e of lista.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) total += e.value;
      }
    });
    po.observe({ type: 'layout-shift', buffered: true });
    setTimeout(() => { po.disconnect(); resolve(total); }, 800);
  }));
}

test('la home, sin ningún estudio con consentimiento: ni franja ni título ni hueco entre el héroe y lo siguiente', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('#clientes')).toHaveCount(0);
  await expect(page.getByText('Estudios que ya usan Tentare')).toHaveCount(0);
  // Sin hueco: «Seis cosas…» empieza justo donde acaba el héroe (home nueva, fase 2.2: la franja va bajo el héroe).
  const [finSuena, inicioVerbos] = await Promise.all([
    page.locator('header#top').evaluate((e) => e.getBoundingClientRect().bottom + window.scrollY),
    page.locator('#verbos').evaluate((e) => e.getBoundingClientRect().top + window.scrollY),
  ]);
  expect(Math.abs(inicioVerbos - finSuena)).toBeLessThanOrEqual(1);
  // CONTROL: con logos la franja SÍ ocupa sitio entre las dos (si no, la medida de arriba no prueba nada).
  await abrirPrueba(page, 3);
  expect(await page.locator('#clientes').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(60);
});

test('/e2e-franja-logos sin logos no pinta nada', async ({ page }) => {
  await abrirPrueba(page, 0);
  await expect(page.locator('#clientes')).toHaveCount(0);
  await expect(page.locator('#despues')).toBeVisible();
  // CONTROL: con uno, sí.
  await abrirPrueba(page, 1);
  await expect(page.locator('#clientes')).toHaveCount(1);
});

for (const ancho of [1440, 375]) {
  test(`con 3 logos (${ancho} px): marquesina con alt correcto, a una tinta, sin scroll lateral y CLS 0`, async ({ page }) => {
    await abrirPrueba(page, 3, ancho);
    const franja = page.locator('#clientes');
    await expect(franja).toBeVisible();
    await expect(franja).toHaveAttribute('aria-label', 'Estudios que usan Tentare');
    // Siempre marquesina (fundador, 20-oct): los 3 reales, más copias decorativas fuera del árbol de accesibilidad.
    await expect(franja.locator('.v7-logos-marq')).toHaveCount(1);
    await expect(franja.locator('.v7-logos-lista:not(.v7-logos-copia) img')).toHaveCount(3);
    expect(await franja.locator('.v7-logos-lista:not(.v7-logos-copia) img').evaluateAll((is) => is.map((i) => (i as HTMLImageElement).alt)))
      .toEqual(['Estudio Nube', 'Luna Reformer', 'Taller Brisa']);
    await franja.scrollIntoViewIfNeeded();
    // Todas cargadas y a la misma altura (la caja es fija: 40 px en escritorio, 30 en móvil).
    const medidas = await franja.locator('img').evaluateAll((is) => is.map((i) => {
      const im = i as HTMLImageElement;
      return { cargada: im.complete && im.naturalWidth > 0, alto: Math.round(im.getBoundingClientRect().height), filtro: getComputedStyle(im).filter };
    }));
    for (const m of medidas) {
      expect(m.cargada).toBe(true);
      expect(m.alto).toBe(ancho === 1440 ? 40 : 30);
      expect(m.filtro).toContain('grayscale(1)');
    }
    expect(await sinScrollLateral(page)).toBe(true);
    expect(await cls(page)).toBe(0);
    // CONTROL del CLS y del scroll: el detector sí ve un desplazamiento real y un desbordamiento real.
    await page.evaluate(() => {
      const caja = document.createElement('div');
      caja.id = 'intruso';
      caja.style.cssText = 'width:3000px;height:10px';
      document.body.prepend(caja);
    });
    expect(await sinScrollLateral(page)).toBe(false);
  });
}

test('con 3 logos, el color vuelve al pasar el ratón por encima', async ({ page }) => {
  await abrirPrueba(page, 3);
  const primero = page.locator('#clientes .v7-logos-item').first();
  const img = primero.locator('img');
  expect(await img.evaluate((i) => getComputedStyle(i).filter)).toContain('grayscale(1)');
  await primero.hover();
  await expect.poll(() => img.evaluate((i) => getComputedStyle(i).filter)).toBe('none');
  // CONTROL: el segundo, sin ratón encima, sigue en gris.
  expect(await page.locator('#clientes .v7-logos-item').nth(1).locator('img').evaluate((i) => getComputedStyle(i).filter)).toContain('grayscale(1)');
});

test('con 1 logo ya es marquesina (repite el mismo); con 7, también', async ({ page }) => {
  await abrirPrueba(page, 1);
  await expect(page.locator('#clientes .v7-logos-marq')).toHaveCount(1);
  await abrirPrueba(page, 7);
  await expect(page.locator('#clientes .v7-logos-marq')).toHaveCount(1);
});

for (const ancho of [1440, 375]) {
  test(`con 8 logos (${ancho} px): marquesina que corre, copias decorativas fuera del árbol de accesibilidad y sin scroll lateral`, async ({ page }) => {
    await abrirPrueba(page, 8, ancho);
    const franja = page.locator('#clientes');
    await franja.scrollIntoViewIfNeeded();
    await expect(franja.locator('.v7-logos-marq')).toHaveCount(1);
    const pista = franja.locator('.v7-logos-pista');
    expect(await pista.evaluate((p) => getComputedStyle(p).animationName)).toBe('v7-logos-corre');
    // Los lectores de pantalla leen UNA lista de 8; las copias son decorativas.
    expect(await franja.locator('.v7-logos-lista:not(.v7-logos-copia) img').evaluateAll((is) => is.map((i) => (i as HTMLImageElement).alt)))
      .toEqual(['Estudio Nube', 'Luna Reformer', 'Taller Brisa', 'Casa Olmo', 'Pilates Faro', 'Yoga Ribera', 'Atelier Cobre', 'Sala Marea']);
    expect(await franja.locator('.v7-logos-copia').evaluateAll((ls) => ls.every((l) => l.getAttribute('aria-hidden') === 'true'))).toBe(true);
    expect(await franja.locator('.v7-logos-copia img').evaluateAll((is) => is.every((i) => (i as HTMLImageElement).alt === ''))).toBe(true);
    // De verdad se mueve: dos muestras del transform separadas en el tiempo difieren.
    const t1 = await pista.evaluate((p) => getComputedStyle(p).transform);
    await page.waitForTimeout(700);
    const t2 = await pista.evaluate((p) => getComputedStyle(p).transform);
    expect(t2).not.toBe(t1);
    expect(await sinScrollLateral(page)).toBe(true);
    // CLS 0 también en marquesina: el movimiento es un transform, no layout.
    expect(await cls(page)).toBe(0);
    // CONTROL: pausada con el ratón encima, el transform deja de cambiar.
    await franja.locator('.v7-logos-marq').hover();
    await page.waitForTimeout(150);
    const p1 = await pista.evaluate((p) => getComputedStyle(p).transform);
    await page.waitForTimeout(500);
    expect(await pista.evaluate((p) => getComputedStyle(p).transform)).toBe(p1);
  });
}

test('con 8 logos y prefers-reduced-motion: fila quieta que envuelve, sin copias', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await abrirPrueba(page, 8, 375);
  const franja = page.locator('#clientes');
  await franja.scrollIntoViewIfNeeded();
  const pista = franja.locator('.v7-logos-pista');
  expect(await pista.evaluate((p) => getComputedStyle(p).animationName)).toBe('none');
  const t1 = await pista.evaluate((p) => getComputedStyle(p).transform);
  await page.waitForTimeout(500);
  expect(await pista.evaluate((p) => getComputedStyle(p).transform)).toBe(t1);
  // Las copias no se ven, y los 8 logos reales sí, en más de una fila.
  expect(await franja.locator('.v7-logos-copia').evaluateAll((ls) => ls.every((l) => getComputedStyle(l).display === 'none'))).toBe(true);
  const reales = franja.locator('.v7-logos-lista:not(.v7-logos-copia) img');
  await expect(reales).toHaveCount(8);
  const tops = await reales.evaluateAll((is) => new Set(is.map((i) => Math.round(i.getBoundingClientRect().top))).size);
  expect(tops).toBeGreaterThan(1);
  expect(await sinScrollLateral(page)).toBe(true);
  // CONTROL: sin la preferencia, la misma franja sí corre.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await abrirPrueba(page, 8, 375);
  expect(await page.locator('#clientes .v7-logos-pista').evaluate((p) => getComputedStyle(p).animationName)).toBe('v7-logos-corre');
});
