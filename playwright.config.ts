import { defineConfig, devices } from '@playwright/test';

// Suite E2E básica (registro · reserva · pago) sobre la app real.
// El webServer arranca con env dummy de Supabase + E2E_TEST=1 (nunca contra
// producción): la resolución server-side del estudio se siembra vía E2E_TEST
// (lib/studio-seo.ts) y las lecturas/escrituras del navegador se mockean con
// page.route — deterministas y sin tocar datos reales (ver e2e/booking.spec.ts).
// Puerto configurable (E2E_PORT) — CI usa el 3000 por defecto; en local permite
// correr aunque el 3000 esté ocupado por otro dev server.
const PORT = process.env.E2E_PORT ?? '3000';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Arranca `next dev` si no hay ya un server en el puerto. El env forzado aquí
  // garantiza que la E2E nunca use el backend real: valores dummy (Next no los
  // pisa con .env.local) + E2E_TEST=1 para sembrar el estudio en el servidor.
  webServer: {
    command: `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E_TEST: '1',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'dummy-anon-key-for-ci',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy-service-role-key-for-ci',
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
