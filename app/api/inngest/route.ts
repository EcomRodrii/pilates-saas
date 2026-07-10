// El cliente se importa PRIMERO (nota de OTel del SDK de Inngest): así el
// provider de tracing se inicializa antes que el resto de imports.
import { inngest } from '@/lib/inngest/client';
import { serve } from 'inngest/next';
import {
  automatizacionesDispatcher,
  procesarEstudioAutomatizaciones,
} from '@/lib/inngest/automatizaciones';

// Endpoint que Inngest llama para descubrir y ejecutar las funciones. El
// handshake se autentica con INNGEST_SIGNING_KEY (env var). maxDuration alto
// porque cada invocación puede ejecutar varios steps encadenados.
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    automatizacionesDispatcher,
    procesarEstudioAutomatizaciones,
  ],
});
