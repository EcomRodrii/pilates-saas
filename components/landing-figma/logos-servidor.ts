import 'server-only';
import { logosClientesLanding } from '@/lib/landing/logos-clientes-servidor';
import { LEGAL } from '@/lib/legal-info';
import { logoUrlValida, type LogoCliente } from '@/lib/landing/logos-clientes';

// Los logos REALES de estudios que ya trabajan con Tentare, para la preview. Misma fuente y mismas reglas que la franja de la
// home (`logosClientesLanding`): solo estudios con el consentimiento puesto por el equipo (`mostrar_logo_en_landing`), sin
// demos, con suscripción viva y con el logo en nuestro bucket. Ningún logo se escribe a mano en el repo.
//
// Solo en DESARROLLO, y solo si lo de arriba no devuelve nada (el `.env.local` de una sesión de trabajo no lleva la clave de
// servicio, así que no puede leer la base de datos): se leen los MISMOS logos que la home publica hoy, ya filtrados por
// consentimiento. En producción esta rama no existe.
let cacheDev: LogoCliente[] | null = null;

async function logosDeLaHomePublicada(): Promise<LogoCliente[]> {
  if (cacheDev) return cacheDev;
  try {
    const r = await fetch(`${LEGAL.url}/`, { headers: { 'user-agent': 'tentare-preview/1.0' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return [];
    const html = await r.text();
    const host = 'dwqvdycjcffqwfkzapvi.supabase.co';
    const vistos = new Set<string>();
    const logos: LogoCliente[] = [];
    for (const m of html.matchAll(/<li class="v7-logos-item"><img[^>]*?src="([^"]+)"[^>]*?alt="([^"]+)"/g)) {
      const logoUrl = m[1].replace(/&amp;/g, '&');
      if (vistos.has(logoUrl) || !logoUrlValida(logoUrl, host)) continue;
      vistos.add(logoUrl);
      logos.push({ nombre: m[2], logoUrl });
    }
    cacheDev = logos;
    return logos;
  } catch {
    return [];
  }
}

export async function logosParaLaMaqueta(): Promise<LogoCliente[]> {
  const reales = await logosClientesLanding();
  if (reales.length > 0 || process.env.NODE_ENV === 'production') return reales;
  return logosDeLaHomePublicada();
}
