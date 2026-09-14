import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// La semana del calendario tiene que LEERSE, no solo pintarse.
//
// Se reportó con captura que las clases salían cortadas, y lo estaban de dos
// maneras que ninguna prueba veía, porque el texto EXISTE en el DOM:
//
//   1. En ancho: las siete columnas se repartían igual y cada clase que coincide
//      con otra recibe una fracción de la suya. Dos a la vez, 54 px («Refor…»);
//      tres, 35 px. Medido a 1280×720 con el menú grande.
//   2. En alto: a 58 px por hora, una tarjeta de 50 min medía 46 px y pintaba
//      tres líneas que piden 55. Toda clase de menos de una hora salía cortada.
//
// Por eso las comprobaciones son GEOMÉTRICAS, línea a línea. Y ojo con cómo se
// mide lo segundo: la tarjeta es `flex-col` con alto fijo, así que sus líneas
// se ENCOGEN en vez de desbordarla — el `scrollHeight` del bloque sale igual
// que su alto aunque el texto esté partido. La primera medición lo dio por
// bueno justo por eso.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const clase = (id: string, hm: string, min: number, tc = 'tc-reformer') => {
  const inicio = new Date(`${HOY}T${hm}:00+02:00`);
  return { id, studioId: 'studio-test', tipoClaseId: tc, salaId: 'sala-1', instructorId: 'ins-1', inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + min * 60_000).toISOString(), aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, serieId: null };
};

async function semanaCon(page: Page, sesiones: ReturnType<typeof clase>[]) {
  await page.setViewportSize({ width: 1280, height: 720 });
  // El menú grande es el caso que se reportó: estrecha la zona del calendario.
  await page.addInitScript(() => localStorage.setItem('sidebar-size', 'grande'));
  await montar(page);
  await page.route((u) => u.pathname === '/api/calendario', (r) => json(r, {
    sesiones, reservas: [], sustituciones: [], salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 12 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Instructora de prueba', rol: 'INSTRUCTOR', color: '#8B5CF6', activo: true }],
    horaApertura: '07:00', horaCierre: '21:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await ir(page, 'calendario');
  await page.getByRole('button', { name: /^Semana$/ }).click().catch(() => {});
  await expect(page.locator('[role="button"][title*=" · "]').first()).toBeAttached({ timeout: 60_000 });
}

test.describe('Calendario · la semana se lee', () => {
  test.describe.configure({ timeout: 240_000 });

  test('ninguna línea de una clase sale cortada, dure lo que dure', async ({ page }) => {
    await semanaCon(page, [
      clase('m30', '07:00', 30), clase('m40', '08:00', 40), clase('m45', '09:00', 45),
      clase('m50', '10:00', 50), clase('m55', '11:00', 55), clase('m60', '12:00', 60), clase('m75', '14:00', 75),
    ]);
    const cortes = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"][title*=" · "]')).flatMap((b) => {
      const rb = b.getBoundingClientRect();
      // Las líneas son los hijos en flujo; el aro de selección y la barra de abajo van absolutos.
      const lineas = Array.from(b.children).filter((c) => getComputedStyle(c).position !== 'absolute') as HTMLElement[];
      return lineas
        .filter((l) => l.getBoundingClientRect().bottom > rb.bottom - 3 + 0.5 || l.scrollHeight > l.clientHeight + 1)
        .map((l) => `${b.title.split(' · ')[0]} «${(l.textContent || '').trim()}»`);
    }));
    expect(cortes, 'líneas que no caben en su tarjeta').toEqual([]);
  });

  test('dos y tres clases a la vez no se aplastan hasta cortar el nombre', async ({ page }) => {
    await semanaCon(page, [
      clase('a', '09:00', 55), clase('b', '09:00', 55, 'tc-mat'),
      clase('c', '12:00', 55), clase('d', '12:15', 55, 'tc-mat'), clase('e', '12:30', 55),
    ]);
    const r = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"][title*=" · "]')).map((b) => {
      const nombre = b.querySelector<HTMLElement>('span.truncate');
      return { t: b.title.split(' · ').slice(0, 2).join(' '), ancho: Math.round(b.getBoundingClientRect().width), cortado: !!nombre && nombre.scrollWidth > nombre.clientWidth + 1 };
    }));
    expect(r.length).toBe(5);
    for (const x of r) {
      expect.soft(x.ancho, `${x.t}: ancho`).toBeGreaterThanOrEqual(60);
      expect.soft(x.cortado, `${x.t}: nombre cortado`).toBe(false);
    }
  });

  test('la cabecera de cada día queda encima de su columna', async ({ page }) => {
    // ⚠️ Riesgo concreto del reparto por pesos: cabecera y cuerpo tienen que usar
    // la MISMA plantilla. Antes se alineaban solo porque las dos repartían a
    // partes iguales; un día con solapes es justo el caso que las descuadraría.
    await semanaCon(page, [clase('a', '09:00', 55), clase('b', '09:00', 55, 'tc-mat'), clase('c', '09:00', 55)]);
    const desfases = await page.evaluate(() => Array.from({ length: 7 }, (_, i) => {
      const cab = document.querySelector<HTMLElement>(`[data-cabecera-dia="${i}"]`)?.getBoundingClientRect();
      const col = document.querySelector<HTMLElement>(`[data-dia-index="${i}"]`)?.getBoundingClientRect();
      if (!cab || !col) return `día ${i}: falta cabecera o columna`;
      const dl = Math.abs(cab.left - col.left), dw = Math.abs(cab.width - col.width);
      return dl > 1 || dw > 1 ? `día ${i}: izquierda ${dl.toFixed(1)} px, ancho ${dw.toFixed(1)} px` : '';
    }).filter(Boolean));
    expect(desfases).toEqual([]);
  });
});
