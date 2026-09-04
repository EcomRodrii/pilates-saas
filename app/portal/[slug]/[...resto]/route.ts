import { redirect, permanentRedirect } from 'next/navigation';
import type { NextRequest } from 'next/server';
import { destinoPortalViejo } from '@/lib/student/deep-links';

// Compatibilidad con las URLs del portal ANTERIOR.
//
// Sustituye al stub que redirigía todo a `/reservar/<slug>` perdiendo la ruta y
// la query. Ahora que la app de la alumna vuelve a vivir en `/portal/<slug>`,
// la mayoría de aquellos enlaces tienen un destino de verdad.
//
// Por qué sigue haciendo falta: hay 108 referencias vivas a `/portal/…` en 71
// ficheros —retornos de Stripe, enlaces de recibos por email, deep links de
// avisos push— y algunas están IMPRESAS: la bio de Instagram del estudio y el
// QR de la puerta (components/configuracion/tab-estudio-enlaces.tsx:115). Esas
// no se arreglan con un despliegue.
//
// Next resuelve primero las rutas concretas (`/bonos`, `/perfil`…) y solo cae
// aquí lo que no existe, así que este fichero únicamente ve nombres viejos.
//
// El mapa y la regla de qué destinos admiten cola viven en
// `lib/student/deep-links.ts` (`destinoPortalViejo`): un `route.ts` no puede
// exportar nada que no sea un verbo HTTP, así que aquí no habría manera de
// probar la traducción — y su fallo era justo un bucle infinito de 308.

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; resto: string[] }> }) {
  const { slug, resto } = await params;
  const base = `/portal/${encodeURIComponent(slug)}`;

  // La cola solo se conserva cuando el destino la admite —`/clases/<sesionId>`
  // → `/reservar/<sesionId>`, porque ahí es la mitad del valor del enlace: un
  // aviso push de «tu clase de mañana» que aterrice en el horario genérico ha
  // perdido lo que traía—. Arrastrarla siempre reentraba por este mismo
  // handler y crecía en cada salto (ver ADMITEN_COLA en deep-links.ts).
  const destino = destinoPortalViejo(resto);
  if (destino === null) {
    // Ruta vieja que no reconocemos: al inicio del estudio, nunca a un 404.
    redirect(base);
  }

  // La query también se conserva: los retornos de Stripe la usan (`?compra=ok`,
  // `?tarjeta=ok`), y el stub anterior la tiraba — ese era el bug que dejaba a
  // una clienta recién pagada en una pantalla que no le decía nada.
  const query = req.nextUrl.search;

  // 308 y no 307: son cambios de dirección definitivos, y así los buscadores y
  // los clientes de correo dejan de pedir la vieja.
  permanentRedirect(`${base}${destino}${query}`);
}
