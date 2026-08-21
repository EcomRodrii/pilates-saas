'use client';

// El armazón del portal para las pantallas de PREVISUALIZACIÓN.
//
// ⚠️ Existe porque la previsualización no pintaba la barra de abajo, y la
// barra es lo que más distingue un tema de otro: la cápsula que flota de
// Bloom, la barra oscura de Noir, las cuatro etiquetas de Oliva. Comprobado en
// el navegador sobre la biblioteca de temas en producción: `nav[aria-label=
// "Secciones"]` no existía en ninguna de las cinco miniaturas. La propietaria
// elegía tema sin ver esa mitad, y luego el portal publicado no se parecía.
//
// Misma estructura que `portal-shell.tsx` —columna con el contenido
// desplazándose y la barra al final— y el MISMO componente de barra, con los
// mismos ejes. No es una réplica del aspecto: es la pieza de verdad, que es lo
// único que garantiza que la previsualización no pueda mentir.
//
// Lo que NO trae, a propósito: puerta de sesión, transición entre pantallas ni
// aviso de notificaciones. Aquí no hay socia que autenticar ni a quien avisar.

import { usePathname } from 'next/navigation';
import { useCore } from '@/lib/core-context';
import { altura } from '@/lib/portal-design';
import { NAV_DISPONIBLES, navItemsVisibles } from '@/lib/portal-nav';
import { PortalNav } from './portal-nav';
import { esTemaPortal } from '@/themes/registro';

export function PortalPreviewMarco({ slug, children }: { slug: string; children: React.ReactNode }) {
  // Auditoría integral 2026-08-21 (rendimiento, P0-2): useCore(), no useStudio() — solo campos de tema/nav ya publicados.
  const { navPortal, barraClasica, variantes, themeIdPublicado } = useCore();
  const pathname = usePathname() ?? '';
  const NAV = navItemsVisibles(navPortal, NAV_DISPONIBLES);
  // La bienvenida es ANTERIOR al acceso: ahí todavía no hay menú, igual que en
  // el portal de verdad. Pintarlo sería justo la clase de mentira que esta
  // previsualización existe para evitar.
  const esBienvenida = pathname.endsWith('/bienvenida');

  // La pestaña marcada. En la miniatura de la biblioteca siempre es la
  // primera (solo se previsualiza el Inicio); en el editor a pantalla completa
  // sigue a la ruta, igual que en el portal.
  //
  // ⚠️ Inicio es un caso aparte: vive en la RAÍZ de `/portal-preview/[slug]`
  // (no en `/portal-preview/[slug]/home` — esa sub-ruta no existe, ver el
  // comentario de `usePortalHref` en `portal-preview-bridge.ts`), así que
  // `pathname.startsWith(".../home")` nunca casa ahí y NINGUNA pestaña se
  // marcaba activa al volver a Inicio desde otra pantalla — medido: 100 %
  // (`activo=-1`, `aria-current` ausente en las cuatro). Se compara con
  // IGUALDAD exacta para la raíz (no `startsWith`, que también "matchearía"
  // por accidente cualquier ruta que EMPEZARA por el slug del estudio).
  const rutaBase = `/portal-preview/${slug}`;
  const activo = pathname === rutaBase
    ? NAV.findIndex(({ seg }) => seg === 'home')
    : NAV.findIndex(({ seg }) => pathname.startsWith(`${rutaBase}/${seg}`));

  if (esBienvenida) {
    return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;
  }

  // ⚠️ Un tema del kit YA monta su propia barra —la píldora que flota de
  // Bloom, la oscura de Noir, las cinco pestañas de Tentada— con sus propios
  // ejes de forma. Envolverlo con `PortalNav`, la barra del portal de siempre,
  // pintaba las DOS apiladas. Medido en `/portal-preview/tentare`: dos `nav`
  // en el DOM, uno encima de otro, en las seis pantallas. Mismo criterio que
  // `useVistaPreviaKit`: aquí se enseña el TEMA, no se decide el despliegue.
  if (esTemaPortal(themeIdPublicado)) {
    return <div style={{ height: '100dvh', overflow: 'hidden' }}>{children}</div>;
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100dvh', position: 'relative' }}>
      <main className="flex-1 overflow-y-auto relative">
        {children}
        {/* Mismo criterio que el portal: el hueco SOLO cuando la barra flota
            encima. La clásica va en el flujo y ya ocupa su alto. */}
        {!barraClasica && (
          <div style={{ height: `calc(var(--portal-tabbar-height, ${altura.tabbar}px) + 38px + env(safe-area-inset-bottom))` }} />
        )}
      </main>
      <PortalNav
        items={NAV}
        activeIndex={activo}
        slug={slug}
        flotante={!barraClasica}
        etiquetas={variantes.barra}
      />
    </div>
  );
}
