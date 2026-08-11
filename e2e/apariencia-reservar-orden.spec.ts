import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Reordenar las secciones de la página pública de reservas (`/reservar/<slug>`)
// desde el rail del editor de Apariencia.
//
// Lo que aquí se comprueba de verdad es que el orden ELEGIDO es el orden
// GUARDADO: el resto de la cadena (que lo guardado llega a la página) ya vive
// en `lib/reservar/secciones.test.ts`, que es puro y no necesita navegador. Lo
// que un unitario no puede ver es si el arrastre llega al cuerpo del PUT.
//
// Y la regla que más importa: el horario NO se puede mover ni ocultar. Una
// página de reservas sin horario está rota, así que su fila no tiene ni asa ni
// ojo — se comprueba que no existen, no solo que "no funcionan".
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, reservar = { orden: [] as string[], ocultos: [] as string[] }) {
  const puts: Record<string, unknown>[] = [];
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => {
    if (route.request().method() === 'PUT') {
      puts.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, {});
    }
    return json(route, {
      orden: [], ocultos: [], menuPosition: 'lateral',
      home: { orden: [], ocultos: [] }, reservar,
    });
  });
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED' })));
  await page.route('**/api/portal-bloques**', route => {
    if (new URL(route.request().url()).searchParams.get('pantalla') === 'todas') {
      return json(route, { home: [], clases: [], bonos: [] });
    }
    return json(route, []);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  // Dos clics porque son dos cosas distintas, aquí y en todas las filas del
  // rail: el nombre SELECCIONA la página (es lo que hace aparecer el lienzo y
  // el botón de guardar en la barra) y el chevron DESPLIEGA su lista.
  await page.getByRole('button', { name: 'Secciones de la página', exact: true }).click();
  await page.getByLabel('Desplegar Secciones de la página').click();
  return { puts };
}

test.describe('Página pública de reservas — orden de secciones', () => {
  test('el orden por defecto es el de la página, con el horario en su sitio', async ({ page }) => {
    await montar(page);
    const filas = page.locator('[aria-label^="Reordenar "], [aria-label="Ocultar Portada"]').first();
    await expect(filas).toBeVisible();

    // El esquema del lienzo enseña el orden completo, fijas incluidas.
    const esquema = page.getByText('Tu página de reservas').locator('..');
    await expect(esquema.getByText('Portada', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Horario y reservas', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Cifras del estudio', { exact: true })).toBeVisible();
    await expect(esquema.getByText('Contacto y pie', { exact: true })).toBeVisible();
  });

  test('⚠️ el horario no ofrece ni arrastrar ni ocultar', async ({ page }) => {
    await montar(page);
    // Las movibles sí las tienen; la fija, ninguna de las dos.
    await expect(page.getByLabel('Reordenar Portada')).toBeVisible();
    await expect(page.getByLabel('Reordenar Horario y reservas')).toHaveCount(0);
    await expect(page.getByLabel('Ocultar Horario y reservas')).toHaveCount(0);
  });

  test('ocultar una sección y guardar manda ese id en `ocultos`', async ({ page }) => {
    const { puts } = await montar(page);
    await page.getByLabel('Ocultar Cifras del estudio').click();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();

    expect(puts).toHaveLength(1);
    const enviado = puts[0].reservar as { orden: string[]; ocultos: string[] };
    expect(enviado.ocultos).toEqual(['cifras']);
    // El horario nunca viaja en `orden` — no es reordenable, así que guardarlo
    // solo daría trabajo a `ordenarSecciones` para volver a descartarlo.
    expect(enviado.orden).not.toContain('horario');
  });

  test('arrastrar la portada al final cambia el orden que se guarda', async ({ page }) => {
    const { puts } = await montar(page);
    // A mano y no con `dragTo`: el PointerSensor de dnd-kit exige 5 px de
    // movimiento para activarse y luego lee cada `pointermove`, así que un
    // salto único de origen a destino no levanta nada.
    const a = (await page.getByLabel('Reordenar Portada').boundingBox())!;
    const b = (await page.getByLabel('Reordenar Contacto y pie').boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(a.x + a.width / 2, a.y + ((b.y - a.y) * i) / 8 + a.height / 2);
    }
    await page.mouse.up();

    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();
    // El horario NO aparece en lo guardado ni cuando la portada le pasa por
    // encima: sigue sin ser una posición que nadie pueda elegir.
    expect((puts[0].reservar as { orden: string[] }).orden).toEqual(['cifras', 'contacto', 'portada']);
  });

  test('un orden ya guardado se lee y se vuelve a guardar igual', async ({ page }) => {
    const { puts } = await montar(page, { orden: ['contacto', 'cifras', 'portada'], ocultos: [] });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Ya se ve así en tu página de reservas/)).toBeVisible();
    expect((puts[0].reservar as { orden: string[] }).orden).toEqual(['contacto', 'cifras', 'portada']);
  });
});
