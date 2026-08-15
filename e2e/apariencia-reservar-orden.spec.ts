import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// /reservar dentro del editor a pantalla completa, UNIFICADA con el mismo
// constructor de bloques que ya usan Inicio/Clases/Bonos
// (theme-editor-fullscreen.tsx, components/theme/portal-bloques-editor.tsx) —
// ya no tiene su propio editor a medida (reservar-editor.tsx quedó reducido
// al esquema del lienzo central, ReservarEsquema). Mismo patrón de mock que
// e2e/apariencia-inicio-portal.spec.ts.
//
// Lo que sigue siendo propio de /reservar, y lo que este fichero comprueba:
//  · Portada y Horario son FIJAS (sin asa de arrastre) — vienen del catálogo,
//    no se ordenan a mano.
//  · Horario, además, NUNCA se puede ocultar — su fila no lleva ojo.
//  · Portada SÍ se puede ocultar — es lo que pide quien incrusta el widget en
//    una web con su propia cabecera. Fija Y ocultable a la vez, el caso que
//    justificó `fijoOcultable`.
//  · "Añadir bloque" SÍ se ofrece — components/reservar/bloque-reservar-render.tsx
//    es el render de catálogo propio de /reservar (su lenguaje visual, no el
//    del portal), montado en app/reservar/[slug]/page.tsx.
//
// El resto (reordenar las movibles, publicar, deshacer, el resto de tipos de
// bloque) ya lo cubre apariencia-inicio-portal.spec.ts sobre Inicio: no se
// repite aquí.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const BLOQUES_HOME_DEFAULT = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
  { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
];
const BLOQUES_CLASES_DEFAULT = [{ id: 'sistema-listadoClases', kind: 'sistema', sistemaId: 'listadoClases' }];
const BLOQUES_BONOS_DEFAULT = [{ id: 'sistema-listadoBonos', kind: 'sistema', sistemaId: 'listadoBonos' }];
const BLOQUES_RESERVAR_DEFAULT = [
  { id: 'sistema-reservarPortada', kind: 'sistema', sistemaId: 'reservarPortada', fijo: true, fijoOcultable: true },
  { id: 'sistema-reservarHorario', kind: 'sistema', sistemaId: 'reservarHorario', fijo: true },
  { id: 'sistema-reservarBonos', kind: 'sistema', sistemaId: 'reservarBonos' },
  { id: 'sistema-reservarSobre', kind: 'sistema', sistemaId: 'reservarSobre' },
  { id: 'sistema-reservarCifras', kind: 'sistema', sistemaId: 'reservarCifras' },
  { id: 'sistema-reservarContacto', kind: 'sistema', sistemaId: 'reservarContacto' },
];

async function montar(page: Page, opts: { bloquesReservar?: unknown[] } = {}) {
  const putsPorPantalla: Record<string, unknown[][]> = { home: [], clases: [], bonos: [], reservar: [] };
  const publicadasPorPantalla: Record<string, number> = { home: 0, clases: 0, bonos: 0, reservar: 0 };

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
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, {
    orden: [], ocultos: [], menuPosition: 'lateral',
    home: { orden: [], ocultos: [] }, portalHome: { orden: [], ocultos: [] }, reservar: { orden: [], ocultos: [] },
  }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED' }));

  const bloques: Record<string, unknown[]> = {
    home: BLOQUES_HOME_DEFAULT, clases: BLOQUES_CLASES_DEFAULT, bonos: BLOQUES_BONOS_DEFAULT,
    reservar: opts.bloquesReservar ?? BLOQUES_RESERVAR_DEFAULT,
  };
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    const pantalla = url.searchParams.get('pantalla') ?? 'home';
    if (pantalla === 'todas') return json(route, bloques);
    if (url.pathname.endsWith('/publish')) { publicadasPorPantalla[pantalla]++; return json(route, bloques[pantalla]); }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsPorPantalla[pantalla].push(body);
      bloques[pantalla] = body;
      return json(route, body);
    }
    return json(route, bloques[pantalla]);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  // "Página pública de reservas" no llega desplegada por defecto (solo Inicio
  // lo está) — hay que abrirla, como cualquier otro grupo del rail.
  await page.getByRole('button', { name: 'Desplegar Secciones de la página' }).click();
  return { putsPorPantalla, publicadasPorPantalla };
}

async function publicar(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publicar/ }).click();
}

test.describe('Editor a pantalla completa — /reservar unificada con el constructor de bloques', () => {
  test('las 6 secciones de siempre, con sus nombres', async ({ page }) => {
    await montar(page);
    for (const label of ['Portada', 'Horario y reservas', 'Bonos y membresías', 'Sobre nosotros', 'Cifras del estudio', 'Contacto y pie']) {
      await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 30_000 });
    }
  });

  test('⚠️ Horario no ofrece ni arrastrar ni ocultar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Horario y reservas', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reordenar Horario y reservas' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Ocultar Horario y reservas|Mostrar Horario y reservas/ })).toHaveCount(0);
  });

  test('⚠️ Portada no ofrece arrastrar, pero SÍ ocultar — fija y ocultable a la vez', async ({ page }) => {
    const { putsPorPantalla } = await montar(page);
    await expect(page.getByText('Portada', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reordenar Portada' })).toHaveCount(0);

    const ocultar = page.getByRole('button', { name: 'Ocultar Portada' });
    await expect(ocultar).toBeVisible();
    await ocultar.click();
    await expect(page.getByRole('button', { name: 'Mostrar Portada' })).toBeVisible();

    await expect(page.locator('[data-estado-guardado]')).toHaveText(/Guardado/, { timeout: 15_000 });
    const guardado = putsPorPantalla.reservar.at(-1) as Array<{ sistemaId?: string; oculto?: boolean }>;
    const portada = guardado.find((b) => b.sistemaId === 'reservarPortada');
    expect(portada?.oculto).toBe(true);
  });

  test('ocultar y publicar manda el borrador de reservar y lo publica junto al resto', async ({ page }) => {
    const { putsPorPantalla, publicadasPorPantalla } = await montar(page);
    await expect(page.getByText('Sobre nosotros', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ocultar Sobre nosotros' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar Sobre nosotros' })).toBeVisible();

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques/publish') && r.url().includes('pantalla=reservar')),
      publicar(page),
    ]);

    expect(publicadasPorPantalla.reservar).toBe(1);
    expect(publicadasPorPantalla.home).toBe(1);
    const guardado = putsPorPantalla.reservar.at(-1) as Array<{ sistemaId?: string; oculto?: boolean }>;
    expect(guardado.find((b) => b.sistemaId === 'reservarSobre')?.oculto).toBe(true);
    await expect(page.getByText('¡Publicado!')).toBeVisible();
  });

  test('las movibles (Bonos/Sobre/Cifras/Contacto) sí se pueden reordenar y ocultar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Bonos y membresías', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reordenar Bonos y membresías' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ocultar Bonos y membresías' })).toBeVisible();
  });

  test('añadir un bloque de texto, configurarlo y publicar manda el borrador y publica reservar', async ({ page }) => {
    const { putsPorPantalla, publicadasPorPantalla } = await montar(page);
    await expect(page.getByText('Contacto y pie', { exact: true })).toBeVisible({ timeout: 30_000 });

    // Dos "Añadir bloque" en la página (Inicio, que llega desplegado por
    // defecto, y Reservar) — se acota al de DESPUÉS de "Contacto y pie" para
    // no ambigüedad con el de Inicio.
    const filas = page.getByRole('button', { name: 'Añadir bloque' });
    await expect(filas).toHaveCount(2);
    await filas.nth(1).click();
    await page.getByRole('button', { name: /^Texto/ }).click();
    await page.locator('textarea').first().fill('Clases de Pilates para todos los niveles');

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques/publish') && r.url().includes('pantalla=reservar')),
      publicar(page),
    ]);

    expect(publicadasPorPantalla.reservar).toBe(1);
    const guardado = putsPorPantalla.reservar.at(-1) as Array<{ kind: string }>;
    expect(guardado.some((b) => b.kind === 'texto')).toBe(true);
    await expect(page.getByText('¡Publicado!')).toBeVisible();
  });

  test('un bloque de sistema sin campos dice que solo se puede reordenar u ocultar', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Bonos y membresías', { exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Bonos y membresías', exact: true }).click();
    await expect(page.getByText(/solo puedes reordenarlo u ocultarlo/)).toBeVisible();
  });

  test('el esquema central enseña las 6 secciones, con Portada y Horario marcadas como fijas', async ({ page }) => {
    await montar(page);
    // El esquema es el lienzo cuando "reservar" está operativo — desplegar el
    // grupo (montar() ya lo hizo) no selecciona la pantalla por sí solo; hay
    // que clicar su nombre.
    await page.getByRole('button', { name: 'Secciones de la página', exact: true }).click();
    await expect(page.getByText('Tu página de reservas', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Va siempre, y en su sitio.')).toBeVisible();
    await expect(page.getByText('No cambia de sitio; se puede ocultar.')).toBeVisible();
  });
});
