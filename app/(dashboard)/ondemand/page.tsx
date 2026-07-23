import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CONGELADO — VOD / Oferta digital on-demand (feature-freeze PMF, 2026-07-23).
// La página real está intacta en ./page.frozen.tsx. Este stub de servidor evita
// que se pinte —ni por un instante— y manda al panel. Este freeze es INDEPENDIENTE
// de MARKETING_MODULE_ENABLED: VOD sigue congelado aunque se reactive marketing.
// El "Vídeos" del portal de socias se gobierna con PORTAL_VIDEOS_CONGELADO.
// Reactivar: renombrar page.frozen.tsx → page.tsx (borrando este stub) y quitar
// '/ondemand' de RUTAS_CONGELADAS. Detalle en docs/FEATURE-FREEZE-2026-07.md.
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  redirect('/dashboard');
}
