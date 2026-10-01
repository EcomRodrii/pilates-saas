import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario en un ordenador: la semana llega al fondo de la ventana, no se
// la come la cabecera, y se lee.
//
// Historia: medido antes del primer arreglo, con el aviso «¿Primera vez aquí?»
// de la guía puesto, a 1366×768 la rejilla empezaba a 499 px y la PÁGINA se
// desplazaba 60 px. Desde el rediseño del 1-oct-2026 la semana va por franjas
// (components/calendario/semana-franjas.tsx): una fila por hora con clase, sin
// alto por hora que medir. Lo que se vigila ahora es lo mismo con otra forma:
// que la página no se desplace, que la semana acabe dentro de la ventana, que la
// cabecera vaya en sus dos filas y que ninguna clase salga cortada.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const semanaVista = (page: Page) => page.getByTestId('semana-franjas');

async function semana(page: Page) {
  await montar(page);
  await ir(page, 'calendario');
  await expect(semanaVista(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400); // el alto se mide en el siguiente fotograma
}

const VISTAS = [
  { nombre: 'portátil Windows 1366×768', w: 1366, h: 768 },
  { nombre: 'MacBook 1440×900', w: 1440, h: 900 },
  { nombre: 'monitor 1920×1080', w: 1920, h: 1080 },
] as const;

/** La fila (en tramos de 8 px) en la que cae el centro de cada control. */
async function filaDe(page: Page, nombre: RegExp, rol: 'button' | 'link' = 'button'): Promise<number> {
  const caja = await page.getByRole(rol, { name: nombre }).first().boundingBox();
  return Math.round((caja!.y + caja!.height / 2) / 8);
}

for (const v of VISTAS) {
  test.describe(`Calendario en ${v.nombre}`, () => {
    test.use({ viewport: { width: v.w, height: v.h } });

    test('la página no se desplaza y la semana acaba dentro de la ventana', async ({ page }) => {
      await semana(page);
      const m = await page.evaluate(() => ({
        sobra: document.documentElement.scrollHeight - innerHeight,
        fondo: document.querySelector<HTMLElement>('[data-testid="semana-franjas"]')!.getBoundingClientRect().bottom,
      }));
      expect(m.sobra, 'la página se desplaza').toBeLessThanOrEqual(1);
      expect(m.fondo, 'la semana sale cortada por abajo').toBeLessThanOrEqual(v.h);
    });

    test('cerrar el aviso de la guía le da ese sitio a la semana', async ({ page }) => {
      await semana(page);
      const alto = () => semanaVista(page).evaluate(el => el.getBoundingClientRect().height);
      const antes = await alto();
      const cerrar = page.getByRole('button', { name: 'Ocultar esta ayuda' });
      await expect(cerrar).toBeVisible();
      await cerrar.click();
      await expect.poll(alto).toBeGreaterThan(antes + 20);
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    });

    test('la cabecera va en dos filas: las herramientas, y lo que se mira', async ({ page }) => {
      await semana(page);
      const herramientas = new Set([
        await filaDe(page, /^Buscar clase$/),
        await filaDe(page, /^Importar horario$/, 'link'),
        await filaDe(page, /^Seleccionar varias$/),
        await filaDe(page, /^Crear clase$/),
      ]);
      expect(herramientas.size, 'filas de herramientas').toBe(1);
      const mirando = new Set([await filaDe(page, /^Hoy$/), await filaDe(page, /^Semana$/)]);
      expect(mirando.size, 'fila de lo que se mira').toBe(1);
      expect([...mirando][0]).toBeGreaterThan([...herramientas][0]);
    });
  });
}

test.describe('En un monitor ancho', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('las herramientas llevan su nombre, no solo un icono', async ({ page }) => {
    await semana(page);
    for (const nombre of ['Buscar', 'Importar horario', 'Seleccionar varias']) {
      await expect(page.locator('[data-slot="page-header-actions"]').getByText(nombre, { exact: true })).toBeVisible();
    }
  });
});

// ── Que se LEA, no solo que se pinte ───────────────────────────────────────────

const json = (r: Route, b: unknown) =>
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

/** Tamaño de la letra de cada texto de la primera clase. */
const letraDeLaClase = (page: Page) => page.evaluate(() => {
  const b = document.querySelector<HTMLElement>('[role="button"][title*=" · "]')!;
  const textos = [...b.querySelectorAll<HTMLElement>('span, p')].filter((s) => s.childNodes[0]?.nodeType === 3 && s.textContent?.trim());
  return textos.map((s) => parseFloat(getComputedStyle(s).fontSize));
});

test.describe('Monitor 1920×1080: la semana se lee', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  test('las clases van a 12 px o más y ninguna línea sale cortada, dure lo que dure', async ({ page }) => {
    await semanaCon(page, [
      clase('m30', '07:00', 30), clase('m40', '08:00', 40), clase('m45', '09:00', 45),
      clase('m50', '10:00', 50), clase('m55', '11:00', 55), clase('m60', '12:00', 60), clase('m75', '14:00', 75),
    ]);
    expect(Math.min(...await letraDeLaClase(page)), 'letra más pequeña de una clase').toBeGreaterThanOrEqual(12);

    const r = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"][title*=" · "]')).map((b) => {
      const rb = b.getBoundingClientRect();
      const lineas = Array.from(b.children).filter((c) => getComputedStyle(c).position !== 'absolute') as HTMLElement[];
      return {
        id: b.title.split(' · ')[0],
        lineas: lineas.length,
        cortes: lineas
          .filter((l) => l.getBoundingClientRect().bottom > rb.bottom + 0.5 || l.scrollHeight > l.clientHeight + 1)
          .map((l) => (l.textContent || '').trim()),
      };
    }));
    expect(r.flatMap((x) => x.cortes.map((c) => `${x.id} «${c}»`)), 'líneas que no caben en su tarjeta').toEqual([]);
    // Con sitio, dos líneas: hora, clase y plazas; y quién la da. La duración no quita ninguna.
    expect(r.every(x => x.lineas === 2), 'todas las clases con sus dos líneas').toBe(true);
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

test.describe('MacBook Pro 1512×982: la ficha al lado', () => {
  test.use({ viewport: { width: 1512, height: 982 } });

  test('abrir una clase pone su ficha al lado, sin tapar la semana', async ({ page }) => {
    await semana(page);
    await page.locator('[data-sesion-id]').first().click();
    const ficha = page.getByTestId('ficha-clase');
    await expect(ficha).toBeVisible({ timeout: 30_000 });
    const f = (await ficha.boundingBox())!;
    const s = (await semanaVista(page).boundingBox())!;
    expect(s.x + s.width, 'la semana acaba antes de la ficha').toBeLessThanOrEqual(f.x + 1);
    // Y no es un cajón: no hay nada por encima de la semana.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
