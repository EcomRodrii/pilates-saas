import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Academy (/academy) y las guías del Centro de ayuda con su ficha.
//
// Lo que fija:
//  · Academy no enseña secciones vacías: sin ningún vídeo PUBLICADO (la base de pruebas no tiene tabla de vídeos) no hay «Vídeos»,
//    y nada dice «próximamente».
//  · Las rutas son guías REALES: cada enlace de cada ruta responde.
//  · Una búsqueda sin resultado se avisa UNA vez, cuando la persona deja de teclear; una con resultados, nunca.
//  · «Marcar como hecha» se recuerda en el navegador y cuenta en la ruta.
// ─────────────────────────────────────────────────────────────────────────────

test('la portada enseña las rutas y no inventa vídeos ni «próximamente»', async ({ page }) => {
  await page.goto('/academy', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Aprende a sacar el máximo partido a Tentare');
  await expect(page.getByRole('heading', { name: 'Tu primera semana' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vídeos' })).toHaveCount(0);
  expect((await page.locator('main, body').first().innerText()).toLowerCase()).not.toContain('próximamente');
});

test('cada guía de cada ruta existe: sus enlaces responden', async ({ page, request }) => {
  await page.goto('/academy', { waitUntil: 'load' });
  const hrefs = await page.$$eval('.ac-ruta li a', as => as.map(a => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(hrefs.length).toBeGreaterThanOrEqual(18);
  for (const h of hrefs) expect((await request.get(h, { timeout: 120_000 })).status(), h).toBe(200);
});

test('buscar: con resultados no avisa de nada; sin resultados avisa una vez, al dejar de teclear', async ({ page }) => {
  const avisos: Record<string, unknown>[] = [];
  await page.route('**/api/ayuda/busqueda', route => { avisos.push(route.request().postDataJSON() as Record<string, unknown>); return route.fulfill({ json: { ok: true, guardada: true } }); });
  await page.goto('/academy', { waitUntil: 'load' });
  const caja = page.getByRole('searchbox', { name: 'Buscar en Academy' });
  await caja.waitFor();
  await page.waitForFunction(() => Object.keys(document.querySelector('.ac-buscar input') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });

  await caja.fill('stripe');
  await expect(page.getByText(/guía.* para «stripe»/)).toBeVisible();
  await page.waitForTimeout(2200);
  expect(avisos, 'una búsqueda con resultados no se apunta').toHaveLength(0);

  // Teclea una búsqueda sin resultados letra a letra: solo el texto final sale, y una sola vez.
  await caja.fill('');
  await caja.pressSequentially('zzqx inexistente', { delay: 60 });
  await expect(page.getByText(/Sin resultados para «zzqx inexistente»/)).toBeVisible();
  await expect.poll(() => avisos.length, { message: 'tiene que avisar', timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  expect(avisos).toEqual([{ termino: 'zzqx inexistente' }]);
});

test('una palabra suelta y otra en otro orden también encuentran la guía (la búsqueda no exige la frase entera)', async ({ page }) => {
  await page.goto('/academy', { waitUntil: 'load' });
  await page.waitForFunction(() => Object.keys(document.querySelector('.ac-buscar input') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await page.getByRole('searchbox', { name: 'Buscar en Academy' }).fill('bono caducidad');
  await expect(page.getByRole('link', { name: /Caducidad y pausa de un bono/ })).toBeVisible();
});

test('una guía de una ruta: ficha con nivel y «lo que vas a conseguir», «marcar como hecha» que se recuerda y navegación a la siguiente', async ({ page }) => {
  await page.goto('/ayuda/empezar/crear-tu-cuenta', { waitUntil: 'load' });
  const ficha = page.getByRole('region', { name: 'Sobre esta guía' });
  await expect(ficha).toContainText('Principiante');
  await expect(ficha).toContainText('Tu primera semana · 1 de 6');
  await expect(ficha).toContainText('Lo que vas a conseguir');
  await expect(page.getByTestId('video-fachada'), 'sin vídeo publicado no hay hueco de vídeo').toHaveCount(0);
  await expect(page.getByRole('navigation', { name: /Ruta: Tu primera semana/ })).toContainText('Siguiente');

  const boton = ficha.getByRole('button', { name: 'Marcar como hecha' });
  await page.waitForFunction(() => Object.keys(document.querySelector('.ac-hecha') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await boton.click();
  await expect(ficha.getByRole('button', { name: 'Guía hecha' })).toHaveAttribute('aria-pressed', 'true');

  // Se recuerda al volver, y Academy la cuenta en su ruta.
  await page.goto('/academy', { waitUntil: 'load' });
  await expect(page.getByText('1 de 6 hechas').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Sigue donde lo dejaste' })).toBeVisible();
});

test('«Esta guía está desactualizada» escribe en la valoración con su valor propio y da las gracias', async ({ page }) => {
  const votos: Record<string, unknown>[] = [];
  await page.route('**/api/ayuda/feedback', route => { votos.push(route.request().postDataJSON() as Record<string, unknown>); return route.fulfill({ json: { ok: true } }); });
  await page.goto('/ayuda/reservas/lista-de-espera', { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /desactualizada/.test(b.textContent ?? '') && Object.keys(b).some(k => k.startsWith('__react'))), null, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Esta guía está desactualizada' }).click();
  await expect(page.getByText('Gracias: la revisaremos.')).toBeVisible();
  expect(votos).toHaveLength(1);
  expect(votos[0]).toMatchObject({ categoria: 'reservas', articulo: 'lista-de-espera', valoracion: 'DESACTUALIZADA' });
});
