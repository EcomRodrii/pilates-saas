import { defineConfig, devices } from '@playwright/test';

// Suite E2E básica (registro · reserva · pago) sobre la app real.
// El dev server apunta a la Supabase de producción, así que los tests
// interceptan las ESCRITURAS (reserva/alta/checkout) para no ensuciar datos
// reales — ver e2e/booking.spec.ts. Las LECTURAS (catálogo) sí son reales.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Arranca `next dev` si no hay ya un server en el puerto.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
