import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Ordenar los tipos de clase (Fase 2 · D2): el orden en que los ve la alumna.
//
// Lo que se fija:
//  · se ordena con el TECLADO (asa → Espacio → flechas → Espacio), no solo
//    arrastrando con el ratón;
//  · un PATCH por fila cuya posición cambia, ni uno más: la primera vez (todos
//    «sin colocar») se colocan todos; después, solo los que se mueven;
//  · si la base de datos falla, la lista vuelve a lo guardado y se dice — con
//    contador de peticiones, porque «no mintió» no vale si no se intentó nada;
//  · sin ninguno colocado, la pantalla sigue como siempre (por nombre) y no
//    promete que la alumna los vea en ese orden.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const TIPO_BASE = { studio_id: STUDIO_ID, descripcion: null, nivel: 'TODOS', foto_url: null, logo_url: null, duracion_minutos: 50, archivado_en: null };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Opciones {
  tipos: { id: string; nombre: string; orden: number | null }[];
  /** Cómo contesta la base de datos a cada PATCH. */
  patch?: 'ok' | 500;
}

async function montar(page: Page, o: Opciones) {
  await page.clock.setFixedTime(new Date('2026-10-01T12:00:00+02:00'));
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

  const tipos = o.tipos.map((t, i) => ({ ...TIPO_BASE, color: ['#1f2937', '#9ccf9b', '#f472b6', '#c4b5fd'][i % 4], ...t }));
  const patches: { id: string | null; body: Record<string, unknown> }[] = [];

  // Comodines PRIMERO: Playwright resuelve las rutas en orden inverso.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, {
    id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID,
  }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', async route => {
    const req = route.request();
    const id = new URL(req.url()).searchParams.get('id')?.replace(/^eq\./, '') ?? null;
    if (req.method() === 'PATCH') {
      const body = JSON.parse(req.postData() || '{}') as Record<string, unknown>;
      patches.push({ id, body });
      if (o.patch === 500) return json(route, { code: 'XX000', message: 'boom', details: null, hint: null }, 500);
      const fila = tipos.find(t => t.id === id);
      if (fila) Object.assign(fila, body);
      return json(route, fila ? [{ id }] : []);
    }
    return json(route, id ? tipos.filter(t => t.id === id) : tipos);
  });

  await page.goto('/configuracion?tab=clases&abrir=tipos-de-clase');
  await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
  return { patches };
}

/** Los nombres de la lista, de arriba abajo (por el asa de cada fila). */
function ordenEnPantalla(page: Page) {
  return page.getByRole('button', { name: /^Mover / })
    .evaluateAll(asas => asas.map(a => (a.getAttribute('aria-label') ?? '').replace(/^Mover /, '')));
}

/**
 * Asa → Espacio → flechas → Espacio, como con un lector de pantalla: cada
 * paso espera a lo que se anuncia (en español y con el nombre de la clase),
 * que es también la señal de que dnd-kit ya lo ha procesado.
 */
async function subirConTeclado(page: Page, nombre: string, puestos: number) {
  const anuncio = page.locator('[id^="DndLiveRegion"]');
  const asa = page.getByRole('button', { name: `Mover ${nombre}` });
  const total = await page.getByRole('button', { name: /^Mover / }).count();
  const nombres = await ordenEnPantalla(page);
  const desde = nombres.indexOf(nombre) + 1;
  await asa.focus();
  await page.keyboard.press('Space');
  await expect(anuncio).toHaveText(`Has cogido ${nombre}. Está en el puesto ${desde} de ${total}.`);
  // dnd-kit empieza a escuchar las flechas en un `setTimeout` tras coger el
  // elemento: una vuelta del bucle de eventos basta para que ya esté (una
  // persona nunca pulsa tan rápido; el test, sí).
  await page.evaluate(() => new Promise(r => setTimeout(r, 0)));
  for (let i = 1; i <= puestos; i++) {
    await page.keyboard.press('ArrowUp');
    await expect(anuncio).toHaveText(`${nombre} iría al puesto ${desde - i} de ${total}.`);
  }
  await page.keyboard.press('Space');
  await expect(anuncio).toHaveText(`${nombre} queda en el puesto ${desde - puestos} de ${total}.`);
}

test.describe('Ordenar los tipos de clase', () => {
  test('la primera vez, con el teclado: se colocan todos (un PATCH por fila)', async ({ page }) => {
    const { patches } = await montar(page, {
      tipos: [
        { id: 'tc-reformer', nombre: 'Reformer', orden: null },
        { id: 'tc-barre', nombre: 'Barre', orden: null },
        { id: 'tc-mat', nombre: 'Mat', orden: null },
      ],
    });

    // Sin ninguno colocado: por nombre, como siempre, y sin prometer que la
    // alumna los vea así.
    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Barre', 'Mat', 'Reformer']);
    await expect(page.getByText('Arrástralos por el asa para decidir en qué orden los ve tu alumna al reservar.')).toBeVisible();

    await subirConTeclado(page, 'Reformer', 2);

    await expect(page.getByText('Orden guardado: así lo verán tus alumnas')).toBeVisible();
    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Reformer', 'Barre', 'Mat']);
    expect(patches.map(p => [p.id, p.body]).sort()).toEqual([
      ['tc-barre', { orden: 1 }],
      ['tc-mat', { orden: 2 }],
      ['tc-reformer', { orden: 0 }],
    ]);
    await expect(page.getByText('En este orden los ve tu alumna al reservar. Arrástralos por el asa para cambiarlo.')).toBeVisible();
  });

  test('ya ordenados: solo se escriben las filas que cambian de sitio', async ({ page }) => {
    const { patches } = await montar(page, {
      tipos: [
        { id: 'a', nombre: 'Aéreo', orden: 0 },
        { id: 'b', nombre: 'Barre', orden: 1 },
        { id: 'c', nombre: 'Circuito', orden: 2 },
        { id: 'd', nombre: 'Duo', orden: 3 },
      ],
    });
    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Aéreo', 'Barre', 'Circuito', 'Duo']);

    await subirConTeclado(page, 'Circuito', 1);

    await expect(page.getByText('Orden guardado: así lo verán tus alumnas')).toBeVisible();
    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Aéreo', 'Circuito', 'Barre', 'Duo']);
    expect(patches).toHaveLength(2);
    expect(patches.map(p => [p.id, p.body]).sort()).toEqual([['b', { orden: 2 }], ['c', { orden: 1 }]]);
  });

  test('también arrastrando con el ratón', async ({ page }) => {
    const { patches } = await montar(page, {
      tipos: [
        { id: 'a', nombre: 'Aéreo', orden: 0 },
        { id: 'b', nombre: 'Barre', orden: 1 },
        { id: 'c', nombre: 'Circuito', orden: 2 },
      ],
    });
    const asa = page.getByRole('button', { name: 'Mover Circuito' });
    const destino = page.getByRole('button', { name: 'Mover Aéreo' });
    const desde = (await asa.boundingBox())!;
    const hasta = (await destino.boundingBox())!;
    await page.mouse.move(desde.x + desde.width / 2, desde.y + desde.height / 2);
    await page.mouse.down();
    await page.mouse.move(desde.x + desde.width / 2, hasta.y + hasta.height / 2 - 10, { steps: 12 });
    await page.mouse.move(desde.x + desde.width / 2, hasta.y + 2, { steps: 4 });
    await page.mouse.up();

    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Circuito', 'Aéreo', 'Barre']);
    await expect.poll(() => patches.length).toBe(3);
  });

  test('si la base de datos falla, la lista vuelve a lo guardado y se dice', async ({ page }) => {
    const { patches } = await montar(page, {
      patch: 500,
      tipos: [
        { id: 'a', nombre: 'Aéreo', orden: 0 },
        { id: 'b', nombre: 'Barre', orden: 1 },
        { id: 'c', nombre: 'Circuito', orden: 2 },
      ],
    });

    await subirConTeclado(page, 'Circuito', 2);

    await expect(page.getByText(/^El orden no se ha guardado\./)).toBeVisible();
    expect(patches.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
    await expect.poll(() => ordenEnPantalla(page)).toEqual(['Aéreo', 'Barre', 'Circuito']);
    await expect(page.getByText('Orden guardado: así lo verán tus alumnas')).toHaveCount(0);
  });
});
