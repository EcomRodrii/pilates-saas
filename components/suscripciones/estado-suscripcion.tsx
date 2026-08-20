'use client';

// "Cuánto le queda" — la lectura de una suscripción/bono en dos líneas, la
// misma en cualquier sitio del panel que la use (tabla de Clientas, ficha de
// la clienta). El cálculo puro vive en `lib/suscripcion-estado.ts`; esto es
// solo la traducción a color+icono, con los mismos tokens que ya usa el badge
// "Bono expirado"/"Sesiones restantes" de `app/(dashboard)/clientas/`
// (`color-mix(in srgb, var(--destructive/--warning/--success) …, var(--card))`).
//
// Para el portal de la socia NO se reutiliza este componente: esa pantalla no
// usa Tailwind/shadcn sino tokens de tema (`t.ink`/`t.muted`, `lib/portal-design.ts`)
// y su propio lenguaje visual — pero sí reutiliza el mismo cálculo puro
// (`calcularEstadoSuscripcion`/`textoCaducidad`) para no tener dos cuentas de
// días que puedan divergir.

import { Calendar, RefreshCw, PauseCircle, XCircle } from 'lucide-react';
import { calcularEstadoSuscripcion, textoCaducidad } from '@/lib/suscripcion-estado';
import type { Suscripcion, PlanTarifa } from '@/lib/types';
import { cn } from '@/lib/utils';

type Tono = 'success' | 'warning' | 'destructive' | 'muted';

const TONO_COLOR: Record<Tono, string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  destructive: 'var(--destructive)',
  muted: 'var(--muted-foreground)',
};

export function EstadoSuscripcion({
  suscripcion,
  plan,
  hoyISO,
  size = 'sm',
  className,
}: {
  suscripcion: Suscripcion | null | undefined;
  plan: PlanTarifa | null | undefined;
  /** Solo para tests/Storybook — en producción usa siempre "hoy" real. */
  hoyISO?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const estado = calcularEstadoSuscripcion(suscripcion, plan, hoyISO);
  const tituloCls = size === 'md' ? 'text-sm' : 'text-[12px]';
  const lineaCls = size === 'md' ? 'text-xs' : 'text-[11px]';

  if (estado.kind === 'sin_plan') return null;

  if (estado.kind === 'pausada') {
    return (
      <div className={cn('inline-flex items-center gap-1 font-semibold', lineaCls, className)} style={{ color: TONO_COLOR.warning }}>
        <PauseCircle size={12} />
        Pausada
      </div>
    );
  }
  if (estado.kind === 'cancelada') {
    return (
      <div className={cn('inline-flex items-center gap-1 font-semibold', lineaCls, className)} style={{ color: TONO_COLOR.muted }}>
        <XCircle size={12} />
        Cancelada
      </div>
    );
  }
  if (estado.kind === 'expirada') {
    return (
      <div className={cn('inline-flex items-center gap-1 font-semibold', lineaCls, className)} style={{ color: TONO_COLOR.destructive }}>
        <XCircle size={12} />
        Bono expirado
      </div>
    );
  }

  const texto = textoCaducidad(estado);
  const tono: Tono =
    estado.kind === 'bono'
      ? estado.caducado ? 'destructive' : estado.urgente ? 'warning' : 'muted'
      : estado.urgente ? 'warning' : 'muted';
  const Icon = estado.kind === 'bono' ? Calendar : RefreshCw;

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      {estado.kind === 'bono' ? (
        <span className={cn('font-bold text-foreground', tituloCls)}>
          {estado.restantes} clase{estado.restantes === 1 ? '' : 's'} restante{estado.restantes === 1 ? '' : 's'}
        </span>
      ) : (
        <span className={cn('font-bold', tituloCls)} style={{ color: TONO_COLOR.success }}>Activo</span>
      )}
      {texto && (
        <span className={cn('inline-flex items-center gap-1 font-medium', lineaCls)} style={{ color: TONO_COLOR[tono] }}>
          <Icon size={11} />
          {texto}
        </span>
      )}
    </div>
  );
}
