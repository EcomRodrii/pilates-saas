import { test, expect } from '@playwright/test';
import { sembrarSociaLista, abrirHojaDeClase, pulsarReservar } from './socia-lista.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Qué hace la página pública cuando el servidor dice QUE NO.
//
// ⚠️ Ataca un punto ciego que este repo tiene ESCRITO en sus propias reglas: los
// e2e mockean la red con `page.route`, así que **ningún test ve nunca un 4xx**.
// Es el hueco que ya costó tres bugs en producción (#500, #505, #560), y el
// primero fue en ESTA página: anunciaba «¡Reserva confirmada!» con el servidor
// devolviendo 400.
//
// El punto ciego no era que un 4xx no se pueda probar — era que nadie escribía
// el mock que lo devuelve. Aquí se escriben.
//
// ⚠️ **Todos los tests exigen `intentos > 0` antes de interpretar nada.** La
// primera versión de este fichero no lo hacía y sus dos tests salieron verdes
// SIN QUE LA PETICIÓN SALIERA: sin socia lista, el clic abre el modal de acceso
// y no escribe. «No mintió» era cierto por no haber intentado nada. Ver la
// cabecera de `socia-lista.ts`.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await sembrarSociaLista(page);
});

test('⚠️ un 400 del servidor NO se anuncia como reserva confirmada', async ({ page }) => {
  // El bug #500 literal, convertido en test por primera vez.
  let intentos = 0;
  await page.route('**/api/public/reserva', (r) => {
    intentos += 1;
    return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Sin bono activo' }) });
  });

  await abrirHojaDeClase(page);
  await pulsarReservar(page);
  await page.waitForTimeout(3000);

  expect(intentos, 'la reserva no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  const txt = await page.evaluate(() => document.body.innerText);
  expect(txt, 'anunció la reserva como confirmada con el servidor en 400').not.toContain('¡Reserva confirmada!');
  // Y además lo DICE: callarse un «no» deja a la clienta creyendo que tiene
  // plaza, que es exactamente el daño de #500.
  expect(txt).toContain('Sin bono activo');
});

test('⚠️ un 500 con HTML (no JSON) tampoco se anuncia como éxito', async ({ page }) => {
  // El peor caso, porque parsear el cuerpo también falla: si el código diera por
  // buena la escritura al no poder leer el error, mentiría igual.
  let intentos = 0;
  await page.route('**/api/public/reserva', (r) => {
    intentos += 1;
    return r.fulfill({ status: 500, contentType: 'text/html', body: '<html><body>Internal Server Error</body></html>' });
  });

  await abrirHojaDeClase(page);
  await pulsarReservar(page);
  await page.waitForTimeout(3000);

  expect(intentos, 'la reserva no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  const txt = await page.evaluate(() => document.body.innerText);
  expect(txt, 'anunció la reserva como confirmada con el servidor en 500').not.toContain('¡Reserva confirmada!');
  expect(txt, 'anunció lista de espera con el servidor en 500').not.toContain('¡En lista de espera!');
});

test('⚠️ con la red caída, la pantalla no se queda muerta', async ({ page }) => {
  // El caso del móvil en un sótano, que es donde de verdad se reserva una clase.
  // `await onReservar(...)` no tiene `try/catch`: si la promesa RECHAZARA, el
  // `setEnviando(false)` de la línea siguiente no llegaría y el botón se
  // quedaría inerte para siempre, sin plaza y sin explicación.
  let intentos = 0;
  await page.route('**/api/public/reserva', (r) => { intentos += 1; return r.abort('failed'); });

  await abrirHojaDeClase(page);
  await pulsarReservar(page);
  await page.waitForTimeout(4000);

  expect(intentos, 'la reserva no llegó a intentarse: el test no prueba nada').toBeGreaterThan(0);
  // No se exige un texto concreto —eso ataría el test a la redacción— sino que
  // se pueda VOLVER A INTENTAR. Un botón deshabilitado para siempre es el único
  // desenlace inaceptable.
  const reintentable = await page.getByRole('button', { name: /^Reservar$/ }).last().isEnabled();
  expect(reintentable, 'el botón se quedó bloqueado tras fallar la red').toBe(true);
  const txt = await page.evaluate(() => document.body.innerText);
  expect(txt, 'anunció éxito con la red caída').not.toContain('¡Reserva confirmada!');
});
