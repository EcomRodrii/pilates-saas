'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Wrench, CreditCard, RotateCcw, CalendarClock, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useStudio } from '@/lib/studio-context';
import { construirBandeja, type CategoriaBandeja } from '@/lib/bandeja-logic';

// Bandeja diaria (F2 · B2.9): "Para hoy" — ≤5 decisiones concretas derivadas de
// las tablas del foso (recuperaciones, cobros, averías, plazas fijas). No es un
// panel nuevo: LEE lo que ya hay en el contexto. Si no hay nada que decidir, no
// se pinta (cero relleno). La lógica y el orden viven en lib/bandeja-logic.
const META: Record<CategoriaBandeja, { icon: LucideIcon; color: string }> = {
  AVERIA: { icon: Wrench, color: 'var(--destructive)' },
  COBRO: { icon: CreditCard, color: 'var(--warning)' },
  RECUPERACION: { icon: RotateCcw, color: 'var(--brand)' },
  PLAZA: { icon: CalendarClock, color: 'var(--muted-foreground)' },
};

export function BandejaHoy() {
  const {
    recuperaciones, recibos, plazasFijas, bloqueosMaquina,
    sesiones, reservas, socios, salas, socioExcepciones,
  } = useStudio();

  // Date.now() aquí (cliente) — la lógica pura lo recibe inyectado y es testeable.
  const items = useMemo(
    () => construirBandeja({
      ahoraMs: Date.now(),
      recuperaciones, recibos, plazasFijas, bloqueosMaquina,
      sesiones, reservas, socios, salas, excepciones: socioExcepciones,
    }),
    [recuperaciones, recibos, plazasFijas, bloqueosMaquina, sesiones, reservas, socios, salas, socioExcepciones],
  );

  if (items.length === 0) return null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="font-heading text-[15px] font-semibold text-foreground">Para hoy</h3>
          <p className="text-[12px] text-muted-foreground">
            {items.length === 1 ? 'Una cosa' : `${items.length} cosas`} que conviene mirar. Nada urgente si no puedes ahora.
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {items.map(item => {
            const { icon: Icon, color } = META[item.categoria];
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 py-2.5 -mx-1 px-1 rounded-lg transition-colors hover:bg-muted/60"
                >
                  <span
                    className="grid size-8 shrink-0 place-items-center rounded-full"
                    style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
                    aria-hidden
                  >
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-foreground">{item.titulo}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{item.detalle}</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground group-hover:text-foreground">
                    {item.cta}
                    <ChevronRight size={14} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
