import { test, expect } from '@playwright/test';
import { sembrarSociaLista, SLUG } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// Datos estructurados de NEGOCIO LOCAL en la página pública de un estudio.
//
// Sin ellos, Google ve una página de reservas y no sabe que detrás hay un
// negocio con nombre, dirección y teléfono — que es lo que decide si entra en
// el paquete local de «pilates cerca de mí».
//
// Lo que se comprueba aquí no es que "haya un script": es que el JSON PARSEA,
// que el tipo es el correcto, y sobre todo que NO lleva campos inventados. Un
// marcado que no se corresponde con la página es motivo de acción manual de
// Google, así que la ausencia importa tanto como la presencia.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

async function abrir(page: import('@playwright/test').Page) {
  await sembrarSociaLista(page);
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(`/reservar/${SLUG}`);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
}

/** Los JSON-LD de la página, ya parseados. */
async function jsonLd(page: import('@playwright/test').Page): Promise<Record<string, unknown>[]> {
  const crudos = await page.locator('script[type="application/ld+json"]').allTextContents();
  return crudos.map((t) => JSON.parse(t) as Record<string, unknown>);
}

test('la página del estudio se describe como negocio local', async ({ page }) => {
  await abrir(page);
  const bloques = await jsonLd(page);
  const negocio = bloques.find((b) => b['@type'] === 'SportsActivityLocation');
  expect(negocio, `no hay bloque de negocio local. Tipos: ${bloques.map((b) => b['@type']).join(', ')}`).toBeTruthy();

  expect(negocio!.name).toBeTruthy();
  // La URL canónica, no la que se visitó: tienen que decir lo mismo.
  expect(String(negocio!.url)).toMatch(new RegExp(`/reservar/${SLUG}$`));
  expect(negocio!.address).toBeTruthy();
});

test('el marcado NO inventa lo que no sabemos', async ({ page }) => {
  // Cada uno de estos quedaría bien y sería falso: no hay columna de país, el
  // horario que existe es de CLASES (no del local), y la nota no está visible
  // en la página — marcarla es motivo de acción manual.
  await abrir(page);
  const negocio = (await jsonLd(page)).find((b) => b['@type'] === 'SportsActivityLocation')!;
  const plano = JSON.stringify(negocio);
  for (const prohibido of ['addressCountry', 'openingHours', 'aggregateRating', 'priceRange', 'review']) {
    expect(plano, `se coló un campo inventado: ${prohibido}`).not.toContain(prohibido);
  }
  // Y ninguna clave declarada a null: eso Google lo lee como dato vacío.
  expect(plano).not.toContain('null');
});
