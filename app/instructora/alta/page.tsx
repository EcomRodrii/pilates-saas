import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CONGELADO — Alta pública de instructora freelance (Feature #9, 2026-08-13).
// La página real está intacta en ./page.frozen.tsx. Este stub de servidor evita
// que se pinte — ni por un instante — y manda a la landing. El enlace del pie de
// la landing que apuntaba aquí (components/landing/enlaces.ts) también se ha
// quitado en el mismo cambio.
//
// Se congela por decisión de producto del fundador: la experiencia actual (una
// página de alta aislada) se considera de baja calidad y va a sustituirse por
// "Tentare Network" (una red/marketplace de instructoras freelance), todavía en
// diseño — no por un fallo técnico. `studios.tipo_cuenta='FREELANCE'`, el motor
// de reserva reutilizado en `/i/[slug]`, y la cuenta ya creada antes de este
// cambio (studio `ana-garcia`) SIGUEN funcionando: congelar solo cierra la
// puerta de entrada a gente NUEVA, no rompe a quien ya se dio de alta.
//
// Reactivar (o sustituir por el flujo real de Tentare Network cuando esté
// diseñado): renombrar page.frozen.tsx → page.tsx (borrando este stub) y
// devolver el enlace del pie. No reabrir sin pedirlo expresamente.
// ─────────────────────────────────────────────────────────────────────────────
export default function Page() {
  redirect('/');
}
