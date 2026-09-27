import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaLista, SLUG as SLUG_SOCIA } from './socia-lista';

// Días y horas en la zona del ESTUDIO (RES-7-f): navegador en Madrid y reloj
// con su offset, como el resto de specs de /reservar que miran horas.
test.use({ timezoneId: 'Europe/Madrid' });

// ─────────────────────────────────────────────────────────────────────────────
// «Calendario semanal» (`?presentacion=semana`, components/reservar/
// horario-semana.tsx): otra presentación del MISMO horario. Lo que se prueba es
// el contrato, no el dibujo:
//   - sin el parámetro, la lista de siempre y nada del calendario;
//   - con él, el calendario ocupa el sitio de la lista (las tarjetas no se ven);
//   - tocar una clase hace lo mismo que tocar su tarjeta: la invitada va a sus
//     pasos y la socia abre la ficha de siempre — con el foco en ella, que la
//     ficha se monta dentro de un contenedor que estaba oculto un instante antes;
//   - el Atrás del navegador vuelve al calendario, no a la lista, y Adelante
//     reabre la ficha también con el foco en ella;
//   - las flechas de semana no sueltan el foco del teclado al apagarse.
//
// El miércoles 12 de agosto de 2026, a las 08:00 de Madrid; la clase es a las 10:00.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixtureInvitada() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@example.com', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
    },
    tiposClase: [
      { id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null },
      { id: 'tc-m', studioId: STUDIO_ID, nombre: 'Mat', color: '#8FC98A', nivel: 'TODOS', ventanaCancelacionHoras: null },
    ],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [],
    // Sin planes: sin plan que exigir, tocar una clase lleva siempre a 'login'.
    planesTarifa: [],
    sesiones: [
      { id: 'ses-r', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false },
      // La semana que viene: la flecha «siguiente» tiene adónde ir.
      { id: 'ses-m', studioId: STUDIO_ID, tipoClaseId: 'tc-m', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-18T18:30:00', fin: '2026-08-18T19:20:00', aforoMaximo: 10, cancelada: false },
    ],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function abrirComoInvitada(page: Page, query: string) {
  await page.clock.install({ time: new Date(`${AHORA}+02:00`) });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureInvitada()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  await page.goto(`/reservar/${SLUG}?tab=clases${query}`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
}

const calendario = (page: Page) => page.getByRole('region', { name: 'Calendario semanal' });
const chipReformer = (page: Page) => page.getByRole('button', { name: /^Reformer, miércoles 12 a las 10:00/ });
// La tarjeta de la lista de siempre: «Reformer a las 10:00, con Ana, …».
const tarjetaReformer = (page: Page) => page.getByRole('button', { name: /Reformer a las 10:00/ });

test('⚠️ sin el parámetro, la lista de siempre y nada del calendario', async ({ page }) => {
  await abrirComoInvitada(page, '');
  await expect(tarjetaReformer(page)).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page)).toHaveCount(0);
  await expect(chipReformer(page)).toHaveCount(0);
});

test('con `presentacion=semana` el calendario ocupa el sitio de la lista, y se navega por semanas', async ({ page }) => {
  await abrirComoInvitada(page, '&presentacion=semana');
  await expect(calendario(page)).toBeVisible({ timeout: 30_000 });
  await expect(calendario(page).getByText('10 – 16 de agosto', { exact: true })).toBeVisible();
  await expect(chipReformer(page)).toBeVisible();
  // Las tarjetas siguen montadas (su ficha hace falta) pero fuera de la vista.
  await expect(tarjetaReformer(page)).toHaveCount(0);

  // Hacia atrás no: lo pasado no se reserva.
  await expect(calendario(page).getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
  // Con el teclado, que es donde un botón que se apaga puede soltar el foco.
  const siguiente = calendario(page).getByRole('button', { name: 'Semana siguiente' });
  await siguiente.focus();
  await page.keyboard.press('Enter');
  await expect(calendario(page).getByText('17 – 23 de agosto', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Mat, martes 18 a las 18:30/ })).toBeVisible();
  // Y después de la última clase no hay más semanas vacías que recorrer…
  await expect(siguiente).toBeDisabled();
  // …pero la flecha apagada conserva el foco (con `disabled` se iba a `body`).
  await expect(siguiente).toBeFocused();
});

test('invitada: tocar la clase lleva a sus pasos, como la tarjeta, y Atrás vuelve al calendario', async ({ page }) => {
  await abrirComoInvitada(page, '&presentacion=semana');
  await chipReformer(page).click();
  await expect(page.getByRole('heading', { name: 'Entra para reservar' })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBe('login');
  expect(new URL(page.url()).searchParams.get('clase')).toBe('ses-r');

  await page.goBack();
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBeNull();
  await expect(chipReformer(page)).toBeVisible({ timeout: 30_000 });
  await expect(tarjetaReformer(page)).toHaveCount(0);
});

test('socia: tocar la clase abre la ficha de siempre, con el foco en ella', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await sembrarSociaLista(page, { relojMadrid: true });
  await page.goto(`/reservar/${SLUG_SOCIA}?tab=clases&presentacion=semana`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await chipReformer(page).click();

  // La ficha (no los pasos de acceso): es donde la socia ve qué se le descuenta.
  await expect(page.getByRole('button', { name: /^Reservar$/ })).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBe('ficha');
  // ⚠️ La ficha se monta en el mismo render en que el contenedor deja de estar
  // oculto; si no, su título no puede recibir el foco y el teclado se pierde.
  await expect(page.getByRole('heading', { level: 2, name: 'Reformer' })).toBeFocused();
  await expect(calendario(page)).toHaveCount(0);

  await page.goBack();
  await expect(chipReformer(page)).toBeVisible({ timeout: 30_000 });

  // Adelante reabre la ficha desde la URL, no desde un toque: también tiene
  // que montarse visible y con el foco en su título.
  await page.goForward();
  await expect.poll(() => new URL(page.url()).searchParams.get('paso'), { timeout: 10_000 }).toBe('ficha');
  await expect(page.getByRole('heading', { level: 2, name: 'Reformer' })).toBeFocused({ timeout: 30_000 });
  await expect(calendario(page)).toHaveCount(0);
});
