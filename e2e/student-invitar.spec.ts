import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Invitar a una amiga.
//
// La cadena de referidos estaba ENTERA en backend —columna, regla de créditos,
// logro— y no se disparaba nunca porque faltaban los dos extremos: nadie podía
// generar el enlace, y el alta no mandaba quién había invitado. Esto comprueba
// los dos extremos, no la decoración.

const base = `/portal/${SLUG}`;

async function montar(page: Page) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
}

test.describe('Student PWA · invitar a una amiga', () => {
  test.describe.configure({ timeout: 120_000 });

  test('el enlace existe, lleva a darse de alta y trae SU id', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('abrir-invitar').click({ timeout: 30_000 });
    const enlace = page.getByTestId('enlace-invitacion');
    await expect(enlace).toBeVisible();
    const texto = (await enlace.textContent()) ?? '';
    expect(texto).toContain('/acceso/registro');
    expect(texto).toContain('ref=socio-e2e-1');
  });

  test('NO promete un premio que el estudio puede no dar', async ({ page }) => {
    // La regla de créditos es opcional por estudio y se paga cuando la
    // invitada ASISTE. Decir «ganáis las dos» sería vender algo que puede no
    // existir aquí y que no depende de quien comparte.
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('abrir-invitar').click({ timeout: 30_000 });
    // Por NOMBRE: en perfil convive con el diálogo de «¿Cerrar sesión?», que
    // está en el DOM aunque esté cerrado.
    const hoja = page.getByRole('dialog', { name: 'Invitar a una amiga' });
    await expect(hoja).toBeVisible();
    await expect(hoja).not.toContainText(/gratis|regalo|ganáis|premio/i);
  });

  test('el alta MANDA quién invitó — el eslabón que faltaba', async ({ page }) => {
    // Sin esto, la columna `referido_por` nunca se rellenaba desde la app y ni
    // el crédito a quien invita ni el logro de amigas invitadas se disparaban.
    let cuerpo: Record<string, unknown> | null = null;
    await montar(page);
    // ⚠️ Sesión SIN socia. Con socia resuelta, `verificar` da por hecho que ya
    // está registrada y redirige a inicio sin llegar a dar de alta: el test
    // habría esperado un POST que nunca sale. Una invitada real llega
    // autenticada y todavía sin ficha, que es justo este estado.
    await page.route((u) => u.pathname === '/api/public/session', (r) =>
      r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"sin ficha"}' }));
    await page.route((u) => u.pathname === '/api/public/socio', async (r) => {
      cuerpo = JSON.parse(r.request().postData() ?? '{}');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'nueva' }) });
    });

    // Se abre el enlace de invitación y se firma como haría la invitada.
    await page.goto(`${base}/acceso/registro?ref=socio-quien-invita`, { waitUntil: 'domcontentloaded' });
    // El referidor queda guardado para sobrevivir al viaje del correo.
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem(`st_ref_${'tentare'}`)), { timeout: 30_000 })
      .toBe('socio-quien-invita');

    // Y al firmar el alta desde verificar, viaja en el cuerpo.
    await page.evaluate(() => {
      sessionStorage.setItem(`st_firma_tentare`, JSON.stringify({
        fecha: new Date().toISOString(), firma: 'Ana Nueva', versionTexto: 'texto legal', telefono: '600',
      }));
    });
    await page.goto(`${base}/acceso/verificar`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => cuerpo, { timeout: 30_000 }).not.toBeNull();
    expect((cuerpo as unknown as Record<string, unknown>).referidoPor).toBe('socio-quien-invita');
  });

  test('un `ref` con basura no se guarda: el alta no puede depender del enlace', async ({ page }) => {
    // `socios.referido_por` tiene clave foránea, así que un valor inventado
    // haría FALLAR el INSERT y dejaría a la invitada sin cuenta. Se descarta
    // antes de salir, y el servidor lo vuelve a comprobar.
    await montar(page);
    await page.goto(`${base}/acceso/registro?ref=${encodeURIComponent('../../etc/passwd')}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const guardado = await page.evaluate(() => sessionStorage.getItem('st_ref_tentare'));
    expect(guardado).toBeNull();
  });
});
