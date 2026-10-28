// El script que activa el panel de demostración: lo carga el `<head>` solo cuando la
// pestaña lo ha pedido (ver components/demo/panel/cargador.ts). Va en un paquete
// aparte, sin React, para que no pese en ninguna otra pantalla.
import { montar } from '../../../e2e/panel-sembrado.ts';
import { crearPagina } from './page-shim.ts';

declare global { interface Window { __demoPanel?: { sinAtender: () => string[] } } }

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://example.supabase.co';
const host = new URL(URL_SUPABASE).host;
const ref = host.split('.')[0];

// Nada de esto sale del navegador: el panel pinta un estudio ficticio, y todo lo que
// «guarda» se queda en la memoria de esta pestaña.
const pagina = crearPagina({
  supabaseHost: host,
  claveSesion: `sb-${ref}-auth-token`,
  sesion: {
    access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
    user: { id: 'auth-e2e-duena', email: 'demo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  },
});
window.__demoPanel = { sinAtender: pagina.sinAtender };
void montar(pagina as never);
