import { AlertTriangle, AlertCircle, CircleDashed, type LucideIcon } from 'lucide-react';
import { EstadoAjuste, type TonoEstado } from '@/components/configuracion/shell/estado-ajuste';
import { SEVERIDAD_INFO, type NivelSeveridad } from '@/lib/decision/severidad';

// Auditoría de arquitectura de Centro de Control (22-sep-2026): los emojis
// 🔥/⚠️/ℹ️ no son accesibles (WCAG 1.4.1: nunca solo color, y un emoji sin
// texto no cuenta como icono con significado propio), no responden al tema
// ni al modo oscuro (los pinta la fuente de emoji del sistema), y en un panel
// de pago leen a plantilla. Se retiran a favor de la MISMA pastilla de estado
// que ya usa Configuración (EstadoAjuste) — ya medida a ≥4,5:1 en claro y
// oscuro (e2e/configuracion-contraste.spec.ts).
//
// SEVERIDAD_INFO (lib/decision/severidad.ts) no se toca: el Action Center del
// Dashboard (components/decision/action-center.tsx) sigue leyendo su campo
// `emoji` tal cual — este componente es solo una segunda forma de PINTAR el
// mismo nivel, para las dos pantallas de Centro de Control que lo usaban con
// emoji (VeredictoDelDia, RecommendationCard).
const TONO: Record<NivelSeveridad, TonoEstado> = {
  CRITICO: 'problema',
  IMPORTANTE: 'pendiente',
  RECOMENDACION: 'neutro',
};

const ICONO: Record<NivelSeveridad, LucideIcon> = {
  CRITICO: AlertTriangle,
  IMPORTANTE: AlertCircle,
  RECOMENDACION: CircleDashed,
};

export function SeveridadBadge({ nivel }: { nivel: NivelSeveridad }) {
  return (
    <EstadoAjuste tono={TONO[nivel]} icono={ICONO[nivel]}>
      {SEVERIDAD_INFO[nivel].label}
    </EstadoAjuste>
  );
}
