import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CONGELADO — Chat de equipo (feature-freeze PMF · F0/D2, 2026-07-24).
// La página real está intacta en ./page.frozen.tsx. Este stub de servidor evita
// que se pinte —ni por un instante— y manda al panel. El menú y el buscador ⌘K ya
// no la enlazan (filtro `esRutaCongelada`). Se congela porque tenía un error RLS
// vivo al crear canal (D2, `canales_equipo` 42501) y no es la cuña del producto —
// el equipo puede usar WhatsApp. Reactivar: renombrar page.frozen.tsx → page.tsx
// (borrando este stub) y quitar '/chat' de RUTAS_CONGELADAS. Detalle en
// docs/FEATURE-FREEZE-2026-07.md.
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  redirect('/dashboard');
}
