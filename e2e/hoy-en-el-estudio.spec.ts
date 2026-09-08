import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Hoy en el estudio» — la agenda del día, que es lo primero que se ve al
// entrar en el panel.
//
// Lo que se protege aquí:
//   1. Que el día se lea de arriba abajo: hora, instructora, actividad,
//      ocupación y estado de las alumnas.
//   2. Que una clase SIN INSTRUCTORA se distinga de una clase con hueco y de
//      una clase completa. La señal viene de `sustitucionAbierta`, que solo
//      sabe /api/calendario: `sesiones.instructor_id` sigue apuntando a la
//      titular aunque haya avisado de que no viene.
//   3. Que «Rellenar hueco» abra la lista de a quién ofrecérselo ANTES de
//      mandar nada — la queja de origen era un botón que disparaba WhatsApp a
//      todas sin enseñar a quién.
//   4. Que una respuesta vacía del servidor no tumbe la pantalla principal del
//      negocio. Es un fallo que ya ocurrió en esta misma home con
//      /api/decisiones, así que aquí se prueba de entrada.
// ─────────────────────────────────────────────────────────────────────────────

import { montarHome } from './hoy-home-mock';

test('el día se lee de arriba abajo: hora, instructora, ocupación y estado', async ({ page }) => {
  await montarHome(page);

  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });
  await expect(agenda).toBeVisible();

  // La cabecera dice qué día se está mirando, en palabras.
  await expect(agenda.getByText(/Hoy/).first()).toBeVisible();
  await expect(agenda.getByText(/martes, 8 de septiembre/i)).toBeVisible();

  // Las cuatro clases, en hora del estudio (Madrid), en orden.
  const horas = await agenda.locator('li p.tabular-nums').first().textContent();
  expect(horas?.trim()).toBe('08:00');
  for (const h of ['08:00', '14:00', '17:00', '19:30']) {
    await expect(agenda.getByText(h, { exact: true })).toBeVisible();
  }

  // Ocupación de la clase de las 14:00: 7 de 10.
  await expect(agenda.getByText('/ 10 plazas')).toBeVisible();
  // Y el resumen ligero de la cabecera cuadra con la suma del día.
  await expect(agenda.getByText(/4 clases · 25 alumnas · 3 huecos/)).toBeVisible();
});

test('una clase sin instructora se distingue y lleva a buscar sustituta', async ({ page }) => {
  await montarHome(page);
  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });

  await expect(agenda.getByText('Sin instructora').first()).toBeVisible();
  const buscar = agenda.getByRole('link', { name: 'Buscar sustituta' });
  await expect(buscar).toBeVisible();
  // Lleva a la ficha de la clase, que es donde vive esa acción — no se duplica.
  await expect(buscar).toHaveAttribute('href', '/calendario?sesion=ses-sin-instr');

  // Y la clase completa NO grita: se lee tranquila.
  await expect(agenda.getByRole('link', { name: 'Todo preparado' })).toBeVisible();
});

test('«Rellenar hueco» enseña a quién ofrecérselo antes de mandar nada', async ({ page }) => {
  let avisos = 0;
  await page.route('**/api/marketing/hueco/avisar', route => { avisos++; return json(route, { enviados: 1 }); });
  await montarHome(page);
  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });

  const boton = agenda.getByRole('button', { name: /Rellenar huecos/ });
  await expect(boton).toBeVisible();
  await boton.click();

  const panel = page.getByRole('dialog', { name: /Rellenar hueco en Pilates Máquina/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('3 plazas disponibles')).toBeVisible();

  // Y enseña a QUIÉN, con la razón de cada una: las dos que tienen bono en
  // vigor y ya vinieron a esta misma clase. Nadie más.
  await expect(panel.getByText('Socia7 Prueba')).toBeVisible();
  await expect(panel.getByText('Socia8 Prueba')).toBeVisible();
  await expect(panel.getByText('Socia0 Prueba')).toHaveCount(0);
  await expect(panel.getByText('Ya ha venido antes').first()).toBeVisible();

  // Lo importante: abrir el panel no manda ningún mensaje. El aviso sale solo
  // cuando se pulsa, y únicamente para lo seleccionado.
  expect(avisos).toBe(0);
  const enviar = panel.getByRole('button', { name: /Avisar a/ });
  await expect(enviar).toBeDisabled();
  await panel.getByRole('checkbox', { name: /Socia7/ }).check();
  await expect(enviar).toBeEnabled();
});

test('una respuesta vacía del servidor no tumba la home', async ({ page }) => {
  await montarHome(page, { calendarioVacio: true });

  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });
  await expect(agenda).toBeVisible();
  await expect(agenda.getByText('Hoy no tienes clases')).toBeVisible();
  // El resto de la home sigue en pie.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
