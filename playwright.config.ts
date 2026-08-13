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

// En CI la suite se sirve desde el BUILD DE PRODUCCIÓN (`next start`), no desde
// `next dev`. Con `next dev` cada ruta se compila bajo demanda DENTRO del test:
// era el 89% del tiempo de CI (1308s de 1473s) y la fuente de los falsos rojos
// por timeout ya conocidos en este repo. Requiere un `.next` ya construido, que
// en CI llega como artefacto del job de build.
// En local se sigue usando `next dev` por comodidad (sin esperar un build);
// para reproducir CI tal cual: `E2E_USA_BUILD=1 npm run build && npx playwright test`.
const USA_BUILD = process.env.E2E_USA_BUILD === '1';

// ⚠️ Las pantallas que corren TAMBIÉN en WebKit — la lista es corta a propósito.
//
// El repo documenta como punto ciego que los e2e solo corran en Chromium: una
// API que Chrome resuelve y Safari no pasa verde y falla en el iPad de
// recepción (#565, `BarcodeDetector`), y en #994 se encontraron tres pantallas
// que decían «Copiado» con el portapapeles vacío por lo mismo.
//
// Pero pasar TODA la suite por WebKit dobla el e2e, y este repo peleó su CI de
// 24m36s a 5m44s a base de no hacer eso. El criterio es dónde un fallo solo de
// Safari le pasa a una CLIENTA REAL: `/reservar` es el widget que el estudio
// incrusta en su web y que se abre casi siempre desde un iPhone. Ahí sí se
// paga la segunda pasada.
//
// Se emula un iPhone entero (`devices['iPhone 13']`), no solo el motor: el
// viewport y el táctil forman parte de lo que se está probando.
//
// Para añadir una: que sea PÚBLICA y que su fallo lo sufra alguien de fuera
// del estudio. El panel no entra — se usa desde el iPad de recepción, sí, pero
// ahí hay alguien que puede avisar; una socia con el widget roto se va.
const SPECS_WEBKIT = [
  '**/reservar-acoplar-widget.spec.ts',
  '**/reservar-el-servidor-dice-no.spec.ts',
  '**/reservar-vista-mes.spec.ts',
  '**/reservar-citas-movil.spec.ts',
  '**/network-marketplace-publico.spec.ts',
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Los runners de GitHub tienen 4 vCPU y Playwright, por defecto, usa la
  // MITAD (medido: "Running 59 tests using 2 workers"). Sirviendo desde el
  // build ya no hay compilación que sature la CPU — el servidor solo entrega
  // páginas ya construidas — así que caben los 4. En local se deja el
  // automático para no acaparar la máquina mientras se programa.
  workers: process.env.CI ? 4 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit-publico',
      use: { ...devices['iPhone 13'] },
      testMatch: SPECS_WEBKIT,
    },
  ],
  // Arranca el servidor (build o dev, ver USA_BUILD) si no hay ya uno en el
  // puerto. El env forzado aquí
  // garantiza que la E2E nunca use el backend real: valores dummy (Next no los
  // pisa con .env.local) + E2E_TEST=1 para sembrar el estudio en el servidor.
  webServer: {
    command: USA_BUILD ? `PORT=${PORT} npm run start` : `PORT=${PORT} npm run dev`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      E2E_TEST: '1',
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'dummy-anon-key-for-ci',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dummy-service-role-key-for-ci',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // Fijo (no derivado de nada secreto de verdad): e2e/portal-preview-home.spec.ts
      // firma su propio token con este mismo valor para probar /portal-preview/[slug]
      // sin pasar por sesión de staff real (que no existe en este entorno dummy).
      HOME_PREVIEW_TOKEN_SECRET: 'e2e-test-home-preview-secret',
    },
  },
});
