import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// Cabecera del Inicio y tarjetas de Retos por variante (lib/theme-variantes.ts).
// Como en el resto de esta tanda, el primer test de cada bloque fija el
// comportamiento SIN variante — que es lo que ve todo estudio que no haya
// instalado Oliva/Bloom/Noir.

test.describe('Inicio — cabecera por variante', () => {
  test('sin variante: "Hola, {nombre}." grande y sin avatar a la vista', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: /^Hola, .+\./ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/^Buen(os|as)/)).toHaveCount(0);
  });

  test('`titular`: saludo por hora + nombre, y el mensaje del día asciende a titular', async ({ page }) => {
    await montarPortal(page, { conSesion: true, variantes: { cabeceraInicio: 'titular' } });
    await page.goto(`/portal/${SLUG}/home`);
    // El nombre pasa a ser el encabezado; "Hola, X." desaparece.
    await expect(page.getByRole('heading', { name: 'Marta' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /^Hola, / })).toHaveCount(0);
    await expect(page.getByText(/^Buen(os|as) (días|tardes|noches)$/)).toBeVisible();
    // El mensaje real del día, ahora en grande — no una frase de marketing.
    await expect(page.getByText(/Hoy tienes una cita contigo\.|¿Qué te apetece hoy\?/)).toBeVisible();
  });
});

test.describe('Inicio — retos por variante', () => {
  test('sin variante: la tarjeta usa la superficie neutra, no un color propio', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      homeBloques: [{ id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos' }],
      retoConteos: { core: 7 },
    });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Retos' })).toBeVisible({ timeout: 30_000 });
    const fondos = await page.getByRole('button', { name: /Apuntarme|Apuntada/ })
      .evaluateAll((els) => els.map((e) => getComputedStyle(e.parentElement as Element).backgroundColor));
    // Los dos IGUALES: sin variante ambos usan la misma superficie del modo.
    expect(fondos[0]).toBe(fondos[1]);
  });

  test('`color`: fondo propio por reto, y el conteo sigue siendo el REAL', async ({ page }) => {
    await montarPortal(page, {
      conSesion: true,
      variantes: { retos: 'color' },
      homeBloques: [
        { id: 'sistema-retos', kind: 'sistema', sistemaId: 'retos' },
      ],
      retoConteos: { core: 7 },
    });
    await page.goto(`/portal/${SLUG}/home`);
    await expect(page.getByRole('heading', { name: 'Retos' })).toBeVisible({ timeout: 30_000 });

    // Los dos retos tienen fondos DISTINTOS — es lo que los separa a la vista.
    const fondos = await page.getByRole('button', { name: /Apuntarme|Apuntada/ })
      .evaluateAll((els) => els.map((e) => getComputedStyle(e.parentElement as Element).backgroundColor));
    expect(fondos.length).toBe(2);
    expect(fondos[0]).not.toBe(fondos[1]);

    // El conteo es el del mock, nunca la cifra de marketing del prototipo.
    await expect(page.getByText('7 apuntadas')).toBeVisible();
    await expect(page.getByText(/156 K/)).toHaveCount(0);
  });
});
