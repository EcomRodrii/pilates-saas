import { NW_MUTED_2, NW_BORDE } from './tokens';

// Marca "BETA" junto al logo — Network es la pieza más nueva y menos
// probada del producto (sin un solo cobro real por Stripe todavía, ver
// .claude/tentare-os.md). Un texto sobrio, no un badge de marketing
// llamativo: el mismo criterio de sobriedad que el resto del sistema de
// diseño de esta página (nunca un porcentaje o insignia sin respaldo real).
export function InsigniaBeta({ alto = 26 }: { alto?: number }) {
  return (
    <span
      className="inline-flex items-center font-bold uppercase tracking-[.08em] leading-none rounded-full shrink-0"
      style={{
        color: NW_MUTED_2,
        border: `1px solid ${NW_BORDE}`,
        fontSize: Math.round(alto * 0.34),
        padding: `${Math.round(alto * 0.16)}px ${Math.round(alto * 0.28)}px`,
      }}
    >
      Beta
    </span>
  );
}
