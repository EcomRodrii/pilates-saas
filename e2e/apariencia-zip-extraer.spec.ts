import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Extraer a tema nativo» — components/theme/importar-tema-zip.tsx.
//
// El camino real a lo que se pidió del ZIP importado: no publicarlo como "Tu
// tema" (reabriría el aislamiento de origen, decisión de seguridad ya
// cerrada — ver app/tema-publicado/[slug]/[[...ruta]]/route.ts), sino leer su
// color de marca e instalar un tema NATIVO nuevo con ese color, editable
// visualmente y publicable de verdad. El lado servidor (extraerColorDeMarca)
// ya tiene sus propios tests unitarios (lib/theme-import/extraer-tema.test.ts)
// — tres heurísticas en cascada que NUNCA devuelven null, así que desde el
// cliente "Extraer" ya no tiene un camino de fallo por "sin color
// declarado": eso era justo el "nada de reglas como estas" que pidió el
// fundador. Esto verifica que el botón manda la acción correcta y sigue a
// donde promete — el fallo que ya le costó a esta pantalla dos veces (P1 de
// la auditoría Momence: el rail prometía algo que la página no cumplía).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const TEMA_LISTO = {
  id: 'zip-1',
  nombre: 'Tentade',
  manifest: { ficheros: [{ ruta: 'index.html', bytes: 1000, clase: 'html' }], assets: [], fonts: [], entryPoints: ['index.html'], stylesheets: [], framework: 'desconocido', dependencias: [], incompatibilidades: [] },
  estado: 'listo',
  detalle: null,
  publicado: false,
  publicado_en: null,
  creado_en: '2026-08-15T00:00:00Z',
};

async function montar(page: Page, temas: unknown[] = [TEMA_LISTO]) {
  const patches: Record<string, unknown>[] = [];
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
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED' }));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/portal-bloques**', route => {
    const todas = new URL(route.request().url()).searchParams.get('pantalla') === 'todas';
    return json(route, todas ? { home: [], clases: [], bonos: [], reservar: [] } : []);
  });
  await page.route('**/api/theme/importado', route => json(route, { temas }));
  await page.route('**/api/theme/importado/*', route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      // El servidor real ya no tiene camino de fallo por "sin color": la
      // extracción SIEMPRE devuelve algo (ver extraer-tema.test.ts). El mock
      // refleja eso — siempre éxito, cualquiera que sea el tema.
      if (body.accion === 'extraer') return json(route, { ok: true, primary: '#333B24' });
      return json(route, { ok: true });
    }
    return json(route, {});
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  return { patches };
}

test('extraer manda la acción correcta, avisa del paso que falta y de ahí lleva al editor nativo', async ({ page }) => {
  // ⚠️ A propósito YA NO navega sola tras extraer (ver el comentario de
  // `extraer()` en importar-tema-zip.tsx): un bug real reportado por el
  // fundador fue confundir el «Publicar» de esta tarjeta (solo
  // imports.tentare.app) con el del editor nativo (el que de verdad publica
  // en el portal), precisamente porque el auto-navegado silencioso no dejaba
  // rastro de que hiciera falta un paso más. Ahora el botón sigue "llevando
  // a donde promete" (la garantía que este fichero ya protegía), pero con una
  // parada explícita en medio en vez de un salto mudo.
  const { patches } = await montar(page);
  await expect(page.getByText('Tentade', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Extraer a tema nativo' }).click();
  expect(patches).toContainEqual({ accion: 'extraer' });

  await expect(page.getByText(/se ha guardado como borrador/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Todavía no se ve en tu portal/i)).toBeVisible();

  await page.getByRole('link', { name: 'Ir al editor a publicarlo' }).click();
  await page.waitForURL(/\/configuracion\/apariencia\/editor$/, { timeout: 15_000 });
});

test('⚠️ automático de verdad: ningún ZIP bloquea el botón con un error de "sin color"', async ({ page }) => {
  // El pedido explícito que arregla este fichero: sea cual sea el ZIP, el
  // botón confirma la extracción — nunca un aviso de "este tema no declara...".
  await montar(page);
  await expect(page.getByText('Tentade', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Extraer a tema nativo' }).click();
  await expect(page.getByText(/se ha guardado como borrador/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/no declara/i)).toHaveCount(0);
});

test('el «Publicar» de la tarjeta ZIP no promete el portal real', async ({ page }) => {
  // La confusión exacta que reportó el fundador: extraer, pulsar el
  // "Publicar" de ESTA tarjeta (el de theme_imports, solo
  // imports.tentare.app) y esperar que el portal cambiara. Este test fija
  // que la etiqueta ya no puede leerse como "publica tu tema" — DENTRO de
  // la tarjeta del ZIP. (La página también tiene el "Publicar" del tema
  // nativo arriba en "Tu tema" — ese es el correcto y no lo toca este fix.)
  await montar(page);
  await expect(page.getByText('Tentade', { exact: true })).toBeVisible({ timeout: 30_000 });

  // Fila concreta del ZIP (no toda la tarjeta ni la página): el borde
  // redondeado que envuelve nombre + botones de CADA tema importado.
  const filaZip = page.locator('div.rounded-xl.border.border-border', { hasText: 'Tentade' });
  await expect(filaZip.getByRole('button', { name: 'Publicar vista previa' })).toBeVisible();
  await expect(filaZip.getByRole('button', { name: 'Publicar', exact: true })).toHaveCount(0);
});
