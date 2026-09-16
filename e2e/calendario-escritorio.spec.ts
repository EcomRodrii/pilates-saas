import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario en un ordenador: la rejilla llega al fondo de la ventana y no
// se la come la cabecera.
//
// Medido antes del arreglo, con el aviso «¿Primera vez aquí?» de la guía puesto
// (lo ve cualquier estudio nuevo):
//   · 1366×768 (el portátil Windows más común): la rejilla empezaba a 499 px y
//     la PÁGINA se desplazaba 60 px, así que salía cortada abajo — unas tres
//     horas a la vista;
//   · la barra de botones no cabía en una fila y «Clase recurrente» bajaba sola
//     a una segunda;
//   · en un monitor de 1920 px, filtros y métricas iban en dos filas medio vacías.
// El alto era un `calc(100vh - 72px)` que no sabía nada del aviso.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const rejilla = (page: Page) => page.getByTestId('grid-semana-scroll');

async function semana(page: Page) {
  await montar(page);
  await ir(page, 'calendario');
  await expect(rejilla(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400); // el alto se mide en el siguiente fotograma
}

/** Horas de rejilla que se ven de verdad: desde bajo la cabecera de días hasta donde acaba la ventana. */
const horasALaVista = (page: Page) => page.evaluate(() => {
  const rej = document.querySelector<HTMLElement>('[data-testid="grid-semana-scroll"]')!;
  const r = rej.getBoundingClientRect();
  const cabecera = document.querySelector<HTMLElement>('[data-cabecera-dia="0"]')!.getBoundingClientRect();
  return +((Math.min(r.bottom, innerHeight) - cabecera.bottom) / Number(rej.dataset.pxPorHora)).toFixed(2);
});

const VISTAS = [
  // Horas a la vista con el aviso de la guía puesto. Antes del arreglo: 2,96 ·
  // 4,28 · 7,42 (y la rejilla cortada por abajo). En 1920 la letra es grande
  // (84 px por hora en vez de 72), así que a la vista caben menos: ~6,6.
  { nombre: 'portátil Windows 1366×768', w: 1366, h: 768, horas: 3.6 },
  { nombre: 'MacBook 1440×900', w: 1440, h: 900, horas: 5.3 },
  { nombre: 'monitor 1920×1080', w: 1920, h: 1080, horas: 6.3 },
] as const;

for (const v of VISTAS) {
  test.describe(`Calendario en ${v.nombre}`, () => {
    test.use({ viewport: { width: v.w, height: v.h } });

    test('la página no se desplaza y la rejilla acaba dentro de la ventana', async ({ page }) => {
      await semana(page);
      const m = await page.evaluate(() => ({
        sobra: document.documentElement.scrollHeight - innerHeight,
        fondo: document.querySelector<HTMLElement>('[data-testid="grid-semana-scroll"]')!.getBoundingClientRect().bottom,
      }));
      expect(m.sobra, 'la página se desplaza').toBeLessThanOrEqual(1);
      expect(m.fondo, 'la rejilla sale cortada por abajo').toBeLessThanOrEqual(v.h);
      expect(await horasALaVista(page), 'horas de rejilla a la vista').toBeGreaterThanOrEqual(v.horas);
    });

    test('cerrar el aviso de la guía le da ese sitio a la rejilla', async ({ page }) => {
      await semana(page);
      const antes = await horasALaVista(page);
      // Verde por vacío no: el panel sembrado es un estudio nuevo y el aviso tiene que estar.
      const cerrar = page.getByRole('button', { name: 'Ocultar esta ayuda' });
      await expect(cerrar).toBeVisible();
      await cerrar.click();
      await expect.poll(() => horasALaVista(page)).toBeGreaterThan(antes + 0.3);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    });

    test('los botones de la cabecera van en una sola fila', async ({ page }) => {
      await semana(page);
      const filas = new Set<number>();
      for (const nombre of [/^Seleccionar varias$/, /^Semana$/, /^Hoy$/, /Nueva clase/, /Clase recurrente/]) {
        const caja = await page.getByRole('button', { name: nombre }).first().boundingBox();
        filas.add(Math.round((caja!.y + caja!.height / 2) / 8));
      }
      expect(filas.size, 'filas de botones').toBe(1);
    });
  });
}

test.describe('En un monitor ancho', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('filtros y métricas comparten fila', async ({ page }) => {
    await semana(page);
    const buscar = await page.getByPlaceholder('Buscar clase...').boundingBox();
    const clases = await page.getByText('esta semana', { exact: true }).boundingBox();
    expect(Math.abs((buscar!.y + buscar!.height / 2) - (clases!.y + clases!.height / 2)), 'misma fila').toBeLessThan(40);
  });
});

// ─── La letra de la semana, según el alto de la pantalla ─────────────────────
// En un monitor de 1080 las clases iban a 9–10,5 px y se perdían en la rejilla.
// Donde sobra alto la letra sube (y cada hora mide 84 px en vez de 72, para que
// quepa); en un portátil bajo se queda como estaba, porque ahí cada hora a la
// vista cuenta más. Lo que se mide es lo que se pinta, línea a línea: una línea
// que no cabe se quita, nunca sale partida (mismo criterio que
// `calendario-semana-legible.spec.ts`, que vigila la letra normal).

const json = (r: import('@playwright/test').Route, b: unknown) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const clase = (id: string, hm: string, min: number, tc = 'tc-reformer') => {
  const inicio = new Date(`${HOY}T${hm}:00+02:00`);
  return {
    id, studioId: 'studio-test', tipoClaseId: tc, salaId: 'sala-1', instructorId: 'ins-1', inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + min * 60_000).toISOString(), aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, serieId: null,
  };
};

async function semanaCon(page: Page, sesiones: ReturnType<typeof clase>[]) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, {
    sesiones, reservas: [], sustituciones: [], salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 12 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Instructora de prueba', rol: 'INSTRUCTOR', color: '#8B5CF6', activo: true }],
    horaApertura: '07:00', horaCierre: '21:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await ir(page, 'calendario');
  await expect(page.locator('[role="button"][title*=" · "]').first()).toBeAttached({ timeout: 60_000 });
}

/** Tamaño de la letra de la hora y del nombre de la primera clase. */
const letraDeLaClase = (page: Page) => page.evaluate(() => {
  const b = document.querySelector<HTMLElement>('[role="button"][title*=" · "]')!;
  const spans = [...b.querySelectorAll<HTMLElement>('span')].filter((s) => s.childNodes[0]?.nodeType === 3 && s.textContent?.trim());
  return spans.map((s) => parseFloat(getComputedStyle(s).fontSize));
});

test.describe('Monitor 1920×1080: la semana con letra grande', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('las clases van a 11 px o más y ninguna línea sale cortada, dure lo que dure', async ({ page }) => {
    await semanaCon(page, [
      clase('m30', '07:00', 30), clase('m40', '08:00', 40), clase('m45', '09:00', 45),
      clase('m50', '10:00', 50), clase('m55', '11:00', 55), clase('m60', '12:00', 60), clase('m75', '14:00', 75),
    ]);
    await expect(rejilla(page)).toHaveAttribute('data-letra', 'grande');
    expect(Math.min(...await letraDeLaClase(page)), 'letra más pequeña de una clase').toBeGreaterThanOrEqual(11);

    const r = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"][title*=" · "]')).map((b) => {
      const rb = b.getBoundingClientRect();
      const lineas = Array.from(b.children).filter((c) => getComputedStyle(c).position !== 'absolute') as HTMLElement[];
      return {
        id: b.title.split(' · ')[0],
        lineas: lineas.length,
        cortes: lineas
          .filter((l) => l.getBoundingClientRect().bottom > rb.bottom - 3 + 0.5 || l.scrollHeight > l.clientHeight + 1)
          .map((l) => (l.textContent || '').trim()),
      };
    }));
    expect(r.flatMap((x) => x.cortes.map((c) => `${x.id} «${c}»`)), 'líneas que no caben en su tarjeta').toEqual([]);
    // Una clase de 50 min sigue enseñando las tres líneas (hora, clase, instructora).
    const de50 = r.find((x) => x.id.startsWith('10:00'));
    expect(de50?.lineas, 'líneas de una clase de 50 min').toBe(3);
  });

  test('dos y tres clases a la vez no se aplastan hasta cortar el nombre', async ({ page }) => {
    await semanaCon(page, [
      clase('a', '09:00', 55), clase('b', '09:00', 55, 'tc-mat'),
      clase('c', '12:00', 55), clase('d', '12:15', 55, 'tc-mat'), clase('e', '12:30', 55),
    ]);
    const r = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"][title*=" · "]')).map((b) => {
      const nombre = b.querySelector<HTMLElement>('span.truncate');
      return { t: b.title.split(' · ').slice(0, 2).join(' '), cortado: !!nombre && nombre.scrollWidth > nombre.clientWidth + 1 };
    }));
    expect(r.length).toBe(5);
    expect(r.filter((x) => x.cortado).map((x) => x.t), 'nombres cortados').toEqual([]);
  });
});

test.describe('Portátil 1440×900: la letra de la semana no cambia', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('letra normal y 72 px por hora', async ({ page }) => {
    await semanaCon(page, [clase('m50', '10:00', 50)]);
    await expect(rejilla(page)).toHaveAttribute('data-letra', 'normal');
    await expect(rejilla(page)).toHaveAttribute('data-px-por-hora', '72');
    expect(Math.min(...await letraDeLaClase(page))).toBeLessThan(11);
  });
});

test.describe('MacBook Pro 1512×982: métricas junto a los filtros', () => {
  test.use({ viewport: { width: 1512, height: 982 } });

  test('el pie de ninguna tarjeta sale cortado', async ({ page }) => {
    await semana(page);
    const cortados = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.tm-pie')]
      .filter((p) => p.getBoundingClientRect().width > 0 && (p.scrollWidth > p.clientWidth + 1 || p.scrollHeight > p.clientHeight + 1))
      .map((p) => p.textContent));
    expect(await page.locator('.tm-pie').count()).toBeGreaterThan(0);
    expect(cortados).toEqual([]);
  });
});
