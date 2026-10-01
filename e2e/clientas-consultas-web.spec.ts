import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Consultas del formulario de contacto, en Clientas → «Interesadas y pruebas»
// (components/clientas/interesadas-y-pruebas.tsx, bloque «Preguntaron»).
//
// ⚠️ Un UPDATE/DELETE que la RLS no deja pasar NO da error: vuelve 0 filas. La
// tarjeta solo da algo por hecho si vuelve la fila; se prueba con un PATCH que
// devuelve `[]` y con un 403, y siempre con contador de intentos.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
};
const CONSULTA = {
  id: 'cc-1', nombre: 'Nueva Visitante', email: 'nueva@example.com', telefono: '+34 611 222 333',
  mensaje: '¿Tenéis clases para principiantes?', origen: 'web-contacto', estado: 'nueva',
  creada_en: '2026-09-26T10:00:00Z', atendida_en: null,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Escritura = { status: number; body: unknown };

/**
 * `cerradaYa`: alguien la cerró antes que este clic —la base de datos al crear la
 * ficha con su mismo email (trigger `socios_vincula_consulta`), u otra persona—.
 * El PATCH vuelve 0 filas (la RLS no deja tocar una cerrada) y la relectura de la
 * consulta dice cómo quedó.
 */
async function montar(page: Page, o: { patch?: Escritura; nuevas?: unknown[]; lecturaFalla?: boolean; cerradaYa?: 'atendida' | 'descartada' } = {}) {
  const patches: string[] = [];
  const cuerpos: Record<string, unknown>[] = [];
  let relecturas = 0;
  let nuevas = o.nuevas ?? [CONSULTA];
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, []));
  // Después del catch-all: el último registrado manda.
  await page.route('**/rest/v1/consultas_contacto**', route => {
    const req = route.request();
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    if (req.method() === 'GET') {
      if (o.lecturaFalla) return json(route, { message: 'boom' }, 500);
      if (o.cerradaYa && req.url().includes(`id=eq.${CONSULTA.id}`)) {
        relecturas++;
        nuevas = [];
        return json(route, [{ estado: o.cerradaYa }]);
      }
      return json(route, req.url().includes('estado=eq.nueva') ? nuevas : []);
    }
    patches.push(req.url());
    cuerpos.push(JSON.parse(req.postData() ?? '{}'));
    const r = o.cerradaYa ? { status: 200, body: [] } : o.patch ?? { status: 200, body: [{ id: CONSULTA.id }] };
    if (r.status === 200 && Array.isArray(r.body) && r.body.length === 1) nuevas = [];
    return json(route, r.body, r.status);
  });
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.goto('/clientas');
  return { patches: () => patches.length, relecturas: () => relecturas, cuerpos };
}

// Las consultas viven en su pestaña, con su recuento en la etiqueta.
async function abrirInteresadas(page: Page) {
  const pestana = page.getByRole('tab', { name: /^Interesadas y pruebas/ });
  await pestana.click({ timeout: 60_000 });
  await expect(pestana).toHaveAttribute('aria-selected', 'true');
}

// «⋯» de la fila de la consulta: el otro canal, llamar y cerrarla.
async function menuDeLaConsulta(page: Page) {
  await page.getByRole('listitem').filter({ hasText: '¿Tenéis clases para principiantes?' })
    .getByRole('button', { name: 'Más acciones' }).click();
  return page.getByRole('menu', { name: 'Más acciones' });
}

test('la consulta de la web cuenta en su pestaña y se ve allí, con cómo responder', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('tab', { name: /^Interesadas y pruebas\s*1$/ })).toBeVisible({ timeout: 60_000 });
  await abrirInteresadas(page);
  await expect(page.getByRole('heading', { name: /Preguntaron/ })).toBeVisible();
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toBeVisible();
  // Con teléfono, lo primero es WhatsApp; el correo y la llamada, en «⋯».
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/34611222333\?text=/);
  const menu = await menuDeLaConsulta(page);
  await expect(menu.getByRole('menuitem', { name: 'Responder por correo' })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Llamar' })).toBeVisible();
});

test('sin teléfono, se responde por correo', async ({ page }) => {
  await montar(page, { nuevas: [{ ...CONSULTA, telefono: null }] });
  await abrirInteresadas(page);
  await expect(page.getByRole('link', { name: 'Responder' })).toHaveAttribute('href', /^mailto:nueva@example\.com\?subject=/);
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveCount(0);
});

test('sin consultas no ocupa sitio', async ({ page }) => {
  await montar(page, { nuevas: [] });
  await expect(page.getByRole('heading', { name: 'Clientas' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /consulta/i })).toHaveCount(0);
});

test('⚠️ si no se pueden leer, se dice: no se pinta «nadie preguntó»', async ({ page }) => {
  await montar(page, { lecturaFalla: true });
  await abrirInteresadas(page);
  await expect(page.getByText('No se han podido leer las consultas de tu web.')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Nadie está entrando ahora mismo')).toHaveCount(0);
});

test('marcar como atendida: solo desaparece si la fila vuelve', async ({ page }) => {
  const api = await montar(page);
  await abrirInteresadas(page);
  await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'Ya la he atendido' }).click();
  await expect.poll(api.patches, { timeout: 15_000 }).toBe(1);
  expect(api.cuerpos[0]).toMatchObject({ estado: 'atendida' });
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toHaveCount(0);
});

test('descartar («no le interesa»): sale de la lista solo si la fila vuelve', async ({ page }) => {
  const api = await montar(page);
  await abrirInteresadas(page);
  await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'No le interesa: descartar' }).click();
  await expect.poll(api.patches, { timeout: 15_000 }).toBe(1);
  expect(api.cuerpos[0]).toMatchObject({ estado: 'descartada' });
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toHaveCount(0);
});

for (const [nombre, patch] of [
  ['la RLS no la deja pasar (0 filas)', { status: 200, body: [] }],
  ['un 403', { status: 403, body: { message: 'permission denied' } }],
] as const) {
  test(`⚠️ ${nombre}: la consulta sigue y se dice`, async ({ page }) => {
    const api = await montar(page, { patch });
    await abrirInteresadas(page);
    await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'Ya la he atendido' }).click();
    await expect.poll(api.patches, { timeout: 15_000 }).toBeGreaterThan(0);
    // Por texto: el anunciador de rutas de Next también es un role="alert".
    await expect(page.getByText(/No se ha podido marcar como atendida/)).toBeVisible();
    await expect(page.getByText('¿Tenéis clases para principiantes?')).toBeVisible();
  });

  test(`⚠️ descartar con ${nombre}: la consulta sigue y se dice`, async ({ page }) => {
    const api = await montar(page, { patch });
    await abrirInteresadas(page);
    await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'No le interesa: descartar' }).click();
    await expect.poll(api.patches, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByText(/No se ha podido descartar/)).toBeVisible();
    await expect(page.getByText('¿Tenéis clases para principiantes?')).toBeVisible();
  });
}

test('marcar como atendida cuando otra persona ya la atendió: sale de la lista sin error', async ({ page }) => {
  const api = await montar(page, { cerradaYa: 'atendida' });
  await abrirInteresadas(page);
  await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'Ya la he atendido' }).click();
  await expect.poll(api.patches, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(api.relecturas, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toHaveCount(0);
  await expect(page.getByText(/No se ha podido marcar como atendida/)).toHaveCount(0);
});

test('⚠️ marcar como atendida cuando otra persona la descartó: se dice', async ({ page }) => {
  const api = await montar(page, { cerradaYa: 'descartada' });
  await abrirInteresadas(page);
  await (await menuDeLaConsulta(page)).getByRole('menuitem', { name: 'Ya la he atendido' }).click();
  await expect.poll(api.relecturas, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Otra persona la había descartado.')).toBeVisible();
});

// Lo que pasaba en producción: al dar de alta la ficha con el email de la
// consulta, la base de datos ya la cerraba, el cierre del panel volvía 0 filas y
// la lista decía «su consulta sigue como nueva» cuando ya no lo estaba.
test('dar de alta con su mismo email: la consulta ya la cerró la base de datos y no sale ningún error', async ({ page }) => {
  const api = await montar(page, { cerradaYa: 'atendida' });
  await abrirInteresadas(page);
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('nueva@example.com');
  await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByPlaceholder(/Nombre completo de la clienta/i).fill('Nueva Visitante');
  await page.getByRole('button', { name: /Crear clienta/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
  await expect.poll(api.patches, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(api.relecturas, { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(page.getByText(/no se ha podido cerrar su consulta|sigue como nueva/i)).toHaveCount(0);
});

test('dar de alta: abre el alta de siempre con sus datos, sin crear nada solo', async ({ page }) => {
  const api = await montar(page);
  await abrirInteresadas(page);
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Nombre\s*\*?$/ })).toHaveValue('Nueva');
  await expect(page.getByRole('textbox', { name: 'Apellidos' })).toHaveValue('Visitante');
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('nueva@example.com');
  // Abrir el alta no cierra la consulta: eso solo pasa si el alta se guarda.
  expect(api.patches()).toBe(0);
});

test.describe('apuntar a mano a alguien que preguntó', () => {
  async function rellenar(page: Page) {
    await abrirInteresadas(page);
    await page.getByRole('button', { name: 'Apuntar interesada' }).first().click();
    const dialogo = page.getByRole('dialog', { name: 'Apuntar a alguien que preguntó' });
    const apuntar = dialogo.getByRole('button', { name: 'Apuntarla' });
    await dialogo.getByRole('textbox', { name: 'Nombre' }).fill('Irene Prueba');
    await dialogo.getByRole('textbox', { name: 'Teléfono' }).fill('611 000 111');
    await dialogo.getByRole('textbox', { name: 'Email' }).fill('irene@example.com');
    await dialogo.getByRole('textbox', { name: 'Qué preguntó' }).fill('Quiere empezar en octubre.');
    // Sin decir por dónde llegó no se puede apuntar.
    await expect(apuntar).toBeDisabled();
    await dialogo.getByRole('button', { name: 'Por Instagram' }).click();
    await expect(apuntar).toBeEnabled();
    return { dialogo, apuntar };
  }

  test('va al servidor con lo escrito y se cierra cuando lo guarda', async ({ page }) => {
    await montar(page, { nuevas: [] });
    const envios: Record<string, unknown>[] = [];
    await page.route((u) => u.pathname === '/api/consultas', (r) => {
      envios.push(JSON.parse(r.request().postData() ?? '{}'));
      return json(r, { id: 'cc-nueva' }, 201);
    });
    const { dialogo, apuntar } = await rellenar(page);
    await apuntar.click();
    await expect.poll(() => envios.length).toBe(1);
    expect(envios[0]).toMatchObject({ nombre: 'Irene Prueba', telefono: '611 000 111', email: 'irene@example.com', canal: 'INSTAGRAM', mensaje: 'Quiere empezar en octubre.' });
    await expect(dialogo).toBeHidden();
  });

  test('⚠️ si ya es clienta (409), no se duplica: lo dice y lleva a su ficha', async ({ page }) => {
    await montar(page, { nuevas: [] });
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/consultas', (r) => {
      intentos++;
      return json(r, { error: 'Ya es clienta: tiene ficha con ese email.', socioId: 'soc-irene' }, 409);
    });
    const { dialogo, apuntar } = await rellenar(page);
    await apuntar.click();
    await expect(dialogo.getByRole('alert')).toContainText('Ya es clienta: tiene ficha con ese email.');
    expect(intentos).toBeGreaterThan(0);
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole('button', { name: 'Ver su ficha' }).click();
    await expect(page).toHaveURL(/\/clientas\/soc-irene$/);
  });

  test('⚠️ sin conexión, lo dice y no se cierra', async ({ page }) => {
    await montar(page, { nuevas: [] });
    let intentos = 0;
    await page.route((u) => u.pathname === '/api/consultas', (r) => { intentos++; return r.abort('failed'); });
    const { dialogo, apuntar } = await rellenar(page);
    await apuntar.click();
    await expect(dialogo.getByRole('alert')).toContainText('Sin conexión: no se ha apuntado.');
    expect(intentos).toBeGreaterThan(0);
    await expect(dialogo).toBeVisible();
  });
});
