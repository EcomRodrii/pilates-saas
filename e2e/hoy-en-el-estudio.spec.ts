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
//   5. Que el recuento que sale al avisar no se calle a nadie: si el tope de
//      esta clase deja fuera a parte de lo seleccionado, se dice cuántas y por
//      qué. «4 avisos enviados» tras seleccionar a doce es cierto y se lee
//      como una avería.
// ─────────────────────────────────────────────────────────────────────────────

import { montarHome, json } from './hoy-home-mock';

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
  await montarHome(page);
  // ⚠️ DESPUÉS de montarHome: Playwright resuelve la ÚLTIMA ruta registrada que
  // encaje, y ahí dentro se registra un `**/api/**` genérico. Antes, este mock
  // quedaba tapado por él y `avisos` no podía subir nunca — la comprobación de
  // abajo pasaba sin medir nada.
  await page.route('**/api/marketing/hueco/avisar', route => { avisos++; return json(route, { enviados: 1 }); });
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

test('avisar dice cuántas se quedaron fuera del tope, no solo cuántas salieron', async ({ page }) => {
  let intentos = 0;
  let seleccionadasEnviadas = 0;
  await montarHome(page, { huecoDeUnaPlaza: true });
  // Después de montarHome, por el catch-all `**/api/**` que registra al final.
  await page.route('**/api/marketing/hueco/avisar', route => {
    intentos++;
    const body = JSON.parse(route.request().postData() ?? '{}') as { socioIds?: string[] };
    seleccionadasEnviadas = body.socioIds?.length ?? 0;
    // Lo que contesta el servidor ante esto: con UNA plaza libre el tope es 4
    // (`topeAvisosHueco`, lib/booking-logic.ts — probado aparte con
    // `node --test`), así que ocho de las doce ni se intentan.
    return json(route, { enviados: 4, porWhatsapp: 4, saltadasPorTope: 8, tope: 4 });
  });

  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });
  // Singular: una sola plaza libre. El de tres huecos dice «Rellenar huecos».
  await agenda.getByRole('button', { name: 'Rellenar hueco', exact: true }).click();

  const panel = page.getByRole('dialog', { name: /Rellenar hueco en Pilates Máquina/ });
  await expect(panel.getByText('1 plaza disponible')).toBeVisible();
  // El tope se dice ANTES de pulsar, no solo al recibir la respuesta. La cifra
  // sale de la constante (`AVISOS_HUECO_POR_PLAZA`), no escrita a mano: es el
  // mismo número que aplica el servidor.
  await expect(panel.getByText(/Salen como mucho 4 avisos por plaza libre/)).toBeVisible();

  // Doce candidatas, las que caben en el panel (MAX_CANDIDATAS) — más que el
  // tope del servidor, que es de lo que va esta prueba.
  const casillas = panel.getByRole('checkbox');
  await expect(casillas).toHaveCount(12);
  for (const casilla of await casillas.all()) await casilla.check();

  await panel.getByRole('button', { name: /Avisar a 12 seleccionadas/ }).click();

  // Lo que se protege: el aviso NO se queda en «4 avisos enviados». Nombra a
  // las ocho que no salieron y dice cuál era el tope. Una sola aserción sobre
  // la frase entera, porque el toast de éxito dura 3 s y dos esperas seguidas
  // podrían caer una a cada lado de ese corte.
  await expect(page.getByText(/8 sin avisar: el tope de esta clase es 4/)).toBeVisible();

  // Y el contador, sin el cual «no mintió» podría ser verdad por no haber
  // llamado a nadie: la petición salió, con las doce seleccionadas dentro.
  expect(intentos).toBe(1);
  expect(seleccionadasEnviadas).toBe(12);
});
