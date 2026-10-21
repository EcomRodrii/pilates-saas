import { test, expect, type Page } from '@playwright/test';
import { STUDIO_ID, json, montarAlta } from './onboarding-andamio';

// El alta nueva dentro del panel (PR-3): «Tu estudio» (dónde está y cuándo abre),
// «¿Traes alumnas de otro sitio?» y «Que se vea tu estudio», tras `ALTA_NUEVA`.
// Mismo andamio que la bienvenida de siempre (e2e/onboarding-andamio.ts): sesión
// sembrada y la red mockeada con `page.route`.
//
// ⚠️ Un camino de fallo sin contador de peticiones es hueco: «no avanzó» puede ser
// verdad porque no se intentó nada. Por eso cada fallo cuenta sus intentos.

const CORS = { 'access-control-allow-origin': '*' };

/** El alta nueva encendida para este estudio y lo que la pantalla escribe, contado. */
async function montarAltaNueva(page: Page, { estudio = {}, horarioFalla = false, pantalla }: {
  estudio?: Record<string, unknown>;
  horarioFalla?: boolean;
  /** Empezar en esta pantalla, como si se hubiera quedado ahí en este navegador. */
  pantalla?: 'estudio' | 'horario' | 'importar' | 'marca' | 'clase';
} = {}) {
  const escrito = {
    usuario: [] as Record<string, unknown>[],
    horario: [] as unknown[],
    pasos: [] as unknown[],
    publicar: [] as unknown[],
  };
  const pet = await montarAlta(page, {
    estudio,
    antes: async (p) => {
      if (pantalla) {
        await p.addInitScript(([id, pa]) => localStorage.setItem(`tentare-alta-nueva:${id}`, JSON.stringify({ pantalla: pa })), [STUDIO_ID, pantalla] as const);
      }
      await p.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { altaNueva: true }));
      await p.route('**/auth/v1/user**', (r) => {
        const req = r.request();
        if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        if (req.method() === 'PUT') escrito.usuario.push((req.postDataJSON() ?? {}) as Record<string, unknown>);
        const datos = (req.postDataJSON()?.data ?? {}) as Record<string, unknown>;
        return r.fulfill({
          status: 200, contentType: 'application/json', headers: CORS,
          body: JSON.stringify({
            id: 'auth-e2e-duena', email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
            app_metadata: {}, user_metadata: datos, created_at: '2026-01-01T00:00:00Z',
          }),
        });
      });
      await p.route('**/rest/v1/studio_horario**', (r) => {
        if (r.request().method() !== 'POST') return json(r, []);
        escrito.horario.push(r.request().postDataJSON());
        if (horarioFalla) return json(r, { message: 'fallo de prueba' }, 500);
        return json(r, [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d })));
      });
      await p.route('**/api/alta/paso', (r) => { escrito.pasos.push(r.request().postDataJSON()); return json(r, { ok: true, apuntado: true }); });
      await p.route('**/api/theme/publish', (r) => {
        escrito.publicar.push(r.request().postDataJSON());
        return json(r, { primary: '#2F6F8F', secondary: '#5A6142', logoUrl: null, radius: 12 });
      });
      // La app de la alumna del marco: una página mínima, para no montar el portal entero.
      await p.route('**/portal/studio-carmen**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head></head><body><div class="student-app">App</div></body></html>' }));
    },
  });
  return { pet, escrito };
}

async function rellenarDonde(page: Page, { cp = '28003' }: { cp?: string } = {}) {
  await page.getByLabel('Cómo te llamas').fill('Lucía');
  await page.getByLabel('Dirección').fill('Calle de Ejemplo, 1');
  await page.getByLabel('Código postal').fill(cp);
  await page.getByLabel('Ciudad').fill('Madrid');
}

test.describe('el alta nueva en el panel', () => {
  test('con el alta nueva sale su bienvenida, con la línea de siete pasos y una persona por WhatsApp', async ({ page }) => {
    await montarAltaNueva(page);
    await expect(page.getByRole('heading', { name: 'Dónde está tu estudio' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('etiqueta-paso')).toHaveText('Paso 3 de 7 · Tu estudio, 1 de 2 · unos 3 minutos');
    const linea = page.getByTestId('linea-de-pasos');
    await expect(linea.locator('li')).toHaveCount(7);
    await expect(linea.locator('li[data-estado="hecho"]')).toHaveCount(2);
    await expect(linea.locator('li[aria-current="step"]')).toContainText('03');
    await expect(page.getByRole('link', { name: /¿Dudas\? Escríbenos/ })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    await expect(page.getByText('Zona horaria: Madrid (peninsular)')).toBeVisible();
    // Nada de la bienvenida de siempre: ni la pantalla del logo ni el asistente.
    await expect(page.getByRole('button', { name: 'Saltar', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toHaveCount(0);
  });

  test('sin el alta nueva, la bienvenida de siempre', async ({ page }) => {
    await montarAlta(page);
    await expect(page.getByRole('button', { name: 'Saltar', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Dónde está tu estudio' })).toHaveCount(0);
  });

  test('el código postal dice la provincia, y uno de Canarias (35001) enseña el aviso de la hora', async ({ page }) => {
    await montarAltaNueva(page);
    const cp = page.getByLabel('Código postal');
    await cp.fill('28003');
    await expect(page.getByTestId('provincia')).toHaveText(/Provincia: Madrid\. Sale sola de tu código postal\./);
    await expect(page.getByTestId('aviso-canarias')).toHaveCount(0);
    await cp.fill('35001');
    await expect(page.getByTestId('provincia')).toHaveText(/Provincia: Las Palmas/);
    await expect(page.getByTestId('aviso-canarias')).toHaveText(
      'Tentare trabaja hoy en hora peninsular: en Canarias, los recordatorios y los cierres de reserva irían una hora antes. Escríbenos antes de abrir reservas.',
    );
  });

  test('«Varias» enseña lo que pasa con las otras sedes y cambia el paso a «tu primera sede»', async ({ page }) => {
    await montarAltaNueva(page);
    await expect(page.getByTestId('bloque-sedes')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Varias' }).click();
    const bloque = page.getByTestId('bloque-sedes');
    await expect(bloque).toBeVisible();
    await expect(bloque).toContainText('Ahora montamos la primera, entera y gratis');
    await expect(bloque).toContainText(/Las otras 2 se abren desde este mismo panel con el plan Cadena: \d+\s€\/mes, una sola suscripción para toda la cadena/);
    await expect(page.getByRole('heading', { name: 'Dónde está tu primera sede' })).toBeVisible();
    await expect(page.getByTestId('etiqueta-paso')).toHaveText('Paso 3 de 7 · Tu primera sede (1 de 3) · unos 3 minutos');
    await bloque.getByRole('radio', { name: '5 o más' }).click();
    await expect(bloque).toContainText('Las otras 4 o más');
    await expect(page.getByTestId('dibujo-sedes')).toContainText('Sede 3 y las demás');
  });

  test('si guardar falla (500), lo dice y no avanza', async ({ page }) => {
    let intentos = 0;
    await montarAltaNueva(page);
    await page.route('**/rest/v1/studios**', (r) => {
      if (r.request().method() !== 'PATCH') return r.fallback();
      intentos++;
      return json(r, { message: 'fallo de prueba', code: 'XX000' }, 500);
    });
    await rellenarDonde(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('error-guardar')).toBeVisible();
    await expect(page.getByTestId('error-guardar')).toContainText('No hemos podido guardar la dirección.');
    expect(intentos).toBeGreaterThan(0);
    // Sigue en la misma pantalla, con lo escrito.
    await expect(page.getByRole('heading', { name: 'Dónde está tu estudio' })).toBeVisible();
    await expect(page.getByLabel('Dirección')).toHaveValue('Calle de Ejemplo, 1');
  });

  test('si el horario por día no se guarda, lo dice y no avanza', async ({ page }) => {
    const { escrito } = await montarAltaNueva(page, { horarioFalla: true });
    await rellenarDonde(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByTestId('error-guardar')).toContainText('No hemos podido guardar los días que abres.');
    expect(escrito.horario.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible();
    expect(escrito.pasos, 'sin guardar, el embudo no apunta nada').toEqual([]);
  });

  test('«Tu estudio» guarda lo que dice, el embudo lo pide, y «Más tarde» en 4 y 5 lleva a la primera clase', async ({ page }) => {
    const { pet, escrito } = await montarAltaNueva(page);
    await rellenarDonde(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // 3 · 2 de 2: el nombre, en su cuenta; la dirección y las sedes, en una actualización del estudio.
    await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible();
    expect(escrito.usuario).toHaveLength(1);
    expect(escrito.usuario[0].data).toEqual({ nombre: 'Lucía' });
    expect(pet.patches).toContainEqual({ direccion: 'Calle de Ejemplo, 1', codigo_postal: '28003', ciudad: 'Madrid', onb_centros: '1 estudio' });

    // «Otro horario» al revés no se deja guardar.
    await page.getByRole('radio', { name: /Otro horario/ }).click();
    await page.getByLabel('Abre a las').fill('21:00');
    await page.getByLabel('Cierra a las').fill('08:00');
    await expect(page.getByText('La hora de cierre tiene que ser después de la de apertura.')).toBeVisible();
    await page.getByLabel('Abre a las').fill('08:30');
    await page.getByLabel('Cierra a las').fill('20:00');
    // El domingo, abierto también.
    await page.getByRole('button', { name: 'Domingo' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByRole('heading', { name: '¿Traes alumnas de otro sitio?' })).toBeVisible();
    expect(pet.patches).toContainEqual({ hora_apertura: '08:30:00', hora_cierre: '20:00:00' });
    const filas = escrito.horario[0] as { dia_semana: number; abierto: boolean; hora_apertura: string | null }[];
    expect(filas).toHaveLength(7);
    expect(filas.every((f) => f.abierto && f.hora_apertura === '08:30:00')).toBe(true);
    await expect.poll(() => escrito.pasos).toEqual([{ paso: 'config_completada' }]);

    // 4: «Otro programa» pone su vía delante; «Más tarde» (arriba) sigue sin importar nada.
    await page.getByRole('radio', { name: 'Otro programa' }).click();
    await expect(page.getByTestId('vias').locator('article').first()).toHaveAttribute('data-testid', 'via-programa');
    await expect(page.getByTestId('via-programa')).toHaveAttribute('data-recomendada', 'true');
    await expect(page.getByTestId('via-programa')).toContainText('Reconocemos las columnas de Momence, Eversports y Mindbody.');
    await page.getByRole('button', { name: 'Más tarde' }).first().click();

    // 5: «Que se vea tu estudio», con la app de verdad en el marco y su contraste dicho.
    await expect(page.getByRole('heading', { name: 'Que se vea tu estudio' })).toBeVisible();
    expect(pet.patches).toContainEqual({ onb_software_anterior: 'Momence' });
    await expect(page.getByTestId('app-en-vivo').locator('iframe')).toHaveAttribute('src', '/portal/studio-carmen');
    await page.getByRole('radio', { name: 'Océano' }).click();
    await expect(page.getByTestId('contraste')).toHaveText(/^Botones con texto blanco · \d+,\d:1 · se lee bien$/);
    // «Más tarde»: no publica el color y sigue a la primera clase (paso 6, PR-4),
    // dentro de la bienvenida: todavía no se sella.
    await page.getByRole('button', { name: 'Más tarde' }).first().click();
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible();
    await expect(page.getByTestId('etiqueta-paso')).toHaveText('Paso 6 de 7 · obligatorio · unos 5 minutos');
    expect(escrito.publicar).toEqual([]);
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
  });

  test('«Siguiente» en la marca publica el color elegido y sigue a la primera clase', async ({ page }) => {
    const { pet, escrito } = await montarAltaNueva(page, { pantalla: 'marca' });
    await expect(page.getByRole('heading', { name: 'Que se vea tu estudio' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('radio', { name: 'Océano' }).click();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect.poll(() => escrito.publicar).toEqual([{ campos: { primary: '#2F6F8F' } }]);
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible();
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
  });

  test('si recarga, vuelve a la pantalla en que estaba', async ({ page }) => {
    await montarAltaNueva(page);
    await rellenarDonde(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByRole('heading', { name: '¿Traes alumnas de otro sitio?' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: '¿Traes alumnas de otro sitio?' })).toBeVisible({ timeout: 30_000 });
    // «Más tarde» abajo, también.
    await page.getByRole('button', { name: 'Más tarde' }).last().click();
    await expect(page.getByRole('heading', { name: 'Que se vea tu estudio' })).toBeVisible();
  });

  test('«Prefiero ir a mi panel» sella el alta y lleva al panel', async ({ page }) => {
    const { pet } = await montarAltaNueva(page);
    await expect(page.getByRole('heading', { name: 'Dónde está tu estudio' })).toBeVisible({ timeout: 30_000 });
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
    await page.getByRole('button', { name: 'Prefiero ir a mi panel' }).click();
    await expect.poll(() => pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Dónde está tu estudio' })).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test('«Saltar a mi primera clase» lleva al paso 6 sin salir de la bienvenida', async ({ page }) => {
    const { pet } = await montarAltaNueva(page);
    await page.getByRole('button', { name: 'Saltar a mi primera clase' }).click();
    await expect(page.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible();
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
  });
});
