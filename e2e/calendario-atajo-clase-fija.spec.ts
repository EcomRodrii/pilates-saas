import { test, expect, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Atajo «Agrupar con nombre»: al crear una clase fija (Crear clase → Clase fija),
// el toast de confirmación lleva un botón que abre «Agrupar con nombre» en
// Horario con esas franjas ya marcadas — sin repetir a mano lo que se acaba de
// elegir. Agruparla es opcional: cada clase que se repite ya la pueden pedir.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

interface FilaSesion {
  id: string; serie_id: string | null; tipo_clase_id: string; sala_id: string; instructor_id: string | null;
  inicio: string; fin: string; aforo_maximo: number;
}
interface TarjetaMin {
  serieId: string; diaSemana: number; hora: string; duracionMin: number; salaId: string; tipoClaseId: string;
  instructorId: string | null; aforo: number; proximaSesionId: string; proximaInicio: string; ultimaFecha: string;
  clasesFuturas: number; renovacionAutomatica: boolean; noRenovar: boolean; plazasFijas: never[];
}

test('crear una clase fija ofrece «Agrupar con nombre», y abre el diálogo con esas franjas ya marcadas', async ({ page }) => {
  await montar(page);

  let tarjetas: TarjetaMin[] = [];
  // Registrado DESPUÉS de `montar`: gana a su comodín para las escrituras;
  // las lecturas (GET) las deja pasar al de `montar` con `fallback()`.
  await page.route('**/rest/v1/sesiones**', (r: Route) => {
    if (r.request().method() !== 'POST') return r.fallback();
    const filas = r.request().postDataJSON() as FilaSesion[];
    const porDia = new Map<number, FilaSesion>();
    for (const f of filas) {
      const dia = new Date(f.inicio).getDay();
      if (!porDia.has(dia)) porDia.set(dia, f);
    }
    tarjetas = [...porDia.entries()].map(([dia, f]) => ({
      serieId: f.serie_id!, diaSemana: dia, hora: f.inicio.slice(11, 16), duracionMin: 50,
      salaId: f.sala_id, tipoClaseId: f.tipo_clase_id, instructorId: f.instructor_id, aforo: f.aforo_maximo,
      proximaSesionId: f.id, proximaInicio: f.inicio, ultimaFecha: '2026-12-01',
      clasesFuturas: filas.filter(x => new Date(x.inicio).getDay() === dia).length,
      renovacionAutomatica: false, noRenovar: false, plazasFijas: [],
    }));
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(filas) });
  });
  await page.route('**/api/calendario/horario', (r: Route) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      dias: [0, 1, 2, 3, 4, 5, 6].map(d => ({ diaSemana: d, tarjetas: tarjetas.filter(t => t.diaSemana === d) })).filter(d => d.tarjetas.length > 0),
      huerfanas: [],
    }),
  }));

  await ir(page, 'calendario');
  await page.getByRole('button', { name: 'Crear clase', exact: true }).click({ timeout: 60_000 });
  await page.getByTestId('crear-clase-fija').click();
  const dialogoRecurrente = page.getByRole('dialog');
  await expect(dialogoRecurrente.getByText('Nueva clase fija')).toBeVisible();
  // Días por defecto: lunes y miércoles — dos franjas de la misma serie.
  const crear = dialogoRecurrente.getByRole('button', { name: /^Crear \d+ clases/ });
  await expect(crear).toBeEnabled({ timeout: 10_000 });
  await crear.click();

  // El toast trae la acción.
  const accion = page.getByRole('button', { name: 'Agrupar con nombre' });
  await expect(accion).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Clase fija creada/)).toBeVisible();
  await accion.click();

  // Nos lleva a Horario y abre el diálogo de crear, ya con las franjas de la serie marcadas.
  await expect(page.getByTestId('vista-horario')).toBeVisible({ timeout: 30_000 });
  const dialogoClaseFija = page.getByRole('dialog');
  await expect(dialogoClaseFija.getByText('Agrupar con nombre').first()).toBeVisible({ timeout: 30_000 });
  const marcadas = dialogoClaseFija.locator('input[type="checkbox"]:checked');
  await expect(marcadas).toHaveCount(2, { timeout: 10_000 });
});
