'use client';

import { useMemo, useState } from 'react';
import {
  DndContext, useDraggable, useDroppable, PointerSensor,
  useSensor, useSensors, DragOverlay, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { useContenido } from '@/lib/contenido/store';
import { PageHeader, PlataformasStack, fmtHora } from '@/components/contenido/ui';
import { PublicacionDialog } from '@/components/contenido/publicacion-dialog';
import {
  PLATAFORMAS, PLATAFORMA_META, ESTADO_META,
  type Publicacion, type Plataforma,
} from '@/lib/contenido/types';
import {
  ChevronLeft, ChevronRight, Plus, Filter,
} from 'lucide-react';

type Vista = 'mes' | 'semana' | 'dia';
const DIA_MS = 86_400_000;
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date): Date {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function sameDay(a: Date, b: Date): boolean { return dateKey(a) === dateKey(b); }

export default function CalendarioContenidoPage() {
  const { publicaciones, actualizarPublicacion } = useContenido();
  const [vista, setVista] = useState<Vista>('mes');
  const [cursor, setCursor] = useState(() => new Date());
  const [filtro, setFiltro] = useState<Plataforma | 'todas'>('todas');
  const [dialog, setDialog] = useState<{ pub?: Publicacion | null; fecha?: Date } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const hoy = new Date();

  const pubsFiltradas = useMemo(
    () => publicaciones.filter((p) => filtro === 'todas' || p.plataformas.includes(filtro)),
    [publicaciones, filtro],
  );

  const porDia = useMemo(() => {
    const map = new Map<string, Publicacion[]>();
    for (const p of pubsFiltradas) {
      const k = dateKey(new Date(p.fechaProgramada));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    for (const arr of map.values()) arr.sort((a, b) => +new Date(a.fechaProgramada) - +new Date(b.fechaProgramada));
    return map;
  }, [pubsFiltradas]);

  function navegar(delta: number) {
    setCursor((c) => {
      const n = new Date(c);
      if (vista === 'mes') n.setMonth(n.getMonth() + delta);
      else if (vista === 'semana') n.setDate(n.getDate() + delta * 7);
      else n.setDate(n.getDate() + delta);
      return n;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    setDragId(null);
    const overKey = e.over?.id as string | undefined;
    if (!overKey) return;
    const pub = publicaciones.find((p) => p.id === e.active.id);
    if (!pub) return;
    const [y, m, d] = overKey.split('-').map(Number);
    const orig = new Date(pub.fechaProgramada);
    const nueva = new Date(y, m - 1, d, orig.getHours(), orig.getMinutes());
    if (sameDay(orig, nueva)) return;
    actualizarPublicacion(pub.id, {
      fechaProgramada: nueva.toISOString(),
      fechaPublicada: pub.estado === 'publicada' ? nueva.toISOString() : pub.fechaPublicada,
    });
  }

  const dragPub = dragId ? publicaciones.find((p) => p.id === dragId) : null;

  const titulo = vista === 'mes'
    ? `${MESES[cursor.getMonth()]} ${cursor.getFullYear()}`
    : vista === 'semana'
      ? (() => { const s = startOfWeek(cursor); const e = new Date(s.getTime() + 6 * DIA_MS); return `${s.getDate()} ${MESES[s.getMonth()].slice(0, 3)} – ${e.getDate()} ${MESES[e.getMonth()].slice(0, 3)}`; })()
      : cursor.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendario de contenido"
        subtitle="Arrastra para reprogramar · pulsa un día para crear"
        actions={
          <button onClick={() => setDialog({ pub: null })} className="inline-flex items-center gap-2 rounded-full bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity">
            <Plus className="w-4 h-4" /> Nueva publicación
          </button>
        }
      />

      {/* Barra de control */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => navegar(-1)} aria-label="Mes anterior" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={() => setCursor(new Date())} className="rounded-full border border-border px-3 h-9 text-sm font-semibold hover:bg-muted transition-colors">Hoy</button>
          <button onClick={() => navegar(1)} aria-label="Mes siguiente" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
          <h2 className="text-base font-bold text-foreground capitalize ml-1">{titulo}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as Plataforma | 'todas')} className="appearance-none rounded-full border border-border bg-card pl-8 pr-7 h-9 text-sm font-semibold text-foreground focus:outline-none">
              <option value="todas">Todas las redes</option>
              {PLATAFORMAS.map((p) => <option key={p} value={p}>{PLATAFORMA_META[p].label}</option>)}
            </select>
            <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          </div>
          <div className="flex items-center rounded-full border border-border p-0.5">
            {(['mes', 'semana', 'dia'] as Vista[]).map((v) => (
              <button key={v} onClick={() => setVista(v)} className={cn('rounded-full px-3 h-8 text-sm font-semibold capitalize transition-colors', vista === v ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>{v}</button>
            ))}
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setDragId(e.active.id as string)}
        onDragEnd={onDragEnd}
      >
        {vista === 'mes' && <VistaMes cursor={cursor} hoy={hoy} porDia={porDia} onDay={(d) => setDialog({ pub: null, fecha: d })} onPub={(p) => setDialog({ pub: p })} />}
        {vista === 'semana' && <VistaSemana cursor={cursor} hoy={hoy} porDia={porDia} onDay={(d) => setDialog({ pub: null, fecha: d })} onPub={(p) => setDialog({ pub: p })} />}
        {vista === 'dia' && <VistaDia cursor={cursor} hoy={hoy} porDia={porDia} onDay={(d) => setDialog({ pub: null, fecha: d })} onPub={(p) => setDialog({ pub: p })} />}
        <DragOverlay>{dragPub ? <PostChip pub={dragPub} overlay /> : null}</DragOverlay>
      </DndContext>

      <Leyenda />

      {dialog && <PublicacionDialog open onClose={() => setDialog(null)} publicacion={dialog.pub} fechaInicial={dialog.fecha} />}
    </div>
  );
}

// ── Vista mensual ────────────────────────────────────────────────────────────
function VistaMes({ cursor, hoy, porDia, onDay, onPub }: VistaProps) {
  const primero = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const inicio = startOfWeek(primero);
  const dias = Array.from({ length: 42 }, (_, i) => new Date(inicio.getTime() + i * DIA_MS));
  return (
    <div className="bg-card border border-border rounded-3xl overflow-hidden">
      <div className="grid grid-cols-7 border-b border-border">
        {DIAS_SEMANA.map((d) => <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const otro = d.getMonth() !== cursor.getMonth();
          const esHoy = sameDay(d, hoy);
          const pubs = porDia.get(dateKey(d)) ?? [];
          return (
            <DiaCelda key={dateKey(d)} fecha={d} className={cn('min-h-[104px] border-b border-r border-border p-1.5 last:border-r-0', otro && 'bg-muted/30')} onClick={() => onDay(d)}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full', esHoy ? 'bg-foreground text-background' : otro ? 'text-muted-foreground/60' : 'text-foreground')}>{d.getDate()}</span>
                {pubs.length > 0 && <span className="text-[10px] font-semibold text-muted-foreground">{pubs.length}</span>}
              </div>
              <div className="space-y-1">
                {pubs.slice(0, 3).map((p) => <PostChip key={p.id} pub={p} onClick={(e) => { e.stopPropagation(); onPub(p); }} />)}
                {pubs.length > 3 && <p className="text-[10px] text-muted-foreground pl-1">+{pubs.length - 3} más</p>}
              </div>
            </DiaCelda>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista semanal ────────────────────────────────────────────────────────────
function VistaSemana({ cursor, hoy, porDia, onDay, onPub }: VistaProps) {
  const inicio = startOfWeek(cursor);
  const dias = Array.from({ length: 7 }, (_, i) => new Date(inicio.getTime() + i * DIA_MS));
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
      {dias.map((d) => {
        const esHoy = sameDay(d, hoy);
        const pubs = porDia.get(dateKey(d)) ?? [];
        return (
          <DiaCelda key={dateKey(d)} fecha={d} className={cn('bg-card border rounded-2xl p-2 min-h-[180px]', esHoy ? 'border-foreground' : 'border-border')} onClick={() => onDay(d)}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">{DIAS_SEMANA[(d.getDay() + 6) % 7]}</span>
              <span className={cn('inline-flex items-center justify-center w-6 h-6 text-xs font-bold rounded-full', esHoy ? 'bg-foreground text-background' : 'text-foreground')}>{d.getDate()}</span>
            </div>
            <div className="space-y-1">
              {pubs.map((p) => <PostChip key={p.id} pub={p} detallado onClick={(e) => { e.stopPropagation(); onPub(p); }} />)}
            </div>
          </DiaCelda>
        );
      })}
    </div>
  );
}

// ── Vista diaria ─────────────────────────────────────────────────────────────
function VistaDia({ cursor, hoy, porDia, onDay, onPub }: VistaProps) {
  const pubs = porDia.get(dateKey(cursor)) ?? [];
  const esHoy = sameDay(cursor, hoy);
  return (
    <DiaCelda fecha={cursor} className={cn('bg-card border rounded-3xl p-5 min-h-[300px]', esHoy ? 'border-foreground' : 'border-border')} onClick={() => onDay(cursor)}>
      {pubs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <p className="text-sm text-muted-foreground">No hay publicaciones este día.</p>
          <button onClick={(e) => { e.stopPropagation(); onDay(cursor); }} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted transition-colors"><Plus className="w-4 h-4" /> Crear publicación</button>
        </div>
      ) : (
        <div className="space-y-2">
          {pubs.map((p) => (
            <div key={p.id} onClick={(e) => { e.stopPropagation(); onPub(p); }} className="flex items-center gap-3 rounded-2xl border border-border p-3 hover:border-muted-foreground/60 cursor-pointer transition-colors">
              <span className="text-sm font-bold text-foreground tabular-nums w-14">{fmtHora(p.fechaProgramada)}</span>
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', ESTADO_META[p.estado].dot)} />
              <span className="flex-1 text-sm font-semibold text-foreground truncate">{p.titulo}</span>
              <PlataformasStack plataformas={p.plataformas} size={20} />
            </div>
          ))}
        </div>
      )}
    </DiaCelda>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────
interface VistaProps {
  cursor: Date; hoy: Date;
  porDia: Map<string, Publicacion[]>;
  onDay: (d: Date) => void;
  onPub: (p: Publicacion) => void;
}

function DiaCelda({ fecha, className, children, onClick }: { fecha: Date; className?: string; children: React.ReactNode; onClick?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey(fecha) });
  return (
    <div ref={setNodeRef} onClick={onClick} className={cn('cursor-pointer transition-colors', isOver && 'bg-foreground/5 ring-1 ring-inset ring-foreground/30', className)}>
      {children}
    </div>
  );
}

function PostChip({ pub, detallado, overlay, onClick }: { pub: Publicacion; detallado?: boolean; overlay?: boolean; onClick?: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: pub.id, disabled: overlay });
  const m = ESTADO_META[pub.estado];
  return (
    <div
      ref={setNodeRef} {...listeners} {...attributes} onClick={onClick}
      className={cn(
        'group flex items-center gap-1.5 rounded-lg border border-border bg-background px-1.5 py-1 text-left w-full touch-none',
        'hover:border-muted-foreground/60 transition-colors',
        isDragging && 'opacity-30',
        overlay && 'shadow-lg cursor-grabbing',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', m.dot)} />
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-semibold text-foreground truncate leading-tight">{pub.titulo}</span>
        {detallado && <span className="block text-[10px] text-muted-foreground">{fmtHora(pub.fechaProgramada)}</span>}
      </span>
      <PlataformasStack plataformas={pub.plataformas.slice(0, 2)} size={14} />
    </div>
  );
}

function Leyenda() {
  return (
    <div className="flex items-center gap-4 flex-wrap text-[12px] text-muted-foreground">
      {Object.entries(ESTADO_META).map(([k, m]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={cn('w-2 h-2 rounded-full', m.dot)} /> {m.label}
        </span>
      ))}
    </div>
  );
}
