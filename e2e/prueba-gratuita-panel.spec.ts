import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La píldora de la prueba gratuita en el panel.
//
// Cubre los seis estados que se pidieron —7 días, 6-4, 3-2, 1, finalizada y
// convertida a plan de pago— porque cada uno tiene su propio tono y su propio
// texto, y son justo el tipo de estado que nadie vuelve a mirar después del
// primer día: el de «7 días» se ve montándolo, y el de «1 día» no lo ve nadie
// hasta que le pasa a una clienta de verdad.
//
// Lo que de verdad protege este fichero es el estado CONVERTIDA: si la píldora
// siguiera contando días a un estudio que YA está pagando, la propietaria vería
// «te quedan 2 días» el mismo día que se le cobró.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Fase = 'PLENA' | 'HOLGADA' | 'AVISO' | 'ULTIMO_DIA' | 'EXPIRADA' | 'SIN_PRUEBA' | 'SUSCRITO';

async function montarPanel(
  page: Page,
  trial: { fase: Fase; diasRestantes: number },
  destino = '/dashboard',
) {
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

  const enPrueba = trial.fase !== 'SUSCRITO' && trial.fase !== 'EXPIRADA' && trial.fase !== 'SIN_PRUEBA';
  const finaliza = new Date(Date.now() + trial.diasRestantes * 86_400_000).toISOString();

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  // El estado de facturación es lo que pinta la píldora. `bloqueado: false`
  // siempre: aquí se prueba el AVISO, no el corte de acceso.
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'ESTUDIO',
    subscriptionStatus: trial.fase === 'SUSCRITO' ? 'active' : trial.fase === 'SIN_PRUEBA' ? null : 'trialing',
    activo: true,
    configurado: true,
    esPropietaria: true,
    bloqueado: false,
    enPrueba,
    pruebaTermina: enPrueba ? finaliza : null,
    periodoTermina: finaliza,
    trial: { fase: trial.fase, diasRestantes: trial.diasRestantes, finaliza: enPrueba ? finaliza : null },
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto(destino);
}

const pildora = (page: Page) => page.getByRole('button', { name: /prueba gratuita|Tu prueba gratuita ha terminado/i });

test.describe('La píldora de la prueba dice la verdad en cada estado', () => {
  test('recién empezada: 7 días', async ({ page }) => {
    await montarPanel(page, { fase: 'PLENA', diasRestantes: 7 });
    await expect(pildora(page)).toContainText('7 días');
  });

  test('a mitad: 4 días', async ({ page }) => {
    await montarPanel(page, { fase: 'HOLGADA', diasRestantes: 4 });
    await expect(pildora(page)).toContainText('4 días');
  });

  test('quedan pocos: 3 días', async ({ page }) => {
    await montarPanel(page, { fase: 'AVISO', diasRestantes: 3 });
    await expect(pildora(page)).toContainText('3 días');
  });

  test('último día: en singular, «1 día» y no «1 días»', async ({ page }) => {
    await montarPanel(page, { fase: 'ULTIMO_DIA', diasRestantes: 1 });
    await expect(pildora(page)).toContainText('1 día');
    await expect(pildora(page)).not.toContainText('1 días');
  });

  test('finalizada: lo dice, y promete que no se ha borrado nada', async ({ page }) => {
    await montarPanel(page, { fase: 'EXPIRADA', diasRestantes: 0 });
    const p = pildora(page);
    await expect(p).toContainText('Prueba finalizada');
    await p.click();
    // El miedo real de quien ve «prueba terminada» es haber perdido su trabajo.
    await expect(page.getByRole('dialog', { name: /prueba gratuita/i })).toContainText('intactos');
    await expect(page.getByRole('link', { name: 'Elegir mi plan' })).toBeVisible();
  });

  test('convertida a plan de pago: la píldora DESAPARECE', async ({ page }) => {
    // El bug que este test existe para impedir: seguir contando días a un
    // estudio que ya paga. `trial_ends_at` no se borra al convertir, así que
    // solo `estadoTrial()` evita que la cuenta atrás siga viva.
    await montarPanel(page, { fase: 'SUSCRITO', diasRestantes: 0 });
    await expect(page.getByRole('button', { name: /prueba gratuita/i })).toHaveCount(0);
  });

  test('⚠️ un estudio anterior a la apertura no ve NINGUNA píldora', async ({ page }) => {
    // 7 de los 12 estudios de producción tienen `trial_ends_at` a NULL porque
    // son anteriores a que Tentare abriera. Si «sin prueba» se confundiera con
    // «prueba agotada», a todos ellos les saldría un aviso ROJO de «prueba
    // finalizada» por una prueba que nunca tuvieron.
    await montarPanel(page, { fase: 'SIN_PRUEBA', diasRestantes: 0 });
    await expect(page.getByRole('button', { name: /prueba gratuita/i })).toHaveCount(0);
    await expect(page.getByText('Prueba finalizada')).toHaveCount(0);
  });

  test('el detalle se abre, dice cuándo acaba y cuánto costará después', async ({ page }) => {
    await montarPanel(page, { fase: 'AVISO', diasRestantes: 2 });
    await pildora(page).click();
    const detalle = page.getByRole('dialog', { name: /prueba gratuita/i });
    await expect(detalle).toContainText('Te quedan 2 días');
    // El precio del plan que está probando: enterarse de cuánto cuesta el
    // último día es la peor forma de descubrirlo.
    await expect(detalle).toContainText('59€/mes');
    await expect(detalle.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  test('se cierra con Escape, sin tener que encontrar el botón', async ({ page }) => {
    await montarPanel(page, { fase: 'HOLGADA', diasRestantes: 5 });
    await pildora(page).click();
    await expect(page.getByRole('dialog', { name: /prueba gratuita/i })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /prueba gratuita/i })).toHaveCount(0);
  });
});


test.describe('La pantalla de suscripción, que es donde se convierte', () => {
  test('en prueba: dice cuántos días quedan y deja elegir plan', async ({ page }) => {
    await montarPanel(page, { fase: 'AVISO', diasRestantes: 3 }, '/suscripcion');

    await expect(page.getByRole('heading', { name: 'Elige tu plan', level: 1 })).toBeVisible();
    await expect(page.getByText(/Te quedan 3 días de prueba/)).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible();
    // El botón dice el plan Y el precio: «Continuar» a secas obliga a fiarse.
    await expect(page.getByRole('button', { name: /Continuar con Estudio · 59€\/mes/ })).toBeVisible();
  });

  test('prueba agotada: promete que no se ha borrado nada', async ({ page }) => {
    await montarPanel(page, { fase: 'EXPIRADA', diasRestantes: 0 }, '/suscripcion');

    await expect(page.getByRole('heading', { name: 'Tu prueba ha terminado', level: 1 })).toBeVisible();
    await expect(page.getByText(/no se ha borrado nada/)).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible();
  });

  test('⚠️ estudio anterior a la apertura: «Elige tu plan», no «tu prueba ha terminado»', async ({ page }) => {
    await montarPanel(page, { fase: 'SIN_PRUEBA', diasRestantes: 0 }, '/suscripcion');
    await expect(page.getByRole('heading', { name: 'Elige tu plan', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu prueba ha terminado' })).toHaveCount(0);
  });

  test('ya paga: no se le vuelve a vender, se le enseña su plan', async ({ page }) => {
    await montarPanel(page, { fase: 'SUSCRITO', diasRestantes: 0 }, '/suscripcion');

    await expect(page.getByRole('heading', { name: 'Tu suscripción', level: 1 })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Plan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Facturas, tarjeta y cambio de plan/ })).toBeVisible();
  });

  test('⚠️ ni un rosa fuera del sistema de diseño', async ({ page }) => {
    // Esta pantalla tenía `ACC = '#FFC8E2'` y un `#F7A6C4` sueltos, restos de
    // la plantilla anterior al cambio de identidad, pintando el botón
    // principal y la etiqueta «POPULAR». Es el caso que motivó la auditoría de
    // color: un botón que parecía de otra aplicación.
    await montarPanel(page, { fase: 'AVISO', diasRestantes: 3 }, '/suscripcion');
    await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible();

    const rosas = await page.evaluate(() => {
      const fuera: string[] = [];
      // Los dos rosas exactos que había, en el formato que devuelve el navegador.
      const prohibidos = ['rgb(255, 200, 226)', 'rgb(247, 166, 196)'];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const s = getComputedStyle(el);
        for (const prop of ['backgroundColor', 'color', 'borderTopColor'] as const) {
          if (prohibidos.includes(s[prop])) fuera.push(`${el.tagName}.${prop}=${s[prop]}`);
        }
      }
      return fuera;
    });
    expect(rosas, `elementos con el rosa de la plantilla vieja: ${rosas.join(', ')}`).toEqual([]);
  });
});
