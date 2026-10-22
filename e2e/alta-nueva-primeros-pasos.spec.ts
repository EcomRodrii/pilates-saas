import { test, expect, type Page, type Route } from '@playwright/test';
import { json, montarAlta } from './onboarding-andamio';

// ─────────────────────────────────────────────────────────────────────────────
// «Pon en marcha tu estudio» del alta nueva (PR-5): la lista de cinco tareas en
// el Resumen, que se marca con lo que dice el servidor (GET /api/alta/estado),
// «Paso n de 5», los opcionales, «Omitir», el recorrido rápido de tres paradas,
// el WhatsApp que se va al terminar la lista, «Tu plan, sin sorpresas» una sola
// vez, los vacíos del Calendario y de Clientas y «Comparte el enlace de tu app».
//
// Mismo andamio que el resto del alta (e2e/onboarding-andamio.ts): sesión
// sembrada y la red mockeada con `page.route`, con la bienvenida ya sellada.
// ⚠️ Todo camino de fallo lleva su CONTADOR de peticiones: «no salió» puede ser
// verdad porque no se intentó nada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 180_000 });

const RECIEN = {
  claseReservable: false, avisoClase: null, enlaceCompartido: false, alumnas: false, primeraReserva: false,
  // De serie, el recorrido ya visto: cada test que lo prueba lo pide.
  recorridoVisto: true, planEnsenado: false, sedesAbiertas: 1, foundingGratis: true,
};
const GRATIS = {
  fase: 'DENTRO', uso: { alumnasActivas: 2, reservas30Dias: 3 }, motivos: [], diasRestantes: 0, cierraEl: null,
  limites: { alumnas: 150, reservasMes: 250 }, margenDias: 30,
};

interface Red {
  estado: number;
  pasos: Record<string, unknown>[];
}

async function montar(page: Page, o: {
  estado?: Record<string, unknown> | null;
  estadoStatus?: number;
  billing?: Record<string, unknown>;
  estudio?: Record<string, unknown>;
  antes?: (p: Page) => Promise<void>;
} = {}) {
  const red: Red = { estado: 0, pasos: [] };
  await montarAlta(page, {
    estudio: { bienvenida_vista_en: '2026-10-21T08:00:00Z', creado_en: new Date().toISOString(), ...o.estudio },
    antes: async (p) => {
      await p.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { altaNueva: true, panelNuevo: true }));
      await p.route('**/api/alta/estado', (r: Route) => {
        red.estado += 1;
        return json(r, o.estado === undefined ? RECIEN : o.estado, o.estadoStatus ?? 200);
      });
      await p.route('**/api/alta/paso', (r: Route) => {
        red.pasos.push((r.request().postDataJSON() ?? {}) as Record<string, unknown>);
        return json(r, { ok: true, apuntado: true });
      });
      await p.route('**/api/billing/status**', (r) => json(r, {
        bloqueado: false, activo: true, plan: 'BASE', configurado: true, subscriptionStatus: 'gratis', ...o.billing,
      }));
      await p.route('**/portal/studio-carmen**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>App</body></html>' }));
      if (o.antes) await o.antes(p);
    },
  });
  return red;
}

const tarjeta = (page: Page) => page.getByTestId('pon-en-marcha');
const tarea = (page: Page, id: string) => tarjeta(page).locator(`[data-tarea="${id}"]`);
const pasos = (red: Red, paso: string) => red.pasos.filter((p) => p.paso === paso);

test.describe('«Pon en marcha tu estudio» del alta nueva', () => {
  test('recién llegada: la cuenta hecha, «Paso 2 de 5» y la primera clase es la que se ofrece', async ({ page }) => {
    const red = await montar(page);
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await expect(tarjeta(page).getByRole('heading', { name: 'Pon en marcha tu estudio' })).toBeVisible();
    await expect(tarjeta(page).getByTestId('paso-de-cinco')).toHaveText('Paso 2 de 5');
    await expect(tarjeta(page)).toContainText('Ya casi está: unos 10 minutos');
    await expect(tarjeta(page).getByRole('progressbar', { name: 'Primeros pasos' })).toHaveAttribute('aria-valuenow', '1');
    await expect(tarea(page, 'cuenta')).toHaveAttribute('data-estado', 'hecha');
    await expect(tarea(page, 'primera-clase')).toHaveAttribute('data-estado', 'ahora');
    await expect(tarea(page, 'primera-clase').getByRole('link', { name: 'Crear mi primera clase' })).toHaveAttribute('href', '/calendario?primera=1');
    // La de siempre no sale: una sola guía.
    await expect(page.getByText('Pon en marcha tu estudio, te enseñamos cómo')).toHaveCount(0);
    // Una persona, no un robot.
    await expect(tarjeta(page).getByTestId('ayuda-persona')).toContainText('Te responde una persona del equipo de Tentare, no un robot.');
    await expect(tarjeta(page).getByRole('link', { name: /Escríbenos por WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    expect(red.estado).toBeGreaterThan(0);
  });

  test('se marca con lo que dice el servidor: con la clase reservable y el enlace compartido, se ofrecen las alumnas', async ({ page }) => {
    await montar(page, { estado: { ...RECIEN, claseReservable: true, enlaceCompartido: true } });
    await expect(tarjeta(page).getByTestId('paso-de-cinco')).toHaveText('Paso 4 de 5', { timeout: 60_000 });
    await expect(tarea(page, 'primera-clase')).toHaveAttribute('data-estado', 'hecha');
    await expect(tarea(page, 'compartir')).toHaveAttribute('data-estado', 'hecha');
    await expect(tarea(page, 'alumnas')).toHaveAttribute('data-estado', 'ahora');
    await expect(tarea(page, 'alumnas').getByRole('link', { name: 'Importar' })).toHaveAttribute('href', '/migracion');
  });

  test('con clase que una alumna nueva no puede reservar, dice qué falta en vez de «crea tu primera clase»', async ({ page }) => {
    await montar(page, { estado: { ...RECIEN, avisoClase: { texto: 'Una alumna nueva todavía no puede reservar desde tu app: pides bono para reservar y, sin Stripe, no puede comprarlo online.', href: '/configuracion?tab=conexiones#integracion-stripe' } } });
    const clase = tarea(page, 'primera-clase');
    await expect(clase).toContainText('sin Stripe, no puede comprarlo online', { timeout: 60_000 });
    await expect(clase.getByRole('link', { name: 'Ver qué falta' })).toHaveAttribute('href', '/configuracion?tab=conexiones#integracion-stripe');
    await expect(clase.getByRole('link', { name: 'Crear mi primera clase' })).toHaveCount(0);
  });

  test('«Omitir» ofrece la siguiente, sin darla por hecha, y se recuerda al volver', async ({ page }) => {
    await montar(page);
    await tarea(page, 'primera-clase').getByRole('button', { name: 'Omitir' }).click({ timeout: 60_000 });
    await expect(tarea(page, 'compartir')).toHaveAttribute('data-estado', 'ahora');
    await expect(tarea(page, 'primera-clase')).toHaveAttribute('data-estado', 'pendiente');
    await expect(tarjeta(page).getByTestId('paso-de-cinco')).toHaveText('Paso 2 de 5');
    await page.reload();
    await expect(tarea(page, 'compartir')).toHaveAttribute('data-estado', 'ahora', { timeout: 60_000 });
  });

  test('opcionales plegados, sin «SEPA»; con «Varias» sedes, «Abre tus otras 2 sedes»', async ({ page }) => {
    await montar(page, { estudio: { onb_centros: '3 estudios' } });
    const opc = tarjeta(page).getByTestId('opcionales-alta');
    await expect(opc).toContainText('0 de 5', { timeout: 60_000 });
    await opc.locator('summary').click();
    await expect(opc.getByRole('link', { name: /Cobra online con Stripe/ })).toContainText('si cobras en el estudio, no');
    await expect(opc.getByRole('link', { name: /Abre tus otras 2 sedes/ })).toHaveAttribute('href', '/suscripcion');
    await expect(opc.getByRole('button', { name: /Visita guiada completa/ })).toBeVisible();
    await expect(opc).not.toContainText('SEPA');
  });

  test('«Compartir mi enlace»: «Copiado» solo si se copió, se apunta y la tarea se marca', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const red = await montar(page, { estado: { ...RECIEN, claseReservable: true } });
    await tarea(page, 'compartir').getByRole('button', { name: 'Compartir mi enlace' }).click({ timeout: 60_000 });
    const dialogo = page.getByTestId('compartir-enlace');
    await expect(dialogo.getByRole('heading', { name: 'Comparte el enlace de tu app' })).toBeVisible();
    await expect(dialogo).toContainText('/portal/studio-carmen');
    await expect(dialogo).not.toContainText('/reservar/');
    // El QR para recepción es el de la app (no el de la página de reservas).
    await dialogo.getByRole('button', { name: 'Código QR' }).click();
    await expect(page.getByRole('dialog', { name: 'Código QR · App de tus alumnas' })).toBeVisible();
    await page.keyboard.press('Escape');
    await dialogo.getByRole('button', { name: 'Copiar' }).click();
    await expect(dialogo.getByRole('button', { name: 'Copiado' })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/portal\/studio-carmen$/);
    await expect.poll(() => pasos(red, 'enlace_compartido').length).toBe(1);
    expect(pasos(red, 'enlace_compartido')[0].detalle).toBe('copiar');
    await page.keyboard.press('Escape');
    await expect(tarea(page, 'compartir')).toHaveAttribute('data-estado', 'hecha');
  });

  test('si el navegador no deja copiar (Safari), no dice «Copiado» ni apunta nada en el embudo — y se intentó de verdad', async ({ page }) => {
    // Con un contador: «no dijo Copiado» puede ser verdad porque no se intentó nada.
    await page.addInitScript(() => {
      (window as unknown as { __intentosCopiar: number }).__intentosCopiar = 0;
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: () => {
            (window as unknown as { __intentosCopiar: number }).__intentosCopiar++;
            return Promise.reject(new DOMException('NotAllowedError'));
          },
        },
        configurable: true,
      });
    });
    const red = await montar(page, { estado: { ...RECIEN, claseReservable: true } });
    await tarea(page, 'compartir').getByRole('button', { name: 'Compartir mi enlace' }).click({ timeout: 60_000 });
    const dialogo = page.getByTestId('compartir-enlace');
    await expect(dialogo).toContainText('/portal/studio-carmen');
    await dialogo.getByRole('button', { name: 'Copiar' }).click();
    await expect(dialogo.getByText('No hemos podido copiar. Selecciona el enlace y cópialo a mano.')).toBeVisible();
    await expect(dialogo.getByRole('button', { name: 'Copiado' })).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __intentosCopiar: number }).__intentosCopiar)).toBeGreaterThan(0);
    expect(pasos(red, 'enlace_compartido')).toHaveLength(0);
  });

  test('sin clase reservable, antes de mandar el enlace se dice', async ({ page }) => {
    await montar(page);
    await tarea(page, 'primera-clase').getByRole('button', { name: 'Omitir' }).click({ timeout: 60_000 });
    await tarea(page, 'compartir').getByRole('button', { name: 'Compartir mi enlace' }).click();
    await expect(page.getByTestId('compartir-enlace')).toContainText('todavía no hay ninguna clase que una alumna nueva pueda reservar');
  });

  test('si el servidor falla, la lista sigue con lo que sabe el panel y no enseña ni recorrido ni plan', async ({ page }) => {
    const red = await montar(page, { estado: { error: 'x' }, estadoStatus: 500 });
    await expect(tarjeta(page).getByTestId('paso-de-cinco')).toHaveText('Paso 2 de 5', { timeout: 60_000 });
    await page.waitForTimeout(1500);
    expect(red.estado, 'sí se preguntó').toBeGreaterThan(0);
    await expect(page.getByTestId('recorrido-rapido')).toHaveCount(0);
    await expect(page.getByTestId('tu-plan')).toHaveCount(0);
    expect(red.pasos).toHaveLength(0);
  });
});

test.describe('el recorrido rápido de tres paradas', () => {
  test('sale la primera vez, una sola, con «Saltar»; no arranca la visita guiada', async ({ page }) => {
    const red = await montar(page, { estado: { ...RECIEN, recorridoVisto: false } });
    const bocadillo = page.getByTestId('recorrido-rapido');
    await expect(bocadillo).toBeVisible({ timeout: 60_000 });
    await expect(bocadillo).toContainText('1 / 3');
    await expect(bocadillo).toContainText('¿Qué es esta lista?');
    await expect.poll(() => pasos(red, 'recorrido_visto').length).toBe(1);
    await bocadillo.getByRole('button', { name: 'Siguiente' }).click();
    await expect(bocadillo).toContainText('¿Dónde está mi horario?');
    await bocadillo.getByRole('button', { name: 'Saltar' }).click();
    await expect(bocadillo).toHaveCount(0);
    // La visita de 43 pasos no se ha abierto.
    await expect(page.getByText(/Capítulo 1/)).toHaveCount(0);
    // Al volver, aunque el servidor no lo hubiera apuntado, este navegador lo recuerda.
    await page.reload();
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(bocadillo).toHaveCount(0);
    expect(pasos(red, 'recorrido_visto')).toHaveLength(1);
  });

  test('las tres paradas hasta «Entendido», y «Ver el recorrido rápido otra vez» lo abre', async ({ page }) => {
    await montar(page, { estado: { ...RECIEN, recorridoVisto: false } });
    const bocadillo = page.getByTestId('recorrido-rapido');
    await expect(bocadillo).toBeVisible({ timeout: 60_000 });
    await bocadillo.getByRole('button', { name: 'Siguiente' }).click();
    await bocadillo.getByRole('button', { name: 'Siguiente' }).click();
    await expect(bocadillo).toContainText('¿Y si me atasco?');
    await expect(bocadillo).toContainText('3 / 3');
    await bocadillo.getByRole('button', { name: 'Entendido' }).click();
    await expect(bocadillo).toHaveCount(0);
    await tarjeta(page).getByRole('button', { name: 'Ver el recorrido rápido otra vez' }).click();
    await expect(bocadillo).toContainText('1 / 3');
  });

  test('con el recorrido ya visto en el servidor, no sale', async ({ page }) => {
    await montar(page);
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('recorrido-rapido')).toHaveCount(0);
  });
});

test.describe('WhatsApp con una persona mientras la lista no esté terminada', () => {
  test('a la vista con la lista a medias, y fuera cuando está terminada', async ({ page }) => {
    await montar(page);
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('[data-whatsapp-soporte]')).toBeVisible();
  });

  test('terminada: «Tu estudio está en marcha», con la lista plegada, y sin WhatsApp flotante', async ({ page }) => {
    await montar(page, { estado: { ...RECIEN, claseReservable: true, enlaceCompartido: true, alumnas: true, primeraReserva: true, planEnsenado: true } });
    await expect(tarjeta(page).getByRole('heading', { name: 'Tu estudio está en marcha' })).toBeVisible({ timeout: 60_000 });
    await expect(tarjeta(page)).toContainText('Has hecho los 5 primeros pasos. Lo que queda es opcional.');
    await expect(tarjeta(page).getByTestId('paso-de-cinco')).toHaveText('5 de 5 hechos');
    await expect(tarjeta(page).getByTestId('tareas-alta')).toHaveCount(0);
    await expect(page.locator('[data-whatsapp-soporte]')).toHaveCount(0);
  });
});

test.describe('«Tu plan, sin sorpresas», una vez tras la primera reserva', () => {
  test('con el uso real, «Ver los planes» y «Ahora no»; se apunta una vez', async ({ page }) => {
    const red = await montar(page, {
      estado: { ...RECIEN, claseReservable: true, alumnas: true, primeraReserva: true },
      billing: { gratis: GRATIS },
    });
    const plan = page.getByTestId('tu-plan');
    await expect(plan.getByRole('heading', { name: 'Tu plan, sin sorpresas' })).toBeVisible({ timeout: 60_000 });
    await expect(plan).toContainText('Founding Studio · gratis');
    await expect(plan.getByRole('meter', { name: 'Alumnas activas' })).toHaveAttribute('aria-valuenow', '2');
    await expect(plan.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuemax', '250');
    await expect(plan).toContainText('Centro de Control, sustituciones automáticas y redacción con IA aparte');
    await expect(plan.getByRole('link', { name: 'Ver los planes' })).toHaveAttribute('href', '/suscripcion');
    await expect.poll(() => pasos(red, 'plan_ensenado').length).toBe(1);
    await plan.getByRole('button', { name: 'Ahora no' }).click();
    await expect(plan).toHaveCount(0);
    expect(pasos(red, 'plan_ensenado')).toHaveLength(1);
  });

  test('ya enseñado, no vuelve', async ({ page }) => {
    const red = await montar(page, {
      estado: { ...RECIEN, claseReservable: true, alumnas: true, primeraReserva: true, planEnsenado: true },
      billing: { gratis: GRATIS },
    });
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('tu-plan')).toHaveCount(0);
    expect(pasos(red, 'plan_ensenado')).toHaveLength(0);
  });

  test('sin Founding gratis (sin `gratis` en el estado de facturación), no se enseña ni se apunta', async ({ page }) => {
    const red = await montar(page, { estado: { ...RECIEN, claseReservable: true, alumnas: true, primeraReserva: true } });
    await expect(tarjeta(page)).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('tu-plan')).toHaveCount(0);
    expect(red.estado).toBeGreaterThan(0);
    expect(pasos(red, 'plan_ensenado')).toHaveLength(0);
  });

  test('con «Varias» sedes, el plan que se enseña es Cadena', async ({ page }) => {
    await montar(page, {
      estado: { ...RECIEN, claseReservable: true, alumnas: true, primeraReserva: true },
      billing: { gratis: GRATIS },
      estudio: { onb_centros: '3 estudios' },
    });
    const plan = page.getByTestId('tu-plan');
    await expect(plan).toContainText('Founding Studio · gratis · 1 sede', { timeout: 60_000 });
    await expect(plan).toContainText('plan Cadena, 149 €/mes, una sola suscripción para toda la cadena');
  });
});

test.describe('los vacíos que enseñan', () => {
  const calendario = async (p: Page) => {
    await p.route('**/api/calendario**', (r) => json(r, {
      sesiones: [], reservas: [], sustituciones: [], salas: [], instructores: [],
      horaApertura: '07:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
    }));
  };

  test('Calendario sin clases: «Crea tu primera clase» con su franja, y abre «Tu primera clase»', async ({ page }) => {
    await montar(page, { estudio: { hora_apertura: '07:00:00', hora_cierre: '22:00:00' }, antes: calendario });
    await page.goto('/calendario');
    const vacio = page.getByTestId('calendario-sin-clases');
    await expect(vacio.getByRole('heading', { name: 'Crea tu primera clase' })).toBeVisible({ timeout: 60_000 });
    await expect(vacio).toContainText('Calendario · esta semana');
    await expect(vacio.getByLabel('Tu horario: de 07:00 a 22:00, todavía sin clases')).toBeVisible();
    await expect(vacio).toContainText('En cuanto haya una clase aquí, tus alumnas podrán reservarla desde su app.');
    await expect(vacio.getByRole('link', { name: 'Importar mi horario (Excel)' })).toHaveAttribute('href', '/calendario/importar');
    await vacio.getByRole('button', { name: 'Crear mi primera clase' }).click();
    await expect(page.getByTestId('primera-clase-en-calendario')).toBeVisible();
  });

  test('«Crear clase» (?nueva=1) en un estudio recién creado abre «Tu primera clase», no el aviso de lo que falta', async ({ page }) => {
    await montar(page, { antes: calendario });
    await page.goto('/calendario?nueva=1');
    await expect(page.getByTestId('primera-clase-en-calendario')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/Para crear la clase falta/)).toHaveCount(0);
  });

  test('Clientas sin alumnas: «Aún no tienes alumnas» y las tres maneras', async ({ page }) => {
    await montar(page);
    await page.goto('/clientas');
    await expect(page.getByRole('heading', { name: 'Aún no tienes alumnas' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Tres maneras')).toBeVisible();
    await expect(page.getByText('y se dan de alta solas al reservar.')).toBeVisible();
    await expect(page.getByText('de tu Excel o de tu programa anterior.')).toBeVisible();
  });
});

test.describe('fuera del Resumen y en el móvil', () => {
  test('en otra pantalla, la píldora «Primeros pasos · 1/5» se abre en un menú con las cinco', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await montar(page);
    await page.goto('/clientas');
    const pildora = page.getByRole('button', { name: /Abrir «Pon en marcha tu estudio»: 1 de 5 hechos/ }).first();
    await expect(pildora).toBeVisible({ timeout: 60_000 });
    await pildora.click();
    const menu = page.locator('[data-primeros-pasos-lista]').first();
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Crear mi primera clase' })).toHaveAttribute('href', '/calendario?primera=1');
  });

  test('en el móvil, la píldora abre la hoja con «¿Te atascas? Escríbenos por WhatsApp»', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await montar(page);
    await page.goto('/clientas');
    const pildora = page.getByRole('button', { name: /Abrir «Pon en marcha tu estudio»/ }).last();
    await expect(pildora).toBeVisible({ timeout: 60_000 });
    await pildora.click();
    const hoja = page.getByRole('dialog', { name: 'Pon en marcha tu estudio' });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByRole('link', { name: '¿Te atascas? Escríbenos por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('`/dashboard?compartir=1` (el aviso de las 72 h) abre «Comparte el enlace de tu app»', async ({ page }) => {
    await montar(page);
    await page.goto('/dashboard?compartir=1');
    await expect(page.getByTestId('compartir-enlace')).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

