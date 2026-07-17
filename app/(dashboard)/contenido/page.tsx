'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import {
  PageHeader, StatCard, PlataformasStack, EstadoBadge, TipoBadge,
  DeltaPill, fmtNum, fmtFechaHora, fmtHora,
} from '@/components/contenido/ui';
import { calcularResumen } from '@/lib/contenido/analytics';
import type { Publicacion } from '@/lib/contenido/types';
import {
  CalendarClock, CheckCircle2, FileEdit, CalendarDays, Activity,
  ScrollText, GalleryHorizontalEnd, Sparkles, Plus, ArrowUpRight,
  BarChart3, Lightbulb, Heart, Eye, Bookmark, MessageCircle,
} from 'lucide-react';

// ── Helpers de fecha ─────────────────────────────────────────────────────────
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lunes = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

const ACCESOS = [
  { href: '/contenido/guiones', label: 'Nuevo guion IA', icon: ScrollText },
  { href: '/contenido/carruseles', label: 'Nuevo carrusel IA', icon: GalleryHorizontalEnd },
  { href: '/contenido/calendario', label: 'Programar publicación', icon: CalendarDays },
  { href: '/contenido/ideas', label: 'Añadir idea', icon: Lightbulb },
  { href: '/contenido/metricas', label: 'Ver métricas', icon: BarChart3 },
  { href: '/contenido/biblioteca', label: 'Biblioteca', icon: Sparkles },
];

export default function PanelContenidoPage() {
  const { publicaciones, actividad, guiones, carruseles, ready } = useContenido();

  const data = useMemo(() => {
    const now = new Date();
    const inicioSemana = startOfWeek(now);
    const finSemana = new Date(inicioSemana.getTime() + 7 * 86_400_000);

    const programadas = publicaciones.filter((p) => p.estado === 'programada');
    const pendientes = publicaciones.filter((p) => p.estado === 'borrador');
    const publicadasSemana = publicaciones.filter((p) =>
      p.estado === 'publicada' && p.fechaPublicada &&
      new Date(p.fechaPublicada) >= inicioSemana && new Date(p.fechaPublicada) < finSemana);

    const proximas = [...programadas]
      .filter((p) => new Date(p.fechaProgramada) >= new Date(now.getTime() - 86_400_000))
      .sort((a, b) => +new Date(a.fechaProgramada) - +new Date(b.fechaProgramada))
      .slice(0, 5);

    const ultimas = publicaciones
      .filter((p) => p.estado === 'publicada' && p.metricas)
      .sort((a, b) => +new Date(b.fechaPublicada!) - +new Date(a.fechaPublicada!))
      .slice(0, 5);

    const resumen = calcularResumen(publicaciones, 7, now);

    return { programadas, pendientes, publicadasSemana, proximas, ultimas, resumen };
  }, [publicaciones]);

  if (!ready) return <DashboardSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Panel de contenido"
        subtitle="Resumen de tu actividad en redes sociales"
        actions={
          <Link
            href="/contenido/calendario"
            className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Nueva publicación
          </Link>
        }
      />

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard label="Programadas" value={fmtNum(data.programadas.length)} icon={CalendarClock} href="/contenido/calendario" />
        <StatCard label="Publicadas esta semana" value={fmtNum(data.publicadasSemana.length)} icon={CheckCircle2} href="/contenido/biblioteca" />
        <StatCard label="Contenido pendiente" value={fmtNum(data.pendientes.length)} icon={FileEdit} href="/contenido/biblioteca" />
        <StatCard label="Interacciones (7d)" value={fmtNum(data.resumen.interacciones.valor)} delta={data.resumen.interacciones.cambioPct} icon={Activity} href="/contenido/metricas" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Próximas publicaciones */}
        <section className="lg:col-span-2 bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center"><CalendarClock className="w-4 h-4" /></span>
              <h3 className="text-[15px] font-bold text-foreground">Próximas publicaciones</h3>
            </div>
            <Link href="/contenido/calendario" className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Calendario <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.proximas.length === 0 ? (
            <EmptyRow texto="No hay publicaciones programadas." />
          ) : (
            <ul className="divide-y divide-border">
              {data.proximas.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-col items-center justify-center w-11 shrink-0">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                      {new Date(p.fechaProgramada).toLocaleDateString('es-ES', { weekday: 'short' })}
                    </span>
                    <span className="text-lg font-bold text-foreground leading-none">
                      {new Date(p.fechaProgramada).getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{p.titulo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <TipoBadge tipo={p.tipo} />
                      <span className="text-[11px] text-muted-foreground">{fmtHora(p.fechaProgramada)}</span>
                    </div>
                  </div>
                  <PlataformasStack plataformas={p.plataformas} size={20} />
                  <EstadoBadge estado={p.estado} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Accesos rápidos */}
        <section className="bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center"><Sparkles className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-foreground">Accesos rápidos</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACCESOS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex flex-col gap-2 rounded-2xl border border-border p-3 hover:border-muted-foreground/60 hover:bg-muted/40 transition-colors"
              >
                <Icon className="w-5 h-5 text-foreground" />
                <span className="text-[12px] font-semibold text-foreground leading-tight">{label}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Rendimiento últimas publicaciones */}
        <section className="lg:col-span-2 bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center"><BarChart3 className="w-4 h-4" /></span>
              <h3 className="text-[15px] font-bold text-foreground">Rendimiento de las últimas publicaciones</h3>
            </div>
            <Link href="/contenido/metricas" className="text-xs font-semibold text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              Métricas <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {data.ultimas.length === 0 ? (
            <EmptyRow texto="Aún no hay publicaciones con métricas." />
          ) : (
            <div className="space-y-1">
              {data.ultimas.map((p) => <FilaRendimiento key={p.id} p={p} />)}
            </div>
          )}
        </section>

        {/* Actividad reciente */}
        <section className="bg-card border border-border rounded-3xl p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-full border border-border flex items-center justify-center"><Activity className="w-4 h-4" /></span>
            <h3 className="text-[15px] font-bold text-foreground">Actividad reciente</h3>
          </div>
          {actividad.length === 0 ? (
            <EmptyRow texto="Sin actividad reciente." />
          ) : (
            <ul className="space-y-3">
              {actividad.slice(0, 7).map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 mt-1.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground leading-snug">{a.descripcion}</p>
                    <p className="text-[11px] text-muted-foreground">{fmtFechaHora(a.ts)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{guiones.length} guiones · {carruseles.length} carruseles</span>
            <Link href="/contenido/biblioteca" className="font-semibold hover:text-foreground">Ver todo</Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function FilaRendimiento({ p }: { p: Publicacion }) {
  const m = p.metricas!;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0">
      <PlataformasStack plataformas={p.plataformas} size={22} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{p.titulo}</p>
        <p className="text-[11px] text-muted-foreground">{new Date(p.fechaPublicada!).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
      </div>
      <div className="hidden sm:flex items-center gap-3 text-[12px] text-muted-foreground tabular-nums">
        <Metricilla icon={Eye} v={m.visualizaciones} />
        <Metricilla icon={Heart} v={m.likes} />
        <Metricilla icon={MessageCircle} v={m.comentarios} />
        <Metricilla icon={Bookmark} v={m.guardados} />
      </div>
      <div className="w-16 text-right shrink-0">
        <p className="text-sm font-bold text-foreground tabular-nums">{fmtNum(m.alcance)}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">alcance</p>
      </div>
    </div>
  );
}

function Metricilla({ icon: Icon, v }: { icon: React.ElementType; v: number }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icon className="w-3.5 h-3.5" /> {fmtNum(v)}
    </span>
  );
}

function EmptyRow({ texto }: { texto: string }) {
  return <p className="text-sm text-muted-foreground py-6 text-center">{texto}</p>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-8 w-52 bg-muted rounded-lg" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 bg-card border border-border rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-64 bg-card border border-border rounded-3xl" />
        <div className="h-64 bg-card border border-border rounded-3xl" />
      </div>
    </div>
  );
}
