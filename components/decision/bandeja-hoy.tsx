'use client';

import { useEffect, useMemo, useState } from 'react';
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

  // La hora entra por estado, no con un `Date.now()` dentro del memo. Estaba
  // fuera de las dependencias, así que el resultado se quedaba congelado hasta
  // que cambiara algún dato: una pestaña abierta desde ayer seguía enseñando la
  // bandeja de AYER, y esta tarjeta se llama "Para hoy". El intervalo de un
  // minuto es lo que la hace pasar de día sola (mismo patrón que dashboard).
  // La lógica pura sigue recibiéndolo inyectado, que es lo que la hace testeable.
  const [ahoraMs, setAhoraMs] = useState(0);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Reloj: sincroniza con el paso del TIEMPO, un sistema externo. Es el caso de uso que la regla considera legítimo.
    setAhoraMs(Date.now());
    const t = setInterval(() => setAhoraMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(
    () => construirBandeja({
      ahoraMs,
      recuperaciones, recibos, plazasFijas, bloqueosMaquina,
      sesiones, reservas, socios, salas, excepciones: socioExcepciones,
    }),
    [ahoraMs, recuperaciones, recibos, plazasFijas, bloqueosMaquina, sesiones, reservas, socios, salas, socioExcepciones],
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
