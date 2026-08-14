import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace público de Tentare Network (app/network/instructoras, vista
// compartida en components/network-v2/MarketplaceLayout.tsx) — la pantalla
// que Google indexa, sin sesión. Pública + la sufre alguien fuera de Tentare
// (docs .claude/tentare-os.md §"WebKit"), así que corre también en
// `webkit-publico` (ver SPECS_WEBKIT, playwright.config.ts).
//
// Es un Server Component puro (docs/NETWORK-AUDIT-2.md §11): resuelve sus
// datos con getSupabaseAdmin() DENTRO del proceso del servidor Next, no con
// fetch() del navegador — page.route (nivel navegador) no puede interceptar
// esa llamada.
//
// ⚠️ HISTORIAL (2026-08-14): esta suite cubría solo lo determinista sin datos
// reales, porque el entorno de CI (Supabase dummy) siempre resolvía un
// listado VACÍO — y ese vacío dejó pasar un build de producción roto tres
// veces seguidas: `TarjetaInstructora` pasaba un handler de servidor a un
// `<Link>` de cliente, y como el `.map()` sobre los resultados nunca se
// ejecutaba en CI (siempre `[]`), el error solo aparecía en Vercel con datos
// reales. Cerrado sembrando `buscarPerfilesPublico` con `E2E_TEST=1`
// (`lib/network/publico.ts`, mismo patrón que `lib/studio-seo.ts`) — ahora el
// listado SÍ tiene resultados también en CI, y el `.map()` que rompió el
// build se ejercita en cada pasada.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Marketplace público (sin sesión)', () => {
  test('con perfiles sembrados, lista tarjetas reales — no un listado vacío', async ({ page }) => {
    await page.goto('/network/instructoras');

    await expect(page.getByRole('heading', { name: 'Instructoras de Pilates' })).toBeVisible({ timeout: 30_000 });
    // Los dos perfiles de la semilla (PERFILES_SEED_E2E), por nombre — no por
    // cantidad: contar tarjetas sería frágil si la semilla crece.
    await expect(page.getByText('Marta Gómez')).toBeVisible();
    await expect(page.getByText('Sofía Ruiz')).toBeVisible();
    // La tarjeta es un <Link>: si el prerender se rompiera otra vez (el
    // incidente real), esta pantalla no llegaría a cargar y las dos
    // aserciones de arriba ya habrían fallado.
    await expect(page.getByRole('link', { name: /Marta Gómez/ })).toHaveAttribute('href', '/network/instructoras/marta-gomez-e2e');
  });

  test('los filtros de especialidad cambian la URL sin recargar la página entera', async ({ page }) => {
    // Timeout generoso confirmado en vivo (sin error de consola de por
    // medio): el clic SÍ dispara router.push() al instante, pero eso
    // re-ejecuta el Server Component (buscarPerfilesPublico) para la nueva
    // URL, y en este entorno de test contra un Supabase dummy
    // ("https://example.supabase.co") esa consulta tarda mucho en fallar
    // en vez de fallar rápido — a diferencia de la carga inicial por SSR,
    // que si tarda igual de lento no lo nota nadie porque no hay una
    // aserción esperando. No es un bug de interactividad: medido en vivo,
    // resuelve en ~15-20s, por debajo de este margen.
    // El sidebar de filtros de escritorio va oculto en móvil
    // (`hidden lg:block`, FiltrosSidebar vive dentro de un <aside> con esa
    // clase) — en su lugar hay una hoja de filtros aparte
    // (HojaFiltrosMovil), fuera de esta ronda. En el viewport de
    // `webkit-publico` (iPhone) el chip existe en el DOM pero no es
    // clicable de verdad.
    test.skip(test.info().project.name === 'webkit-publico', 'El filtro de escritorio no es el flujo de móvil (HojaFiltrosMovil aparte).');
    test.setTimeout(60_000);
    await page.goto('/network/instructoras');

    // El chip de especialidad (components/network-v2/FiltrosSidebar.tsx) es
    // un <span onClick> dentro de un <label> con estilo de checkbox — no un
    // <button> ni un <input> real, así que no hay rol/estado accesible que
    // comprobar (aria-pressed/aria-checked); la única señal observable es
    // la propia URL.
    await page.getByText('Reformer', { exact: true }).click();
    await expect(page).toHaveURL(/especialidades=reformer/, { timeout: 45_000 });
    // Con la semilla, filtrar por Reformer de verdad reduce el listado: solo
    // Marta Gómez lo tiene entre sus especialidades. Antes de la semilla esto
    // no se podía comprobar — el filtro cambiaba la URL sobre un vacío.
    await expect(page.getByText('Marta Gómez')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Sofía Ruiz')).not.toBeVisible();
  });

  test('un perfil que no existe da un 404 real, no una pantalla vacía', async ({ page }) => {
    // notFound() delega en app/not-found.tsx (global, en español) — el texto
    // "Perfil no encontrado" solo vive en el <title>, nunca en el cuerpo.
    // ⚠️ La semilla NO cubre esta ruta (obtenerPerfilPublicoPorSlug consulta
    // Supabase directo, sin gate de E2E_TEST): un slug real de la semilla
    // ('marta-gomez-e2e') seguiría dando 404 aquí. Fuera de esta ronda.
    const respuesta = await page.goto('/network/instructoras/este-slug-no-existe-nunca');
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Esta página no existe.' })).toBeVisible();
  });
});
