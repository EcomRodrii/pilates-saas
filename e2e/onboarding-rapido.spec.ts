import { test, expect } from '@playwright/test';
import { montarAlta, saltarLogo, irAlCierre } from './onboarding-andamio';

// El alta nueva: tres pantallas en vez de once preguntas, su app a la vista, la
// guía rápida desde el primer segundo y «trae a tus alumnas» como paso final.
// Sin ayuda que nadie da (21-oct-2026): ni llamada, ni «configuradlo por mí», ni
// teléfono. La única ayuda humana es la que existe, el WhatsApp de soporte.

test.describe('el asistente rápido', () => {
  test('la guía rápida está a la vista desde la primera pantalla, con 1 de 5 y solo lo hecho de verdad', async ({ page }) => {
    await montarAlta(page);
    await saltarLogo(page);
    const guia = page.getByTestId('guia-rapida');
    await expect(guia).toBeVisible();
    await expect(page.getByTestId('guia-progreso')).toHaveText('1 de 5');
    await expect(guia.locator('[data-paso="estudio-creado"]')).toHaveAttribute('data-hecho', 'si');
    // Nada se marca a mano: sin logo, clases, alumnas ni horario, no hay más.
    for (const id of ['marca', 'clase', 'clientes', 'horario']) {
      await expect(guia.locator(`[data-paso="${id}"]`)).toHaveAttribute('data-hecho', 'no');
    }
    // Y su app, la REAL: un marco a /portal/<slug>, no un dibujo, y sin ser un
    // control más del asistente (inert, sin clics, sin lectores de pantalla).
    const marco = page.getByTestId('app-alumna-real').locator('iframe');
    await expect(marco).toHaveAttribute('src', '/portal/studio-carmen', { timeout: 15_000 });
    await expect(marco).toHaveAttribute('aria-hidden', 'true');
    await expect(marco).toHaveAttribute('inert', '');
    await expect(marco).toHaveAttribute('title', /app de tus alumnas/);
    expect(await marco.evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    // Ninguna maqueta dibujada a mano.
    await expect(page.getByTestId('vista-previa-app')).toHaveCount(0);
    // Y la pantalla del móvil mide lo que el iPhone 17 Pro: 402×874.
    expect(await marco.evaluate((e) => [e.clientWidth, e.clientHeight])).toEqual([402, 874]);
  });

  test('alta → pantalla final con sus alumnas como siguiente paso → sella y lleva a importar', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();

    await expect(page.getByRole('heading', { name: 'Studio Carmen ya está en marcha' })).toBeVisible();
    const traer = page.getByTestId('traer-alumnas');
    await expect(traer).toBeVisible();
    await expect(traer.getByRole('button', { name: 'Subir mi archivo' })).toBeVisible();
    await expect(traer.getByRole('button', { name: 'Añadir una alumna ahora' })).toBeVisible();
    // El enlace de su app, para copiar, y el QR.
    await expect(page.getByTestId('url-app')).toContainText('/portal/studio-carmen');
    await expect(page.getByRole('button', { name: 'Copiar enlace' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Código QR' })).toBeVisible({ timeout: 15_000 });
    // El servidor creó 2 clases: la guía lo ve como hecho (no se marca a mano).
    await expect(page.getByTestId('guia-progreso')).toHaveText('2 de 5');
    await expect(page.locator('[data-paso="clase"]')).toHaveAttribute('data-hecho', 'si');
    await expect(page.getByTestId('app-alumna-real').locator('iframe')).toHaveAttribute('src', '/portal/studio-carmen');
    expect(pet.configurar.length).toBeGreaterThan(0);

    // Hasta que se sale, el alta NO está sellada: recargar aquí no pierde nada.
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
    await traer.getByRole('button', { name: 'Subir mi archivo' }).click();
    await expect.poll(() => pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(true);
    await expect(page).toHaveURL(/\/migracion/);
  });

  test('copiar su enlace lo apunta en el embudo del alta, y si eso falla ella ve lo mismo', async ({ page }) => {
    // Medir no puede cambiar lo que se ve: el servidor contesta 500 a propósito
    // y la pantalla tiene que seguir diciendo «Enlace copiado».
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const pasos: unknown[] = [];
    await montarAlta(page);
    await page.route('**/api/alta/paso', route => {
      pasos.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' });
    });
    await saltarLogo(page);
    await irAlCierre(page);
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();

    await page.getByRole('button', { name: 'Copiar enlace' }).click();
    await expect(page.getByText('Enlace copiado')).toBeVisible();
    await expect.poll(() => pasos.length).toBeGreaterThan(0);
    expect(pasos).toEqual([{ paso: 'enlace_compartido', detalle: 'copiar' }]);
  });

  test('las clases se crean al confirmar la pantalla 2, para que la app real las tenga', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByRole('heading', { name: 'Tus clases y tu sala' })).toBeVisible();
    expect(pet.configurar).toHaveLength(0);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect.poll(() => pet.configurar.length).toBeGreaterThan(0);
    expect(pet.configurar[0].tiposClase).toEqual(['Reformer', 'Mat']);
  });

  test('viniendo de otro programa, la pantalla final dice de cuál', async ({ page }) => {
    await montarAlta(page);
    await saltarLogo(page);
    await page.getByLabel('¿Con qué lo llevas ahora?').selectOption('Bsport');
    await expect(page.getByTestId('aviso-migracion')).toContainText('Bsport');
    await page.getByRole('button', { name: 'Saltar y ver mi estudio' }).click();
    await expect(page.getByTestId('traer-alumnas')).toContainText('Exporta de Bsport');
  });

  test('«Configurar luego» sella y lleva al calendario sin pedir nada', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await page.getByRole('button', { name: 'Configurar luego' }).click();
    await expect.poll(() => pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(true);
    await expect(page).toHaveURL(/\/calendario/);
    expect(pet.ayuda).toHaveLength(0);
  });

  test('el asistente no ofrece ninguna videollamada', async ({ page }) => {
    await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    await expect(page.getByText(/videollamada/i)).toHaveCount(0);
  });
});

test.describe('sin ayuda que nadie da', () => {
  test('el cierre no ofrece llamada ni que lo configuren por ella, ni pide teléfono; solo el WhatsApp de soporte', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    for (const opcion of ['Prefiero que me llamen', 'Configuradlo por mí', 'Lo configuro yo']) {
      await expect(page.getByRole('radio', { name: opcion })).toHaveCount(0);
    }
    await expect(page.getByText('¿Cómo prefieres que te ayudemos?')).toHaveCount(0);
    await expect(page.getByTestId('campo-llamada')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveCount(0);
    await expect(page.getByText(/te llamamos|que me llamen|configuradlo/i)).toHaveCount(0);
    // Ni la promesa de reordenar el panel, que tiene orden fijo.
    await expect(page.getByText(/Subimos a lo primero de tu panel/)).toHaveCount(0);

    const soporte = page.getByRole('link', { name: /Escríbenos por WhatsApp/ });
    await expect(soporte).toBeVisible();
    await expect(soporte).toHaveAttribute('href', /^https:\/\/wa\.me\/\d+\?text=/);

    await page.getByRole('button', { name: 'Ver mi estudio' }).click();
    await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
    // Terminó de verdad (montó el estudio) y no pidió ninguna ayuda a nadie.
    expect(pet.configurar.length).toBeGreaterThan(0);
    expect(pet.ayuda).toHaveLength(0);
  });
});

test.describe('en el móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a 390 px no hay desbordamiento y los controles miden lo que deben', async ({ page }) => {
    await montarAlta(page);
    await saltarLogo(page);
    for (const paso of ['estudio', 'espacio', 'cierre']) {
      if (paso === 'espacio') await page.getByRole('button', { name: 'Continuar' }).click();
      if (paso === 'cierre') await page.getByRole('button', { name: 'Continuar' }).click();
      const ancho = await page.evaluate(() => {
        const el = document.querySelector('[data-screen="bienvenida"]') as HTMLElement;
        return { sw: el.scrollWidth, cw: el.clientWidth };
      });
      expect(ancho.sw).toBeLessThanOrEqual(ancho.cw);
      // Botones a 44 px o más, selects a 16 px o más.
      const chicos = await page.evaluate(() => [...document.querySelectorAll('[data-screen="bienvenida"] button')]
        .filter((b) => (b as HTMLElement).offsetParent !== null)
        .map((b) => ({ t: b.textContent?.trim(), h: b.getBoundingClientRect().height }))
        .filter((b) => b.h < 43.9));
      expect(chicos).toEqual([]);
    }
    // En el móvil la app va arriba como marca compacta y la guía en una línea.
    await expect(page.getByTestId('marca-compacta')).toBeVisible();
  });
});
