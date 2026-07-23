import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CONGELADO — POS / Caja (feature-freeze PMF, 2026-07-23).
// La página real está intacta en ./page.frozen.tsx. Este stub de servidor evita
// que se pinte —ni por un instante— y manda al panel. El menú, el buscador ⌘K y
// los accesos rápidos ya no la enlazan (ver lib/frozen-features.ts).
// Reactivar: renombrar page.frozen.tsx → page.tsx (borrando este stub) y quitar
// '/pos' de RUTAS_CONGELADAS. Detalle en docs/FEATURE-FREEZE-2026-07.md.
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  redirect('/dashboard');
}
