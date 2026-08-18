// Pantalla de carga de todo el segmento /network (público y autoservicio) —
// hoy ninguna pantalla bajo /network tenía una propia (auditoría del sistema
// de diseño, 2026-08-18): un fetch lento a Supabase en las páginas públicas
// Server Component (`/network`, `/network/instructoras`) dejaba la pantalla
// en blanco hasta que resolvía. Usa los tokens públicos (network-v2): el
// autoservicio de la instructora ya logueada tiene su propio fondo algo
// distinto (`#EEEEE8` en app/network/layout.tsx), pero un spinner neutro
// encima de cualquiera de los dos no desentona.
import { NW_FONDO, NW_BORDE, NW_PRODUCTO } from '@/components/network-v2/tokens';

export default function Loading() {
  return (
    <div className="min-h-dvh flex items-center justify-center" style={{ background: NW_FONDO }}>
      <div
        className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: NW_BORDE, borderTopColor: NW_PRODUCTO }}
      />
    </div>
  );
}
