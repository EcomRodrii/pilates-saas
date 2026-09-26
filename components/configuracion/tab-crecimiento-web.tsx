'use client';

// Fase 8 "Booking Experience Engine" (CRO + Inteligencia): embudo del widget
// público, agregado server-side (embudo_widget/embudo_widget_por_dia, migr
// 20260817013933). Diseño completo: docs/cro-analytics-widget-diseno.md.
//
// Vive dentro de Configuración → API (no como pestaña propia): es la misma
// superficie de negocio que los widgets embebibles, solo que mirando el
// resultado en vez del código a pegar.
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
import { dbEmbudoWidget, dbEmbudoWidgetPorDia, dbEmbudoWidgetPorOrigen } from '@/lib/supabase-data';
import { embudoPorWidget, type EmbudoWidget } from '@/lib/widgets/embudo';
import { inicioDeSemana } from '@/lib/utils';
import { cardCls } from '@/components/configuracion/estilos';
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
  // `null` = no se pudo leer (distinto de «ningún widget con visitas»).
  const [porWidget, setPorWidget] = useState<EmbudoWidget[] | null>([]);

  const desde = useMemo(() => isoFecha(inicioDePeriodo(period, new Date())), [period]);

  useEffect(() => {
    if (!puedeVer) return;
    Promise.all([dbEmbudoWidget(desde), dbEmbudoWidgetPorDia(desde), dbEmbudoWidgetPorOrigen(desde)]).then(([totales, porDia, porOrigen]) => {
      setPorTipo(new Map(totales.map(t => [t.tipo, t.n])));
      setPorWidget(porOrigen ? embudoPorWidget(porOrigen) : null);
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
          <TrendingUp size={16} className="text-muted-foreground" aria-hidden />
          <h4 className="text-[13px] font-semibold text-foreground">Visitas y reservas empezadas y terminadas</h4>
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

      <TablaPorWidget filas={porWidget} />

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
        <p className="text-xs text-muted-foreground">
          Datos del widget público en <code className="text-xs">/reservar/{studio.slug}</code>.
        </p>
      )}
    </div>
  );
}

// «Tentare Widgets»: el mismo embudo, partido por la etiqueta de cada widget
// (lib/widgets/embudo.ts). Solo cuenta lo que llegó con etiqueta: los códigos
// pegados antes de las etiquetas salen juntos en «Sin etiqueta», y se dice.
function TablaPorWidget({ filas }: { filas: EmbudoWidget[] | null }) {
  if (filas === null) {
    return (
      <div className={`${cardCls} p-5`}>
        <p className="text-[12.5px] text-muted-foreground">No hemos podido leer el desglose por widget. Vuelve a intentarlo en un momento.</p>
      </div>
    );
  }
  if (filas.length === 0) return null;
  const soloSinEtiqueta = filas.every(f => f.etiqueta === null);
  const cols: { clave: keyof EmbudoWidget; titulo: string }[] = [
    { clave: 'visitas', titulo: 'Visitas' },
    { clave: 'interacciones', titulo: 'Tocan una clase' },
    { clave: 'reservasIniciadas', titulo: 'Empiezan a reservar' },
    { clave: 'reservasCompletadas', titulo: 'Reservas hechas' },
    { clave: 'comprasIniciadas', titulo: 'Empiezan a comprar' },
  ];
  return (
    <section aria-labelledby="por-widget-titulo" className={`${cardCls} overflow-hidden`}>
      <div className="px-5 pt-4 pb-3">
        <h5 id="por-widget-titulo" className="text-[13px] font-semibold text-foreground">Por widget</h5>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {soloSinEtiqueta
            ? 'Tus visitas llegan por códigos sin etiqueta. Vuelve a copiar el código de cada widget y reemplázalo en tu web para verlas separadas aquí.'
            : 'Cada código copiado desde «Widgets» lleva la etiqueta de su widget. Los pegados antes salen juntos en «Sin etiqueta». En planes y bonos la compra se confirma con el pago, fuera de este embudo: por eso no llevan conversión.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px]">
          <thead>
            <tr className="border-y border-border bg-muted/40 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-5 py-2 font-semibold">Widget</th>
              {cols.map(c => <th key={c.clave} scope="col" className="px-3 py-2 text-right font-semibold">{c.titulo}</th>)}
              <th scope="col" className="px-5 py-2 text-right font-semibold">Conversión</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filas.map(f => (
              <tr key={f.etiqueta ?? '—'}>
                <th scope="row" className="px-5 py-2.5 text-left font-medium text-foreground">
                  {f.nombre}
                  {f.etiqueta && f.widgetId && <span className="ml-1.5 font-mono text-[11px] font-normal text-muted-foreground">{f.etiqueta}</span>}
                </th>
                {cols.map(c => (
                  <td key={c.clave} className="px-3 py-2.5 text-right tabular-nums text-foreground">{(f[c.clave] as number).toLocaleString('es-ES')}</td>
                ))}
                <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-foreground">
                  {f.conversion === null ? '—' : `${f.conversion.toLocaleString('es-ES')} %`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
