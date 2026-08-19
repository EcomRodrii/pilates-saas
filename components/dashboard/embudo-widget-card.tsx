'use client';

// Versión condensada, para la home, del embudo del widget público que ya vive
// en Configuración → API → Crecimiento web (components/configuracion/tab-crecimiento-web.tsx,
// fuente de verdad de las cifras y de los comentarios que explican cada una).
// La auditoría Momence vs Tentare la señalaba como el hallazgo más barato del
// roadmap con datos ya construidos ("solo falta query + UI") — la query y la
// pantalla ya existían (Fase 8 CRO), lo que faltaba de verdad era que la
// propietaria la viera sin ir a buscarla a Configuración.
//
// Mismo gate que la pantalla completa: `puedeGestionarPortalHome`
// (PROPIETARIO/MANAGER), NO `puedeVerFinanzas` — es un canal de
// marketing/captación, no de finanzas, y RECEPCION no debe verlo.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, ArrowUpRight } from 'lucide-react';
import { useRol } from '@/lib/permisos';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import { dbEmbudoWidget } from '@/lib/supabase-data';
import { Card, CardContent } from '@/components/ui/card';

function inicioDeMes(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function EmbudoWidgetCard() {
  const rol = useRol();
  const puedeVer = puedeGestionarPortalHome(rol);
  const [porTipo, setPorTipo] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    if (!puedeVer) return;
    void dbEmbudoWidget(inicioDeMes(new Date())).then(totales => {
      setPorTipo(new Map(totales.map(t => [t.tipo, t.n])));
    });
  }, [puedeVer]);

  if (!puedeVer || !porTipo) return null;

  const visitas = porTipo.get('widget_loaded') ?? 0;
  const completados = porTipo.get('booking_completed') ?? 0;
  const iniciados = (porTipo.get('booking_started') ?? 0) + (porTipo.get('checkout_started') ?? 0);
  const abandonoBruto = Math.max(0, iniciados - completados);
  const conversion = visitas > 0 ? Math.round((completados / visitas) * 1000) / 10 : 0;

  // Sin visitas este mes: no ocupar sitio con un embudo en cero, igual que
  // el resto de tarjetas de la home que se ocultan solas sin nada que contar.
  if (visitas === 0) return null;

  return (
    <Link href="/configuracion?tab=api" className="block rounded-2xl transition-colors hover:bg-muted">
      <Card className="pointer-events-none">
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10">
              <TrendingUp className="size-4 text-brand-secondary" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-foreground">Crecimiento web este mes</p>
              <p className="text-[11px] text-muted-foreground">
                {visitas.toLocaleString('es-ES')} visitas · {completados.toLocaleString('es-ES')} reservas completadas · {conversion}% conversión
                {abandonoBruto > 0 && ` · ${abandonoBruto.toLocaleString('es-ES')} abandonos`}
              </p>
            </div>
          </div>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
