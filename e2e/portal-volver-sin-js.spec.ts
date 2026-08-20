import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Las flechas de volver navegan SIN JavaScript.
//
// ⚠️ Eran `<button onClick={() => router.push(...)}>`: no hacen absolutamente
// nada hasta que la página hidrata. En un móvil lento la socia toca volver y no
// pasa nada — la misma familia de «la app no responde» que costó otros
// arreglos de este encargo.
//
// Y es la causa de que `portal-bonos-compras` («la flecha vuelve a Bonos»)
// fallara en la PRIMERA pasada de CI y pasara al relanzar, en tres PRs
// seguidos: en frío la hidratación llega tarde y el clic se pierde. Se arregla
// en la app, no en el test.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const VUELTAS = [
  { desde: 'compras', hasta: 'bonos', etiqueta: 'Volver a Bonos' },
  { desde: 'notificaciones', hasta: 'home', etiqueta: /volver|atrás/i },
];

for (const { desde, hasta, etiqueta } of VUELTAS) {
  test(`la flecha de /${desde} es un enlace de verdad`, async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/${desde}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

    const flecha = page.getByRole('link', { name: etiqueta });
    await expect(flecha).toBeVisible({ timeout: 30_000 });
    // ⚠️ Lo que lo hace inmune a la hidratación: el destino está en el HTML,
    // no en un manejador. Un `<button>` no tiene `href` que comprobar.
    await expect(flecha).toHaveAttribute('href', `/portal/${SLUG}/${hasta}`);
  });
}

// ⚠️ NO se prueba con JavaScript desactivado, aunque sería la prueba de fuego:
// el portal necesita JS para saber quién eres (la sesión se lee en el cliente),
// así que sin él no hay contenido que enseñar. Lo que SÍ importa es lo de
// arriba: que el destino viva en el HTML y no en un manejador. Con `href`, el
// navegador navega en cuanto el enlace está en pantalla, hidratado o no.
