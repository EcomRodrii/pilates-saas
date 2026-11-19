import type { Page } from '@playwright/test';

// /login tiene dos pieles (`LOGIN_NUEVO`, lib/auth/login-nuevo.ts): la nueva, en dos pasos (correo → contraseña), y la
// de siempre, con todo en una tarjeta. Los e2e que solo quieren «entrar» o «pedir el enlace» pasan por aquí para no
// depender de la piel. En la nueva, cada paso es un panel apilado y los inactivos están `inert`: se apunta al activo.

const ACTIVO = '.ln-panel:not([inert])';

export async function esLoginNuevo(page: Page): Promise<boolean> {
  await page.locator('input[type="email"]').first().waitFor({ timeout: 30_000 });
  return (await page.locator('[data-login-nuevo]').count()) > 0;
}

/** Escribe correo y contraseña y pulsa el botón de entrar, sea cual sea la piel. */
export async function entrarPorLogin(page: Page, email: string, clave: string): Promise<void> {
  if (await esLoginNuevo(page)) {
    await page.locator(`${ACTIVO} input[type="email"]`).fill(email);
    await page.getByRole('button', { name: 'Continuar', exact: true }).click({ timeout: 30_000 });
    await page.locator(`${ACTIVO} input[type="password"]`).fill(clave);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click({ timeout: 30_000 });
    return;
  }
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(clave);
  await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });
}

/** Llega al botón «he olvidado mi contraseña» (con el correo escrito, si se da) y lo pulsa. */
export async function pulsarOlvideMiClave(page: Page, email?: string): Promise<void> {
  if (await esLoginNuevo(page)) {
    // La piel nueva no llega a ese botón sin correo: el paso de la contraseña solo existe con uno escrito.
    await page.locator(`${ACTIVO} input[type="email"]`).fill(email ?? 'sin.correo@example.com');
    await page.getByRole('button', { name: 'Continuar', exact: true }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click({ timeout: 30_000 });
    return;
  }
  if (email) await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'He olvidado mi contraseña' }).click({ timeout: 30_000 });
}

/**
 * El aviso (error o información) del login. En la piel nueva el mismo aviso se pinta en los tres paneles (los inactivos están
 * `inert` y `aria-hidden`), así que `getByText` daría tres coincidencias: `getByRole('alert')` solo ve el del activo.
 */
export async function avisoDelLogin(page: Page, texto: string | RegExp) {
  return (await esLoginNuevo(page))
    ? page.getByRole('alert').or(page.getByRole('status')).filter({ hasText: texto })
    : page.getByText(texto);
}
