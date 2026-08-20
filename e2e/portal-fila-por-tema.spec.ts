import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cada tema pinta SU forma de fila del horario, y la elige el tema.
//
// ⚠️ Antes lo elegía la pantalla, y de dos maneras distintas: la fila de Sereno
// con `day_strip_style === "cajas"` —una bandera de la TIRA DE DÍAS— y la de
// Tentada llamando a otro componente exportado aparte. Dos ejes montados encima
// de otros dos: un tema que quisiera días en caja con la fila clásica no podía
// pedirlo, y nadie lo habría notado hasta intentarlo.
//
// Ahora el eje se llama `row_style` y la entrada es una sola. Esto fija que la
// unificación no cambió lo que ve nadie.
// ─────────────────────────────────────────────────────────────────────────────

const FORMAS = [
  { tema: 'oliva', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'bloom', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'noir', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'sereno', selector: '.class-row--sereno', nombre: 'de Sereno' },
  { tema: 'tentada', selector: '.row-mia, .row-libre', nombre: 'plana' },
];

for (const { tema, selector, nombre } of FORMAS) {
  test(`${tema} pinta la fila ${nombre}`, async ({ page }) => {
    await page.goto(`/portal-tema-preview/${tema}`);
    await page.locator('.welcome__cta').click();
    await page.getByRole('button', { name: /Ver horario|Ver la agenda|Reservar/i }).first().click();

    await expect(page.locator(selector).first()).toBeVisible({ timeout: 30_000 });

    // Y NINGUNA de las otras dos formas: si se colaran las dos, la pantalla
    // estaría pintando la fila dos veces y el test seguiría en verde.
    for (const otra of FORMAS.filter((f) => f.nombre !== nombre)) {
      await expect(page.locator(otra.selector)).toHaveCount(0);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Los rótulos del Inicio los pone el TEMA, no una lista de ids en el código.
//
// ⚠️ Antes vivían en `cfg.id === "noir" || cfg.id === "tentada" || cfg.id ===
// "sereno"` y `cfg.id === "oliva"` dentro del view model. Dar de alta un sexto
// tema obligaba a editar esas líneas, y olvidarlo NO fallaba: salía el rótulo
// del otro grupo y nadie se enteraba. Esto fija lo que ve cada uno.
// ─────────────────────────────────────────────────────────────────────────────

const ROTULOS = [
  { tema: 'oliva', accesos: 'Mis accesos rápidos' },
  { tema: 'bloom', accesos: 'Accesos rápidos' },
  { tema: 'sereno', accesos: 'Accesos rápidos' },
];

for (const { tema, accesos } of ROTULOS) {
  test(`${tema} rotula los accesos rápidos como «${accesos}»`, async ({ page }) => {
    await page.goto(`/portal-tema-preview/${tema}`);
    await page.locator('.welcome__cta').click();
    await expect(page.getByText(accesos, { exact: true })).toBeVisible({ timeout: 30_000 });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Las dos tiras de días NO escriben igual, y es del diseño, no un descuido.
//
// El horario (`05-clases.jpg`) pone tres letras — LUN MAR MIÉ — y la agenda
// (`10-agenda-semana.jpg`) una — L M M J V S D. Se recorta en el componente en
// vez de tener dos listas de días: dos fuentes para el mismo dato es como se
// acaba con el lunes en una pantalla y el martes en otra.
// ─────────────────────────────────────────────────────────────────────────────

test('el horario escribe tres letras y la agenda una', async ({ page }) => {
  await page.goto('/portal-tema-preview/sereno');
  await page.locator('.welcome__cta').click();

  await page.locator('.tab', { hasText: 'Clases' }).click();
  await expect(page.locator('.day__label').first()).toHaveText('LUN', { timeout: 30_000 });

  await page.locator('.tab', { hasText: 'Agenda' }).click();
  await expect(page.locator('.day__label').first()).toHaveText('L');
  // Y las siete, no solo la primera: recortar mal daría «L» y luego «MAR».
  await expect(page.locator('.day__label')).toHaveText(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
});
