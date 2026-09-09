import { test, expect, type Page } from '@playwright/test';
import { SLUG, sembrarSociaLista } from './socia-lista';

// VALORACIÓN INICIAL — lo que la alumna cuenta de sí misma antes de empezar.
//
// Lo que se comprueba no es que las pantallas existan, sino las reglas que
// hacen que esto sea honesto:
//  · que sin consentimiento de datos de salud NO se pregunta por lesiones, y
//    aun así se puede terminar;
//  · que cambiar de opinión sobre las molestias BORRA las zonas, en vez de
//    dejarlas escondidas en el payload;
//  · que el botón de guardar no miente cuando el servidor dice que no.
//
// ⚠️ Con CONTADOR de peticiones en los caminos de escritura. Un test de esta
// pantalla sin contador puede salir verde sin haber intentado guardar nunca —
// el fallo documentado del repo.

const base = `/portal/${SLUG}`;

interface Opts {
  /** ¿El estudio la tiene activada? */
  activa?: boolean;
  /** ¿Ya dio su consentimiento de datos de salud? */
  conSalud?: boolean;
  /** Fuerza el rechazo del servidor al completar. */
  rechazarCompletar?: string;
}

async function montar(page: Page, o: Opts = {}) {
  const { activa = true, conSalud = true } = o;
  await sembrarSociaLista(page);

  const contador = { guardar: 0, completar: 0, consentir: 0 };

  await page.route((u) => u.pathname === '/api/public/valoracion', async (r) => {
    if (r.request().method() === 'GET') {
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ activa, conSalud, historial: { inicial: null, actual: null, borrador: null, vueltas: 0 } }),
      });
    }
    const cuerpo = JSON.parse(r.request().postData() ?? '{}') as { accion?: string; valoracion?: Record<string, unknown> };
    if (cuerpo.accion === 'guardar') contador.guardar++;
    if (cuerpo.accion === 'consentir-salud') contador.consentir++;
    if (cuerpo.accion === 'completar') {
      contador.completar++;
      (contador as Record<string, unknown>).ultimaValoracion = cuerpo.valoracion;
      if (o.rechazarCompletar) {
        return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: o.rechazarCompletar }) });
      }
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  return contador as typeof contador & { ultimaValoracion?: Record<string, unknown> };
}

const seguir = (page: Page) => page.getByTestId('continuar').click();

/**
 * Avanza hasta el resumen, sea cual sea el camino.
 *
 * ⚠️ Existe porque la PUERTA del consentimiento no tiene «Continuar» — tiene
 * sus dos botones propios, que es justo lo que la hace una puerta y no un paso
 * más. Un bucle que solo pulsara `continuar` se queda colgado ahí.
 */
async function avanzarHastaResumen(page: Page) {
  for (let i = 0; i < 8; i++) {
    if (await page.getByTestId('guardar-valoracion').count() > 0) return;
    const puerta = page.getByRole('button', { name: /prefiero no contarlo/i });
    if (await puerta.count() > 0) { await puerta.click(); continue; }
    await seguir(page);
  }
}

test.describe('Student PWA · valoración inicial', () => {
  test.describe.configure({ timeout: 150_000 });

  test('si el estudio no la ha activado, se dice — no se enseña un cuestionario vacío', async ({ page }) => {
    await montar(page, { activa: false });
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/todavía no está disponible/i)).toBeVisible({ timeout: 60_000 });
  });

  test('NUNCA se le enseña la palabra «Assessment»', async ({ page }) => {
    // Es el nombre interno del concepto y se queda dentro.
    await montar(page);
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /qué te gustaría conseguir/i })).toBeVisible({ timeout: 60_000 });
    expect((await page.content()).toLowerCase()).not.toContain('assessment');
  });

  test('una pregunta por pantalla, y no se avanza sin contestar la obligatoria', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /qué te gustaría conseguir/i })).toBeVisible({ timeout: 60_000 });
    // Sin elegir nada, «Continuar» no deja pasar: el objetivo es obligatorio.
    await expect(page.getByTestId('continuar')).toBeDisabled();
    await page.getByRole('button', { name: 'Mejorar mi movilidad' }).click();
    await expect(page.getByTestId('continuar')).toBeEnabled();
  });

  test('con un solo objetivo NO se pregunta cuál es el principal', async ({ page }) => {
    // No hay elección que hacer, así que la pantalla sobra.
    await montar(page);
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Mejorar mi postura' }).click({ timeout: 60_000 });
    await seguir(page);
    await expect(page.getByRole('heading', { name: /habías hecho pilates antes/i })).toBeVisible({ timeout: 30_000 });
  });

  test('con dos objetivos SÍ se pregunta cuál manda', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Mejorar mi postura' }).click({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Ganar fuerza' }).click();
    await seguir(page);
    await expect(page.getByRole('heading', { name: /si tuvieras que quedarte con una/i })).toBeVisible({ timeout: 30_000 });
  });

  test('⚠️ SIN consentimiento de salud no se pregunta por lesiones, y se termina igual', async ({ page }) => {
    // Un consentimiento que hay que dar para poder acabar no es consentimiento.
    const c = await montar(page, { conSalud: false });
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ganar fuerza' }).click({ timeout: 60_000 });
    await seguir(page);
    await page.getByRole('button', { name: 'Nunca' }).click();
    await seguir(page);
    await page.getByRole('button', { name: 'Principiante' }).click();
    await seguir(page);

    // La PUERTA del consentimiento, no la pregunta directamente. Y tiene que
    // ser alcanzable: es un paso propio precisamente porque, filtrando los
    // pasos de salud, antes no se llegaba nunca a ella.
    await expect(page.getByRole('heading', { name: /antes de esta parte/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /prefiero no contarlo/i })).toBeVisible();
    await page.getByRole('button', { name: /prefiero no contarlo/i }).click();

    // Y desde ahí se puede llegar al final sin haber dado ningún dato de salud.
    await expect(page.getByRole('heading', { name: /te mueves fuera de aquí|cómo te gustaría sentirte|esto es lo que nos has contado/i }))
      .toBeVisible({ timeout: 30_000 });
    expect(c.consentir).toBe(0);
  });

  test('⚠️ el consentimiento de salud NO manda el texto: lo pone el servidor', async ({ page }) => {
    // El texto es la PRUEBA de qué aceptó, y este repo decide la vigencia
    // comparándolo con el vigente. Si viajara en el cuerpo, esa prueba se
    // autocertificaría: el navegador diría qué aceptó. Se deriva en la ruta.
    let cuerpoConsentimiento: Record<string, unknown> | null = null;
    await sembrarSociaLista(page);
    await page.route((u) => u.pathname === '/api/public/valoracion', async (r) => {
      if (r.request().method() === 'GET') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ activa: true, conSalud: false, historial: null }) });
      }
      const b = JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>;
      if (b.accion === 'consentir-salud') cuerpoConsentimiento = b;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ganar fuerza' }).click({ timeout: 60_000 });
    await seguir(page);
    await page.getByRole('button', { name: 'Nunca' }).click();
    await seguir(page);
    await page.getByRole('button', { name: 'Principiante' }).click();
    await seguir(page);
    // La pantalla SÍ le enseña el texto: no se le pide un sí a ciegas.
    await expect(page.getByText(/información sobre tu salud/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /sí, podéis guardarlo/i }).click();

    await expect.poll(() => cuerpoConsentimiento, { timeout: 30_000 }).not.toBeNull();
    expect(Object.keys(cuerpoConsentimiento ?? {})).not.toContain('textoConsentimiento');
  });

  test('⚠️ decir que NO hay molestias borra las zonas que se habían marcado', async ({ page }) => {
    // El peor de los estados incoherentes: la ficha de la instructora diría
    // «lumbar» de alguien que acaba de decir que no le duele nada.
    const c = await montar(page, { conSalud: true });
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ganar fuerza' }).click({ timeout: 60_000 });
    await seguir(page);
    await page.getByRole('button', { name: 'Nunca' }).click();
    await seguir(page);
    await page.getByRole('button', { name: 'Principiante' }).click();
    await seguir(page);
    // Con consentimiento la puerta no aparece: se va directa a molestias.
    await expect(page.getByRole('heading', { name: /algo que debamos tener en cuenta/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /sí, hay algo/i }).click();
    await seguir(page);
    // «Cómo sientes tu cuerpo» es opcional y va entre medias.
    await seguir(page);
    await page.getByRole('button', { name: 'Zona lumbar' }).click();
    await seguir(page);

    // Vuelve atrás hasta molestias y cambia de opinión.
    for (let i = 0; i < 4; i++) {
      if (await page.getByRole('heading', { name: /algo que debamos tener en cuenta/i }).count() > 0) break;
      await page.getByRole('button', { name: 'Atrás' }).click();
    }
    await expect(page.getByRole('heading', { name: /algo que debamos tener en cuenta/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /no, nada que destacar/i }).click();

    // Hasta el final y guardar.
    await avanzarHastaResumen(page);
    await page.getByTestId('guardar-valoracion').click();

    await expect.poll(() => c.completar, { timeout: 30_000 }).toBeGreaterThan(0);
    const v = c.ultimaValoracion as { zonas?: string[]; tieneMolestias?: boolean };
    expect(v.tieneMolestias).toBe(false);
    expect(v.zonas ?? []).toEqual([]);
  });

  test('si el servidor rechaza al guardar, NO se dice que está hecho', async ({ page }) => {
    const c = await montar(page, { conSalud: false, rechazarCompletar: 'No hemos podido guardar tu valoración.' });
    await page.goto(`${base}/valoracion`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Ganar fuerza' }).click({ timeout: 60_000 });
    await seguir(page);
    await page.getByRole('button', { name: 'Nunca' }).click();
    await seguir(page);
    await page.getByRole('button', { name: 'Principiante' }).click();
    await seguir(page);
    await avanzarHastaResumen(page);
    await page.getByTestId('guardar-valoracion').click();

    // El contador prueba que la petición SALIÓ: sin esto, «no mintió» podría
    // ser verdad por no haber intentado nada.
    await expect.poll(() => c.completar, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect(page.getByTestId('valoracion-error')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/gracias/i)).toHaveCount(0);
  });

  test('la tarjeta de Inicio desaparece cuando ya la ha completado', async ({ page }) => {
    // Una invitación que sigue ahí después de aceptarla es ruido permanente.
    await sembrarSociaLista(page);
    await page.route((u) => u.pathname === '/api/public/valoracion', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        activa: true, conSalud: true,
        historial: { inicial: null, actual: { id: 'v1', estado: 'COMPLETADA', creadoEn: '2026-08-01T10:00:00Z', valoracion: {} }, borrador: null, vueltas: 1 },
      }),
    }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /qué te apetece hoy/i })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('card-valoracion')).toHaveCount(0);
  });

  test('pendiente, la tarjeta de Inicio la ofrece', async ({ page }) => {
    await sembrarSociaLista(page);
    await page.route((u) => u.pathname === '/api/public/valoracion', (r) => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ activa: true, conSalud: false, historial: { inicial: null, actual: null, borrador: null, vueltas: 0 } }),
    }));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('card-valoracion')).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId('card-valoracion')).toContainText(/cuéntanos cómo empiezas/i);
  });
});
