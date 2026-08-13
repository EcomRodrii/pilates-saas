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
// esa llamada. Sin una semilla server-side dedicada (el patrón que ya usa
// lib/studio-seo.ts con E2E_TEST=1, que esta ronda no añade para Network),
// el entorno de CI —con credenciales de Supabase dummy— siempre resuelve un
// listado vacío. Por eso esta suite cubre lo que SÍ es determinista sin
// datos reales: que la pantalla no se cae, que los filtros son interactivos,
// y que un perfil inexistente da 404 real, no una pantalla en blanco.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Marketplace público (sin sesión)', () => {
  test('carga sin datos sembrados y no miente sobre resultados que no tiene', async ({ page }) => {
    await page.goto('/network/instructoras');

    await expect(page.getByRole('heading', { name: 'Instructoras de Pilates' })).toBeVisible({ timeout: 30_000 });
    // Sin perfiles de verdad en este entorno: el vacío se dice, nunca "0
    // instructoras" ni una tarjeta fantasma. "Cerca de mí"
    // (components/network-v2/ResultadosInstructoras.tsx) solo se pinta
    // dentro de la rama CON resultados — sin datos sembrados no hay forma
    // de comprobar ese botón desde aquí, no se prueba en este spec.
    await expect(page.getByText(/Todavía estamos construyendo la network allí/i)).toBeVisible();
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
  });

  test('un perfil que no existe da un 404 real, no una pantalla vacía', async ({ page }) => {
    // notFound() delega en app/not-found.tsx (global, en español) — el texto
    // "Perfil no encontrado" solo vive en el <title>, nunca en el cuerpo.
    const respuesta = await page.goto('/network/instructoras/este-slug-no-existe-nunca');
    expect(respuesta?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'Esta página no existe.' })).toBeVisible();
  });
});
