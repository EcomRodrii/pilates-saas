import { NextResponse, type NextRequest } from 'next/server';

// 51ª pasada de auditoría (2026-09-10), hallazgo #1: ninguna ruta del repo
// mandaba X-Frame-Options ni Content-Security-Policy: frame-ancestors —
// next.config.ts solo define Cache-Control para /widget.js, y no existía
// ningún proxy.ts (el fichero se llamaba `middleware.ts` hasta Next 15; este
// repo va en Next 16, donde el nombre es `proxy.ts` — ver AGENTS.md, «esta
// versión tiene cambios importantes»). El propio modelo de negocio del Growth
// Widget exige
// que /reservar/:slug SÍ sea embebible en la web del estudio (Modo A, ver
// components/configuracion/tab-api.tsx:633 y lib/reservar/snippet-embed.ts),
// así que la protección no puede ser un `headers()` global sin excepción:
// tiene que distinguir esa ruta del resto del panel.
//
// Sin esta cabecera, cualquier pantalla de staff (Configuración → API/
// Widgets, donde vive el propio Builder; aprobar una penalización;
// desconectar Stripe...) se puede embeber en un iframe invisible ajeno y
// clickjackear a una propietaria con sesión ya abierta — la sesión (cookie o
// JWT en localStorage) viaja con el iframe igual, con independencia del
// framing.
//
// app/tema-publicado/[slug]/[[...ruta]]/route.ts y
// app/api/theme/importado/[id]/[[...ruta]]/route.ts quedan fuera a
// propósito: ya ponen su propia Content-Security-Policy: sandbox +
// frame-ancestors 'self' por respuesta (lib/theme-import/cabeceras.ts,
// 39ª pasada de auditoría) — duplicarla aquí solo arriesga pisarla.
//
// public/widget.js no necesita exclusión: es un script, no un documento, y
// la cabecera de framing no se aplica a peticiones que no son de navegación
// de nivel superior — pero además el matcher de abajo ya lo deja fuera al
// excluir explícitamente los estáticos.
export function proxy(_req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Content-Security-Policy', "frame-ancestors 'none'");
  return res;
}

export const config = {
  matcher: [
    // Todo salvo: /reservar (Modo A embebible a propósito), los assets de
    // Next, y las rutas de tema-publicado/theme-importado que ya ponen su
    // propia cabecera por respuesta. El resto de estáticos (iconos,
    // manifest) no necesitan exclusión — la cabecera de framing es un
    // no-op ahí, pero tampoco hace falta que el proxy los procese.
    '/((?!reservar|_next/static|_next/image|tema-publicado|api/theme/importado).*)',
  ],
};
