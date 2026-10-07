import { test, expect } from '@playwright/test';
import { montarAlta, saltarLogo, irAlCierre, json } from './onboarding-andamio';

// El alta nueva: tres pantallas en vez de once preguntas, su app a la vista, la
// guía rápida desde el primer segundo y «trae a tus alumnas» como paso final.
// Y la ayuda por LLAMADA (no videollamada): el teléfono se pide solo si se elige
// que la llamen, con su consentimiento, y se guarda solo entonces.

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
    // Su enlace de reservas, para copiar, y el QR.
    await expect(page.getByTestId('url-reservas')).toContainText('/reservar/studio-carmen');
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
    await expect(page.getByRole('radio', { name: 'Prefiero que me llamen' })).toBeVisible();
  });
});

test.describe('la llamada de puesta en marcha', () => {
  test('elegir llamada pide el teléfono con su consentimiento, y se guarda al terminar', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    await expect(page.getByTestId('campo-llamada')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Prefiero que me llamen' }).click();
    const campo = page.getByTestId('campo-llamada');
    await expect(campo).toBeVisible();
    await expect(campo.getByText('Te llamamos solo para ayudarte con tu alta, una vez. Sin comerciales.')).toBeVisible();

    // Sin teléfono NO se pide nada al servidor.
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();
    await expect(campo.getByRole('alert')).toContainText('Escribe tu teléfono');
    expect(pet.ayuda).toHaveLength(0);

    const tel = campo.getByRole('textbox', { name: 'Teléfono' });
    await tel.fill('612345678');
    // Con formato mientras escribe, y bien montado para el móvil.
    await expect(tel).toHaveValue('612 34 56 78');
    await expect(tel).toHaveAttribute('inputmode', 'tel');
    await expect(tel).toHaveAttribute('autocomplete', 'tel');
    expect(await tel.evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);

    // Sin la casilla tampoco.
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();
    await expect(campo.getByRole('alert')).toContainText('Marca la casilla');
    expect(pet.ayuda).toHaveLength(0);

    await campo.getByRole('button', { name: 'Por la tarde' }).click();
    await campo.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();

    await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
    expect(pet.ayuda.length).toBeGreaterThan(0);
    expect(pet.ayuda[0]).toMatchObject({
      ayuda: 'Prefiero que me llamen', prefijo: '34', telefono: '612 34 56 78', consentimiento: true, horaPreferida: 'tarde',
    });
  });

  test('no elegir llamada: no se pide teléfono y no se guarda ninguno', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    await page.getByRole('radio', { name: 'Lo configuro yo' }).click();
    await expect(page.getByTestId('campo-llamada')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Teléfono' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();
    await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
    // «Lo configuro yo» no avisa a nadie.
    expect(pet.ayuda).toHaveLength(0);
  });

  test('«Configuradlo por mí» avisa al equipo SIN teléfono', async ({ page }) => {
    const pet = await montarAlta(page);
    await saltarLogo(page);
    await irAlCierre(page);
    await page.getByRole('radio', { name: 'Configuradlo por mí' }).click();
    await expect(page.getByTestId('campo-llamada')).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver mi estudio' }).click();
    await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toBeVisible();
    await expect.poll(() => pet.ayuda.length).toBeGreaterThan(0);
    expect(pet.ayuda[0].ayuda).toBe('Configuradlo por mí');
    expect(pet.ayuda[0]).not.toHaveProperty('telefono');
  });

  // El servidor dice que no: no se finge que se pidió la llamada. Con contador
  // (lo que se mira es que SÍ lo intentó) y sin sellar el alta.
  for (const [caso, responder] of [
    ['un 400 del servidor', (r: import('@playwright/test').Route) => json(r, { error: 'Revisa el teléfono: son 9 cifras.' }, 400)],
    ['un 500', (r: import('@playwright/test').Route) => json(r, { error: 'No se ha podido guardar tu petición. Prueba otra vez.' }, 500)],
    ['la red caída', (r: import('@playwright/test').Route) => r.abort('failed')],
  ] as const) {
    test(`si la petición falla (${caso}), se queda con el error y no sella el alta`, async ({ page }) => {
      const pet = await montarAlta(page, { ayuda: (route) => responder(route) });
      await saltarLogo(page);
      await irAlCierre(page);
      await page.getByRole('radio', { name: 'Prefiero que me llamen' }).click();
      const campo = page.getByTestId('campo-llamada');
      await campo.getByRole('textbox', { name: 'Teléfono' }).fill('612345678');
      await campo.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Ver mi estudio' }).click();

      await expect.poll(() => pet.ayuda.length).toBeGreaterThan(0);
      await expect(campo.getByRole('alert')).toBeVisible();
      await expect(page.getByRole('heading', { name: /ya está en marcha/ })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Antes de entrar' })).toBeVisible();
      expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
      // Y puede reintentar: el botón vuelve a estar activo.
      await expect(page.getByRole('button', { name: 'Ver mi estudio' })).toBeEnabled();
    });
  }
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
        .filter((b) => b.h < 44));
      expect(chicos).toEqual([]);
    }
    // En el móvil la app va arriba como marca compacta y la guía en una línea.
    await expect(page.getByTestId('marca-compacta')).toBeVisible();
  });
});
