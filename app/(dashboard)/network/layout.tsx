import { redirect } from 'next/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// CONGELADO — Tentare Network en el panel (decisión del fundador, 2-oct-2026).
// Un layout y no un stub por página: cubre de una vez Buscar, Vacantes,
// Favoritas, Mensajes, Comparar y la ficha `/network/[perfilId]`, que no tiene
// prefijo propio en RUTAS_CONGELADAS. El layout real está intacto en
// ./layout.frozen.tsx y las páginas siguen ahí.
// ⚠️ Solo el PANEL: la web pública de Network (app/network) y las cuentas de
// las instructoras siguen vivas, sin enlace desde los menús.
// Reactivar: renombrar layout.frozen.tsx → layout.tsx (borrando este stub) y
// quitar sus prefijos de RUTAS_CONGELADAS (lib/frozen-features.ts).
// ─────────────────────────────────────────────────────────────────────────────
export default function NetworkCongelado() {
  redirect('/equipo');
}
