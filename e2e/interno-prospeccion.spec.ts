import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Prospección en frío: la pantalla existe para que nadie envíe un correo que no
// ha leído. Lo que se prueba aquí es exactamente eso — no que la lista pinte,
// sino que la red de seguridad esté puesta y se vea:
//
//   · un correo que afirma algo falso sobre el estudio sale marcado EN ROJO,
//     con el dato real al lado, antes de que nadie lo apruebe;
//   · el botón de enviar no está disponible si no hay nada aprobado;
//   · sin buzón configurado se avisa y no se deja enviar, en vez de dejar diez
//     correos marcados como fallidos por un problema de configuración.
//
// Las reglas de `revisarBorrador` se prueban aparte y a fondo en
// lib/interno/prospeccion.test.ts (25 casos). Aquí se prueba que la pantalla
// las ENSEÑE.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Un estudio del que SÍ sabemos que usa Bsport y SÍ tiene Instagram.
const PROSPECTO = {
  id: 'lead-1', email: 'hola@pilatesbcn.es', estudio: 'Pilates BCN', ciudad: 'Barcelona',
  web: 'pilatesbcn.es', instagram: '@pilatesbcn', softwareActual: 'Bsport',
  estado: 'NUEVO', creadoEn: '2026-09-01T10:00:00Z',
};

const borrador = (o: Partial<{ id: string; asunto: string; cuerpo: string; estado: string }> = {}) => ({
  id: 'p-1', leadId: 'lead-1',
  asunto: 'Sobre las sustituciones en Pilates BCN',
  cuerpo: 'Hola,\n\nHe visto Pilates BCN y que usáis Bsport. Cubrir una baja sigue siendo manual.\n\nMarcos — Tentare',
  estado: 'BORRADOR', aprobadoPor: null, aprobadoEn: null, enviadoEn: null, error: null,
  generadoEn: '2026-09-01T11:00:00Z',
  ...o,
});

async function montar(page: Page, opts: {
  prospectos?: unknown[]; borradores?: unknown[]; buzonConfigurado?: boolean;
} = {}) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['admin.full'] }));
  await page.route('**/api/interno/crecimiento**', route =>
    json(route, { leads: [], estudios: [], peticiones: [] }));
  await page.route('**/api/interno/prospeccion', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    return json(route, {
      prospectos: opts.prospectos ?? [PROSPECTO],
      borradores: opts.borradores ?? [borrador()],
      buzonConfigurado: opts.buzonConfigurado ?? true,
    });
  });

  await page.goto('/interno/crecimiento');
  await page.getByRole('button', { name: 'Prospección' }).click();
}

test.describe('Prospección en frío', () => {
  test('la cola enseña el dato real del estudio junto al correo que habla de él', async ({ page }) => {
    await montar(page);

    await expect(page.getByRole('heading', { name: 'Pilates BCN' })).toBeVisible({ timeout: 30_000 });
    // El software real, al lado del texto: comprobar la afirmación tiene que
    // costar una mirada, no abrir otra pestaña.
    await expect(page.getByText('usa Bsport')).toBeVisible();
    // `exact` porque el handle es también un trozo del email (hola@pilatesbcn.es).
    await expect(page.getByText('@pilatesbcn', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /Asunto del correo a Pilates BCN/ })).toBeVisible();
  });

  test('⚠️ un correo que nombra el software EQUIVOCADO sale avisado en rojo', async ({ page }) => {
    // El fallo que convierte un correo bueno en uno que delata al bot: el CSV
    // dice Bsport y el texto dice Momence.
    await montar(page, {
      borradores: [borrador({
        cuerpo: 'Hola,\n\nHe visto Pilates BCN y que usáis Momence.\n\nMarcos — Tentare',
      })],
    });

    await expect(page.getByText(/Menciona "momence"/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/consta Bsport/i)).toBeVisible();
  });

  test('el aviso desaparece en cuanto se corrige el texto a mano', async ({ page }) => {
    await montar(page, {
      borradores: [borrador({
        cuerpo: 'Hola,\n\nHe visto Pilates BCN y que usáis Momence.\n\nMarcos — Tentare',
      })],
    });

    const aviso = page.getByText(/Menciona "momence"/i);
    await expect(aviso).toBeVisible({ timeout: 30_000 });

    const cuerpo = page.getByRole('textbox', { name: /Cuerpo del correo a Pilates BCN/ });
    await cuerpo.fill('Hola,\n\nHe visto Pilates BCN y que usáis Bsport.\n\nMarcos — Tentare');

    // Se revisa lo que se está VIENDO, no lo guardado.
    await expect(aviso).toHaveCount(0);
  });

  test('un placeholder sin rellenar se marca antes de que nadie lo apruebe', async ({ page }) => {
    await montar(page, {
      borradores: [borrador({ asunto: 'Hola [NOMBRE], una idea para Pilates BCN' })],
    });
    await expect(page.getByText(/Hueco sin rellenar/)).toBeVisible({ timeout: 30_000 });
  });

  test('sin nada aprobado no aparece el botón de enviar', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Pilates BCN' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Enviar siguiente lote/ })).toHaveCount(0);
  });

  test('con un correo aprobado, el botón dice cuántos van en el lote', async ({ page }) => {
    await montar(page, { borradores: [borrador({ estado: 'APROBADO' })] });
    await expect(page.getByRole('button', { name: /Enviar siguiente lote \(1\)/ })).toBeVisible({ timeout: 30_000 });
  });

  test('⚠️ sin buzón configurado se avisa y el envío queda deshabilitado', async ({ page }) => {
    // Enviar sin credenciales dejaría diez filas FALLIDO por un problema de
    // configuración que no tiene nada que ver con los destinatarios.
    await montar(page, {
      borradores: [borrador({ estado: 'APROBADO' })],
      buzonConfigurado: false,
    });
    await expect(page.getByText(/buzón de envío no está configurado/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Enviar siguiente lote/ })).toBeDisabled();
  });

  test('aprobar manda la acción al servidor y la tarjeta pasa a "listo para enviar"', async ({ page }) => {
    let recibido: Record<string, unknown> | null = null;
    await page.route('**/api/interno/prospeccion/borrador', async route => {
      recibido = route.request().postDataJSON() as Record<string, unknown>;
      return json(route, { ok: true, borrador: borrador({ estado: 'APROBADO' }) });
    });
    await montar(page);

    await page.getByRole('button', { name: 'Aprobar' }).click();

    // ⚠️ Sin comprobar que la petición SALIÓ, este test pasaría igual con un
    // botón que no hace nada (el mismo agujero que ya documentó el repo con los
    // tests de camino de fallo sin contador de intentos).
    await expect.poll(() => recibido).not.toBeNull();
    expect(recibido!.accion).toBe('aprobar');
    expect(recibido!.id).toBe('p-1');
    await expect(page.getByText('Listo para enviar')).toBeVisible();
  });

  test('sin ningún estudio importado lo dice, en vez de una lista vacía', async ({ page }) => {
    await montar(page, { prospectos: [], borradores: [] });
    await expect(page.getByText(/Todavía no has importado ningún estudio/)).toBeVisible({ timeout: 30_000 });
  });

  test('los correos que fallaron se enseñan con su error SMTP', async ({ page }) => {
    await montar(page, {
      borradores: [borrador({ estado: 'FALLIDO' })],
    });
    await expect(page.getByText(/no salieron/)).toBeVisible({ timeout: 30_000 });
  });
});
