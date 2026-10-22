import { test, expect, type Page } from '@playwright/test';
import { STUDIO_ID, json, montarAlta } from './onboarding-andamio';

// La revisión del fundador del alta nueva (21-oct-2026), lo que se ve en el panel:
//   · paso 3: «Así se verá tu semana» es el Calendario de verdad (SemanaFranjas /
//     VistaAgenda), con su franja y sus días, no un dibujo;
//   · paso 5: la app de la alumna se puede TOCAR, sin que escriba nada;
//   · tras el paso 5, el alta acaba con «Tus primeros pasos» (la clase ya no se
//     crea dentro del alta): «Empezar» abre «Tu primera clase» en el panel y
//     «Omitir» va al Resumen; nunca el Calendario vacío con su aviso. Que el
//     Calendario sin nada abra «Tu primera clase» lo prueba el PR-5
//     (e2e/alta-nueva-primeros-pasos.spec.ts).
//
// ⚠️ Los caminos de fallo llevan contador de peticiones (.claude/tentare-os.md).

const CORS = { 'access-control-allow-origin': '*' };

async function montar(page: Page, { pantalla, pantallaGuardada, estudio = {}, altaNueva = true, portalReal = false, selladoFalla = false }: {
  pantalla?: 'horario' | 'marca' | 'pasos';
  /** Lo guardado tal cual (p. ej. una pantalla que ya no existe). */
  pantallaGuardada?: string;
  estudio?: Record<string, unknown>;
  altaNueva?: boolean;
  /** La app de la alumna de verdad en el marco del paso 5 (si no, una página mínima). */
  portalReal?: boolean;
  /** El UPDATE que sella el alta contesta 500. */
  selladoFalla?: boolean;
} = {}) {
  const red = { sellados: 0, escriturasDesdeLaApp: 0, catalogo: 0 };
  const pet = await montarAlta(page, {
    estudio,
    antes: async (p) => {
      const guardada = pantallaGuardada ?? pantalla;
      if (guardada) {
        await p.addInitScript(([id, pa]) => localStorage.setItem(`tentare-alta-nueva:${id}`, JSON.stringify({ pantalla: pa })), [STUDIO_ID, guardada] as const);
      }
      await p.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { altaNueva }));
      await p.route('**/auth/v1/user**', (r) => {
        if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { ...CORS, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        return r.fulfill({
          status: 200, contentType: 'application/json', headers: CORS,
          body: JSON.stringify({ id: 'auth-e2e-duena', email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { nombre: 'Lucía' }, created_at: '2026-01-01T00:00:00Z' }),
        });
      });
      await p.route('**/rest/v1/studios**', (r) => {
        const req = r.request();
        if (req.method() !== 'PATCH') return r.fallback();
        const cuerpo = (req.postDataJSON() ?? {}) as Record<string, unknown>;
        if ('bienvenida_vista_en' in cuerpo) {
          red.sellados += 1;
          if (selladoFalla) return json(r, { message: 'fallo de prueba' }, 500);
        }
        return r.fallback();
      });
      // El Calendario de un estudio recién creado: nada de nada.
      await p.route('**/api/calendario**', (r) => json(r, {
        sesiones: [], reservas: [], sustituciones: [], salas: [], instructores: [],
        horaApertura: '07:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
      }));
      if (portalReal) {
        // El catálogo público de un estudio recién creado: sin clases ni alumna.
        await p.route('**/api/public/studio-data', (r) => {
          red.catalogo += 1;
          return json(r, {
            studio: { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', ciudad: 'Madrid', cancelacionVentanaHoras: 12, reservaExigirPlan: false },
            tiposClase: [], salas: [], instructores: [], spots: [], planesTarifa: [], sesiones: [],
            videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
            citasServicios: [], citasDisponibilidad: [], aforoReservas: [], socia: null,
          });
        });
        // Lo que escribiría la app si pudiera: reservar o pedir un código.
        await p.route('**/api/public/reserva**', (r) => { red.escriturasDesdeLaApp += 1; return json(r, { ok: true }); });
        await p.route('**/auth/v1/otp**', (r) => { red.escriturasDesdeLaApp += 1; return json(r, {}); });
      } else {
        await p.route('**/portal/studio-carmen**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head></head><body><div class="student-app">App</div></body></html>' }));
      }
    },
  });
  return { pet, red };
}

async function irACuandoAbre(page: Page) {
  await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible({ timeout: 30_000 });
}

test.describe('paso 3: la semana es el Calendario de verdad', () => {
  test('en escritorio, las horas de su franja y los días que cierra, en la semana del Calendario', async ({ page }) => {
    await montar(page, { pantalla: 'horario' });
    await irACuandoAbre(page);
    const semana = page.getByRole('complementary', { name: 'Así se verá tu semana' }).getByTestId('semana-franjas');
    await expect(semana).toBeVisible();
    // «Mañana y tarde» (07:00 – 22:00): una fila por hora, de las 7 a las 21.
    await expect(semana.locator('[data-dia-index="0"][data-hora]')).toHaveCount(15);
    await expect(semana.getByText('07:00', { exact: true })).toBeVisible();
    await expect(semana.getByText('21:00', { exact: true })).toBeVisible();
    // De lunes a sábado: el domingo, «Cerrado» y rayado, como en el Calendario.
    await expect(semana.getByText('Cerrado', { exact: true })).toHaveCount(1);
    await expect(semana.locator('[data-cerrado]')).toHaveCount(15);
    // Cambia con cada toque.
    await page.getByRole('radio', { name: /Solo mañanas/ }).click();
    await expect(semana.locator('[data-dia-index="0"][data-hora]')).toHaveCount(8);
    await page.getByRole('button', { name: 'Domingo' }).click();
    await expect(semana.locator('[data-cerrado]')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Así se verá tu semana' }).getByTestId('resumen-semana')).toHaveText('07:00 – 15:00 · 7 días abiertos');
    // Ni rastro del dibujo de antes.
    await expect(page.getByTestId('semana-dibujada')).toHaveCount(0);
  });

  test('en el móvil, la agenda del Calendario en el móvil', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await montar(page, { pantalla: 'horario' });
    await irACuandoAbre(page);
    const agenda = page.getByTestId('tu-semana').locator('[data-agenda="semana"]');
    await expect(agenda).toBeVisible();
    await expect(agenda.locator('[data-agenda-dia]')).toHaveCount(7);
    await expect(agenda.getByText('Cerrado', { exact: true })).toHaveCount(1);
    await expect(agenda.getByText('Sin clases', { exact: true })).toHaveCount(6);
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(desborda, 'la pantalla se sale a lo ancho en el móvil').toBe(false);
  });
});

test.describe('paso 5: la app de la alumna se toca y no escribe', () => {
  test('se navega por sus pestañas sin sesión de alumna, y lo que escribiría no sale', async ({ page }) => {
    // Varias pantallas de la app dentro del marco: con el `next dev` compilando, 30 s se quedan cortos.
    test.setTimeout(90_000);
    const { red } = await montar(page, { pantalla: 'marca', portalReal: true });
    await expect(page.getByRole('heading', { name: 'Que se vea tu estudio' })).toBeVisible({ timeout: 30_000 });
    const marco = page.getByRole('complementary', { name: 'Así lo verá tu alumna' }).getByTestId('app-en-vivo').locator('iframe');
    await expect(marco).toHaveAttribute('name', 'tentare-solo-mirar');
    await expect(marco).not.toHaveAttribute('inert', /.*/);
    const app = page.frameLocator('[aria-label="Así lo verá tu alumna"] iframe[name="tentare-solo-mirar"]');

    // Inicio, como una recién llegada; y las pestañas abren su pantalla, no «Entra».
    await expect(app.getByRole('heading', { name: 'Hola' })).toBeVisible({ timeout: 30_000 });
    await app.getByRole('link', { name: 'Actividad' }).click();
    await expect(app.getByText('No tienes clases próximas')).toBeVisible({ timeout: 30_000 });
    await app.getByRole('link', { name: 'Perfil' }).click();
    await expect(app.getByText('Tu perfil')).toBeVisible({ timeout: 30_000 });
    await expect(app.getByRole('heading', { name: /^Entra en/ })).toHaveCount(0);
    expect(red.catalogo, 'la app lee su catálogo (POST de lectura)').toBeGreaterThan(0);

    // Lo que escribiría, cortado en el propio marco.
    const frame = page.frames().find((f) => f.name() === 'tentare-solo-mirar' && f.url().includes('/portal/studio-carmen'));
    if (!frame) throw new Error('sin el marco de la app');
    const motivo = await frame.evaluate(() => fetch('/api/public/reserva', { method: 'POST', body: '{}' }).then(() => 'salió', (e: Error) => e.message));
    expect(motivo).toBe('Vista previa del alta: aquí no se escribe nada');

    // Y la puerta de entrada lo dice en vez de mandar un código.
    await frame.goto('/portal/studio-carmen/acceso/login');
    await app.getByLabel('Tu correo').fill('alguien@example.com');
    await app.getByRole('button', { name: 'Seguir' }).click();
    await expect(app.getByText(/Es la vista previa de tu app: aquí no se manda ningún código/)).toBeVisible();
    expect(red.escriturasDesdeLaApp).toBe(0);
  });

  test('control: la misma puerta de entrada, fuera del marco, sí pide el código (el contador lo ve)', async ({ page }) => {
    // Sin esto, el «cero escrituras» de arriba podría ser verdad por no haber intentado nada.
    const { red } = await montar(page, { pantalla: 'marca', portalReal: true });
    await page.goto('/portal/studio-carmen/acceso/login');
    await page.getByLabel('Tu correo').fill('alguien@example.com', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Seguir' }).click();
    await expect.poll(() => red.escriturasDesdeLaApp, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/Es la vista previa de tu app/)).toHaveCount(0);
  });
});

test.describe('tras el paso 5: «Tus primeros pasos», y la primera clase en el panel', () => {
  test('cuenta lo que viene, con las tareas de «Pon en marcha tu estudio», y la línea del alta entera', async ({ page }) => {
    const { pet } = await montar(page, { pantalla: 'marca' });
    await expect(page.getByRole('heading', { name: 'Que se vea tu estudio' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Más tarde' }).first().click();
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible();
    const pasos = page.getByTestId('primeros-pasos-alta').locator('li');
    await expect(pasos).toHaveCount(4);
    await expect(pasos.nth(0)).toContainText('Crea tu primera clase');
    await expect(pasos.nth(0)).toContainText('quién la da, en qué sala');
    await expect(pasos.nth(1)).toContainText('Comparte el enlace de tu app');
    await expect(pasos.nth(2)).toContainText('Trae a tus alumnas');
    await expect(pasos.nth(3)).toContainText('Recibe tu primera reserva');
    // Los cinco del alta, hechos.
    const linea = page.getByTestId('linea-de-pasos');
    await expect(linea.locator('li')).toHaveCount(5);
    await expect(linea.locator('li[data-estado="hecho"]')).toHaveCount(5);
    await expect(page).not.toHaveURL(/calendario/);
    expect(pet.patches.some((p) => 'bienvenida_vista_en' in p)).toBe(false);
  });

  test('«Empezar» sella el alta y abre «Tu primera clase» sobre el Calendario, sin el aviso de lo que falta', async ({ page }) => {
    const { red } = await montar(page, { pantalla: 'pasos' });
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect.poll(() => red.sellados).toBe(1);
    const capa = page.getByTestId('primera-clase-en-calendario');
    await expect(capa.getByRole('heading', { name: 'Tu primera clase' })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/calendario/);
    await expect(page.getByText(/Para crear la clase falta/)).toHaveCount(0);
  });

  test('«Omitir» sella el alta y lleva al Resumen, no al Calendario', async ({ page }) => {
    const { red } = await montar(page, { pantalla: 'pasos' });
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Omitir' }).click();
    await expect.poll(() => red.sellados).toBe(1);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toHaveCount(0);
  });

  test('si no se puede sellar, lo dice y no se va', async ({ page }) => {
    const { red } = await montar(page, { pantalla: 'pasos', selladoFalla: true });
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Empezar' }).click();
    await expect(page.getByTestId('error-guardar')).toContainText('No hemos podido guardar que sales de la configuración');
    expect(red.sellados, 'lo intentó').toBeGreaterThan(0);
    // Sigue en la bienvenida (que vive en /dashboard): sin sellar, no se sale de ella.
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible();
    await expect(page).not.toHaveURL(/calendario/);
  });

  test('el botón del correo (/calendario?primera=1) con el alta a medias sigue el alta donde estaba, sin saltarse «Tu estudio»', async ({ page }) => {
    const { red } = await montar(page, { pantalla: 'horario' });
    await page.goto('/calendario?primera=1');
    await expect(page.getByRole('heading', { name: 'Cuándo abre tu estudio' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('primera-clase-en-calendario')).toHaveCount(0);
    expect(red.sellados).toBe(0);
  });

  test('quien se quedó en la primera clase de antes (cuando era del alta) sigue por «Tus primeros pasos»', async ({ page }) => {
    await montar(page, { pantallaGuardada: 'clase' });
    await expect(page.getByRole('heading', { name: 'Ahora, tus primeros pasos' })).toBeVisible({ timeout: 30_000 });
  });
});

test.describe('el Calendario vacío de un estudio recién creado', () => {
  test('su tutorial («Cada bloque es una clase…») no se abre solo sin un solo bloque; con «Cómo funciona», sí', async ({ page }) => {
    // Lo vio la sesión del PR-5 y es la misma «mala impresión de primeras»: un
    // tutorial de bloques sobre un Calendario que todavía no tiene ninguno.
    await montar(page, { estudio: { bienvenida_vista_en: '2026-10-21T08:00:00Z', creado_en: new Date().toISOString() } });
    await page.goto('/calendario');
    await expect(page.getByTestId('calendario-sin-clases')).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByText(/Cada bloque es una clase/)).toHaveCount(0);
    // Control: el tutorial existe y se ve al pedirlo (si no, el «no se abrió» de arriba no probaría nada).
    await page.getByTestId('boton-tutorial').first().click();
    await expect(page.getByText(/Cada bloque es una clase/)).toBeVisible();
  });
});
