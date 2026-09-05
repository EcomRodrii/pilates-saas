import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// El logo del tipo de clase en el horario de la alumna.
//
// Lo que faltaba, dicho por el fundador: «en la app alumna una clase no se ve
// el logo, solo se ve nombre, instructora, sala, hora y duración». Y era
// literal — la única imagen de la fila era el avatar de la INSTRUCTORA. No era
// que faltara pintarlo: es que `tipos_clase` tenía una sola imagen haciendo de
// logo y de banner a la vez, y en la app de la alumna solo se consumía como
// banner (un héroe de 290 px). Ahora son dos columnas.
//
// Estos tests fijan las dos mitades del contrato, porque la segunda es la que
// se rompería «arreglando» la primera de más:
//   · con logo propio, la fila lo enseña;
//   · sin logo propio, la fila NO enseña ninguna imagen de clase — heredarlo
//     de la sala o del estudio pondría el mismo icono en todas.

const base = `/portal/${SLUG}`;

async function montar(page: Page, tipo: { logoUrl?: string; fotoUrl?: string; salaFotoUrl?: string } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista();
  const tc = f.tiposClase[0] as Record<string, unknown>;
  if (tipo.logoUrl !== undefined) tc.logoUrl = tipo.logoUrl;
  if (tipo.fotoUrl !== undefined) tc.fotoUrl = tipo.fotoUrl;
  if (tipo.salaFotoUrl !== undefined) {
    (f.salas[0] as Record<string, unknown>).fotoUrl = tipo.salaFotoUrl;
  }
  (f as Record<string, unknown>).studio = { ...(f.studio as object), fotoUrl: '/por-defecto/estudio-hero.webp' };
  await page.route('**/api/public/studio-data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
}

const logo = (page: Page) => page.getByTestId('logo-clase');

test.describe('Student PWA · el logo de la clase en el horario', () => {
  test('con logo propio, la fila del horario lo enseña', async ({ page }) => {
    await montar(page, { logoUrl: '/por-defecto/clase-reformer.webp' });
    await page.goto(`${base}/reservar`);
    await expect(logo(page).first()).toBeVisible({ timeout: 30_000 });
    await expect(logo(page).first()).toHaveAttribute(
      'style',
      /clase-reformer\.webp/,
      // Es un `background: url(...)`, no un <img>: se comprueba el estilo.
    );
  });

  test('⚠️ sin logo propio la fila NO enseña imagen, aunque la sala y el estudio tengan foto', async ({ page }) => {
    // Heredarlo sería lo cómodo y estaría mal: el mismo icono repetido en
    // todas las filas se lee como un error de la app. `lib/imagenes-por-defecto.ts`
    // documenta esa misma decisión para las miniaturas de listados.
    await montar(page, { salaFotoUrl: '/por-defecto/estudio-vertical.webp' });
    await page.goto(`${base}/reservar`);
    // La pantalla ha cargado: hay filas de clase.
    await expect(page.getByText('Reformer').first()).toBeVisible({ timeout: 30_000 });
    await expect(logo(page)).toHaveCount(0);
  });

  test('el logo no se confunde con el banner: son dos imágenes distintas', async ({ page }) => {
    await montar(page, {
      logoUrl: '/por-defecto/clase-mat.webp',
      fotoUrl: '/por-defecto/clase-reformer.webp',
    });
    await page.goto(`${base}/reservar`);
    const primero = logo(page).first();
    await expect(primero).toBeVisible({ timeout: 30_000 });
    const estilo = (await primero.getAttribute('style')) ?? '';
    expect(estilo).toContain('clase-mat.webp');
    expect(estilo).not.toContain('clase-reformer.webp');
  });
});
