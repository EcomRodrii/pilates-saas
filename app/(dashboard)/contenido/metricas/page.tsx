'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import {
  PageHeader, DeltaPill, PlataformasStack, fmtNum, fmtFecha,
} from '@/components/contenido/ui';
import { LineChart, BarList } from '@/components/contenido/charts';
import {
  calcularResumen, serieEvolucion, comparativaRedes, type RangoDias,
} from '@/lib/contenido/analytics';
import {
  Users, Eye, Heart, Play, Percent, Trophy, ArrowUpRight,
} from 'lucide-react';

const RANGOS: { v: RangoDias; label: string }[] = [
  { v: 7, label: '7 días' },
  { v: 30, label: '30 días' },
  { v: 90, label: '90 días' },
];

export default function MetricasPage() {
  const { publicaciones, ready } = useContenido();
  const [rango, setRango] = useState<RangoDias>(30);

  const { resumen, serie, comparativa } = useMemo(() => {
    const now = new Date();
    return {
      resumen: calcularResumen(publicaciones, rango, now),
      serie: serieEvolucion(publicaciones, rango, now),
      comparativa: comparativaRedes(publicaciones, rango, now),
    };
  }, [publicaciones, rango]);

  if (!ready) return <div className="h-96 bg-card border border-border rounded-3xl animate-pulse" />;

  const labels = serie.map((p) => fmtFecha(p.fecha));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Métricas de redes"
        subtitle="Evolución y rendimiento de tus cuentas"
        actions={
          <div className="flex items-center rounded-full border border-border p-0.5">
            {RANGOS.map((r) => (
              <button key={r.v} onClick={() => setRango(r.v)} className={cn('rounded-full px-3 h-8 text-sm font-semibold transition-colors', rango === r.v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{r.label}</button>
            ))}
          </div>
        }
      />

      {/* Tarjetas grandes */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
        <MetricCard label="Seguidores totales" value={fmtNum(resumen.seguidores.valor)} delta={resumen.seguidores.cambioPct} icon={Users} accent="#7c3aed" delay={0} />
        <MetricCard label="Alcance" value={fmtNum(resumen.alcance.valor)} delta={resumen.alcance.cambioPct} icon={Eye} accent="#0ea5e9" delay={1} />
        <MetricCard label="Interacciones" value={fmtNum(resumen.interacciones.valor)} delta={resumen.interacciones.cambioPct} icon={Heart} accent="#ec4899" delay={2} />
        <MetricCard label="Visualizaciones" value={fmtNum(resumen.visualizaciones.valor)} delta={resumen.visualizaciones.cambioPct} icon={Play} accent="#f59e0b" delay={3} />
        <MetricCard label="Engagement" value={`${resumen.engagement.valor.toFixed(1)}%`} delta={resumen.engagement.cambioPct} icon={Percent} accent="#10b981" delay={4} />
        <MejorPublicacionCard resumen={resumen} delay={5} />
      </div>

      {/* Gráfico de crecimiento (seguidores) */}
      <section className="bg-card border border-border rounded-3xl p-5 contenido-anim">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-bold text-foreground">Crecimiento de seguidores</h3>
            <p className="text-xs text-muted-foreground">Últimos {rango} días</p>
          </div>
          <DeltaPill pct={resumen.seguidores.cambioPct} />
        </div>
        <div className="text-muted-foreground">
          <LineChart series={[{ nombre: 'Seguidores', color: '#7c3aed', valores: serie.map((p) => p.seguidores) }]} labels={labels} height={220} />
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolución 30 días (alcance + interacciones) */}
        <section className="bg-card border border-border rounded-3xl p-5 contenido-anim">
          <h3 className="text-[15px] font-bold text-foreground mb-1">Evolución de la actividad</h3>
          <p className="text-xs text-muted-foreground mb-4">Alcance e interacciones por día</p>
          <div className="text-muted-foreground">
            <LineChart
              series={[
                { nombre: 'Alcance', color: '#0ea5e9', valores: serie.map((p) => p.alcance) },
                { nombre: 'Interacciones', color: '#ec4899', valores: serie.map((p) => p.interacciones) },
              ]}
              labels={labels} height={200}
            />
          </div>
          <div className="flex items-center gap-4 mt-3">
            <Leyenda color="#0ea5e9" label="Alcance" />
            <Leyenda color="#ec4899" label="Interacciones" />
          </div>
        </section>

        {/* Comparativa entre redes */}
        <section className="bg-card border border-border rounded-3xl p-5 contenido-anim">
          <h3 className="text-[15px] font-bold text-foreground mb-1">Comparativa entre redes</h3>
          <p className="text-xs text-muted-foreground mb-4">Seguidores por plataforma</p>
          <BarList items={comparativa.map((c) => ({ label: c.label, value: c.seguidores, color: c.color, sub: `${c.engagement.toFixed(1)}%` }))} />
          <p className="text-[11px] text-muted-foreground mt-3 text-right">valor · engagement</p>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, delta, icon: Icon, accent, delay }: {
  label: string; value: string; delta: number; icon: React.ElementType; accent: string; delay: number;
}) {
  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col gap-3 contenido-anim" style={{ animationDelay: `${delay * 60}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${accent}1a`, color: accent }}>
          <Icon className="w-4 h-4" />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 mt-auto">
        <span className="text-2xl lg:text-3xl font-bold text-foreground tabular-nums leading-none">{value}</span>
        <DeltaPill pct={delta} />
      </div>
    </div>
  );
}

function MejorPublicacionCard({ resumen, delay }: { resumen: ReturnType<typeof calcularResumen>; delay: number }) {
  const p = resumen.mejorPublicacion;
  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col gap-2 contenido-anim col-span-2 lg:col-span-1" style={{ animationDelay: `${delay * 60}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-muted-foreground">Mejor publicación</span>
        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f59e0b1a', color: '#f59e0b' }}>
          <Trophy className="w-4 h-4" />
        </span>
      </div>
      {p ? (
        <>
          <p className="text-sm font-bold text-foreground leading-snug line-clamp-2">{p.titulo}</p>
          <div className="flex items-center gap-2 mt-auto">
            <PlataformasStack plataformas={p.plataformas} size={18} />
            <span className="text-[12px] text-muted-foreground tabular-nums">{fmtNum(p.metricas!.interacciones)} interacciones</span>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground mt-auto">Sin datos en este periodo.</p>
      )}
    </div>
  );
}

function Leyenda({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
      <span className="w-3 h-1.5 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
