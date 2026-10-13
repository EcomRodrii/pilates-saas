# La demo de Configuración

El vídeo que recorre **todas** las secciones de Configuración —una por una,
configurando cada ajuste y explicándolo— para enseñar a una propietaria nueva. Se ve
en **Configuración → Demo** (`components/configuracion/secciones/seccion-demo.tsx`).

Nada de esto toca un estudio real: el servidor de pruebas arranca con Supabase de
mentira (`https://example.supabase.co`) y el estudio de la demo («Estudio Aurora»,
datos `@example.com`) vive en memoria (`demo/datos.ts`, `demo/backend.ts`).

## Cómo se graba

1. Un servidor de desarrollo con el entorno de e2e, en un puerto libre (el 3000 lo
   usa otra sesión):

   ```bash
   E2E_TEST=1 E2E_PLAZA_FIJA_APP=1 NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
   NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon-key-for-ci SUPABASE_SERVICE_ROLE_KEY=dummy-service-role-key-for-ci \
   NEXT_PUBLIC_APP_URL=http://localhost:3411 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_dummy_e2e_key \
   HOME_PREVIEW_TOKEN_SECRET=e2e-test-home-preview-secret PORT=3411 npm run dev
   ```

2. Comprobar el guion sin grabar (rápido, con una foto por frase en `demo/salida/fotos`):

   ```bash
   DEMO_RAPIDO=1 DEMO_FOTOS=1 npm run demo:grabar
   ```

3. Grabar en tiempo real (≈ 28 min; sin tocar la máquina mientras tanto y con disco libre: se llenó una vez a mitad):

   ```bash
   npm run demo:grabar              # todos los capítulos
   npm run demo:grabar -- reservas  # solo uno (retoma el estudio donde lo dejó el capítulo anterior: demo/salida/estado.json)
   ```

4. Montar: une los capítulos con la voz y reescribe el índice del apartado Demo
   (`lib/configuracion/demo-capitulos.ts`, generado: no se edita a mano).

   ```bash
   npm run demo:montar
   ```

   Sale `demo/salida/demo-configuracion.mp4` (versión web, < 50 MB: el plan gratuito de Supabase no admite más) y
   `master.mp4` (máxima calidad, ~80 MB, para guardar).

## Cómo está hecho

- **Un capítulo = una sección de Configuración** (`demo/capitulos/NN-<sección>.ts`). El
  guion narra con `g.dice()` / `g.mientras(texto, acción)` y apunta con `g.momento(tarjeta)`
  el minuto de cada ajuste.
- **Voz**: ElevenLabs (voz `1CeqBeXMOqCleeQjfYfO`, modelo `eleven_multilingual_v2`) con la clave en
  `ELEVENLABS_API_KEY` (p. ej. en `~/.zshenv`); sin clave cae a `say` (macOS), que solo sirve para
  probar el guion. Una vez por frase, cacheada en `demo/salida/voz` (≈ 26 000 caracteres de cuota
  por grabación completa). `montar.mjs` la mezcla con ffmpeg en el instante exacto en que el guion
  la dijo, le sube la ganancia hasta dejar el pico en −2 dB (fija: nada de `loudnorm`, que la distorsiona). La portada
  (`public/demo/portada-demo-configuracion.jpg`) es solo el póster del reproductor, no va dentro del vídeo.
- **Rótulos y cursor**: se pintan en la página (`SCRIPT_PÁGINA` en `nucleo.ts`).
- **Lo que no se ejecuta**: nada que mueva dinero o pida credenciales de verdad (Stripe,
  datáfono, WhatsApp, Kisi, cobros con cargo, Veri*Factu). Se explica sin pulsar.
- **Cuando cambia una pantalla de Configuración**, el guion se rompe en su selector:
  `DEMO_RAPIDO=1 npm run demo:grabar` lo dice en un minuto, y se regraba ese capítulo.

## Dónde vive el vídeo

Bucket público de lectura `demo-configuracion` de Supabase Storage (sin políticas:
migración `20261008140833_demo_configuracion_bucket.sql`). La URL va en
`VIDEO_DEMO` (`lib/configuracion/demo.ts`).
