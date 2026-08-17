'use client';

// Fase 8 "Booking Experience Engine" (CRO + Inteligencia): embudo del widget
// público, agregado server-side (embudo_widget/embudo_widget_por_dia, migr
// 20260817020000). Diseño completo: docs/cro-analytics-widget-diseno.md.
//
// Gateada con `puedeGestionarPortalHome` (PROPIETARIO/MANAGER) — los MISMOS
// roles que la RLS de `widget_eventos_lectura` ya exige, NO
// `puedeVerFinanzas` (PROPIETARIO/RECEPCION): el widget es un canal de
// marketing/captación, no de finanzas, y RECEPCION no debe verlo. `/configuracion`
// ya filtra por rol antes de llegar aquí — este gate en cliente es defensa en
// profundidad, no el único candado (mismo criterio que TabCuestionarioSalud).
import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { useRol } from '@/lib/permisos';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import { dbEmbudoWidget, dbEmbudoWidgetPorDia } from '@/lib/supabase-data';
import { inicioDeSemana } from '@/lib/utils';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { ChartLine } from '@/components/dashboard/custom-charts';
import type { TipoEventoWidget } from '@/lib/reservar/eventos';

type Period = 'week' | 'month' | 'quarter' | 'year';
const PERIOD_OPTS: { key: Period; label: string }[] = [
  { key: 'week', label: 'Esta semana' },
  { key: 'month', label: 'Este mes' },
  { key: 'quarter', label: 'Últimos 3 meses' },
  { key: 'year', label: 'Este año' },
];
function inicioDePeriodo(period: Period, now: Date): Date {
  switch (period) {
    case 'week': return inicioDeSemana(now);
    case 'month': return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter': return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case 'year': return new Date(now.getFullYear(), 0, 1);
  }
}
function isoFecha(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function n(porTipo: Map<string, number>, tipo: TipoEventoWidget): number {
  return porTipo.get(tipo) ?? 0;
}

export function TabCrecimientoWeb({ showToast: _showToast }: { showToast: (m: string) => void }) {
  const { studio } = useStudio();
  const rol = useRol();
  const puedeVer = puedeGestionarPortalHome(rol);
  const [period, setPeriod] = useState<Period>('month');
  const [porTipo, setPorTipo] = useState<Map<string, number> | null>(null);
  const [serieVisitas, setSerieVisitas] = useState<{ label: string; value: number }[]>([]);

  const desde = useMemo(() => isoFecha(inicioDePeriodo(period, new Date())), [period]);

  useEffect(() => {
    if (!puedeVer) return;
    Promise.all([dbEmbudoWidget(desde), dbEmbudoWidgetPorDia(desde)]).then(([totales, porDia]) => {
      setPorTipo(new Map(totales.map(t => [t.tipo, t.n])));
      const visitasPorDia = new Map(porDia.filter(r => r.tipo === 'widget_loaded').map(r => [r.dia, r.n]));
      const dias = Array.from(new Set(porDia.map(r => r.dia))).sort();
      setSerieVisitas(dias.map(d => ({ label: d.slice(5), value: visitasPorDia.get(d) ?? 0 })));
    });
  }, [desde, puedeVer]);

  if (!puedeVer) {
    return <p className="text-[13px] text-muted-foreground">No tienes acceso a esta pantalla.</p>;
  }

  if (!porTipo) {
    return <div className={`${cardCls} p-6`}><p className="text-[13px] text-muted-foreground">Cargando…</p></div>;
  }

  const visitas = n(porTipo, 'widget_loaded');
  const vistas = n(porTipo, 'class_list_viewed');
  const reservasIniciadas = n(porTipo, 'booking_started');
  const comprasIniciadas = n(porTipo, 'checkout_started');
  const completados = n(porTipo, 'booking_completed');
  const abandonosConocidos = n(porTipo, 'booking_abandoned');
  const abandonoBruto = Math.max(0, reservasIniciadas + comprasIniciadas - completados);
  const conversion = visitas > 0 ? (completados / visitas) * 100 : 0;
  const leadsIniciados = n(porTipo, 'lead_started');
  const leadsCompletados = n(porTipo, 'lead_completed');

  const filas: { label: string; valor: number; sub?: string }[] = [
    { label: 'Visitas', valor: visitas },
    { label: 'Vistas del listado de clases', valor: vistas },
    { label: 'Inicios de reserva de clase', valor: reservasIniciadas },
    { label: 'Inicios de compra de plan', valor: comprasIniciadas },
    { label: 'Reservas completadas', valor: completados },
    { label: 'Tasa de conversión', valor: Math.round(conversion * 10) / 10, sub: '%' },
    { label: 'Abandonos (motivo conocido)', valor: abandonosConocidos },
    { label: 'Abandonos totales (estimado)', valor: abandonoBruto },
    { label: 'Enlaces de acceso pedidos', valor: leadsIniciados },
    { label: 'Enlaces de acceso usados', valor: leadsCompletados },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-muted-foreground" />
          <p className="text-[13px] font-semibold text-foreground">Crecimiento web</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                period === opt.key ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`${cardCls} p-5`}>
        <p className="text-[12px] font-semibold text-muted-foreground mb-1">Visitas al widget</p>
        {serieVisitas.length > 0 ? <ChartLine points={serieVisitas} color="#0369A1" /> : (
          <p className="text-[12px] text-muted-foreground py-6 text-center">Sin visitas todavía en este período.</p>
        )}
      </div>

      <div className={`${cardCls} divide-y divide-border`}>
        {filas.map(f => (
          <div key={f.label} className="flex items-center justify-between px-5 py-3">
            <p className="text-[13px] text-foreground">{f.label}</p>
            <p className="text-[14px] font-semibold text-foreground">{f.valor.toLocaleString('es-ES')}{f.sub ?? ''}</p>
          </div>
        ))}
      </div>

      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
        &ldquo;Reservas completadas&rdquo; mide la reserva de una clase
        suelta — la compra de un plan se confirma por webhook de Stripe, no
        por el widget, y no está incluida aquí para no cruzar dos fuentes con
        semánticas distintas. &ldquo;Abandonos totales&rdquo; es una
        estimación (inicios menos completados); &ldquo;motivo
        conocido&rdquo; son los casos que el widget puede identificar con
        certeza (modal cerrado a medias, pago cancelado en Stripe).
      </p>

      {studio?.slug && (
        <p className="text-[11px] text-muted-foreground">
          Datos del widget público en <code className="text-[10.5px]">/reservar/{studio.slug}</code>.
        </p>
      )}
    </div>
  );
}
