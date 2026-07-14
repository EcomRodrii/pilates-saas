'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Eye, EyeOff, RotateCcw, Check, AlertTriangle } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { usePermisos } from '@/lib/permisos';
import { fetchLayout, guardarLayoutApi } from '@/lib/api-client';
import { MODULOS, NO_OCULTABLES, type NavItemDef } from '@/lib/nav-config';
import { DEFAULT_LAYOUT } from '@/lib/layout-schema';

function Fila({ item, oculto, onToggle }: { item: NavItemDef; oculto: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.href });
  const noOcultable = NO_OCULTABLES.includes(item.href);
  const Icon = item.icon;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label={`Reordenar ${item.label}`}
      >
        <GripVertical size={16} />
      </button>
      <Icon size={16} className={oculto ? 'text-muted-foreground/40' : 'text-foreground'} />
      <span className={`flex-1 text-[13px] font-medium ${oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
        {item.label}
      </span>
      <button
        onClick={onToggle}
        disabled={noOcultable}
        title={noOcultable ? 'Este módulo no se puede ocultar' : oculto ? 'Mostrar' : 'Ocultar'}
        className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label={oculto ? `Mostrar ${item.label}` : `Ocultar ${item.label}`}
      >
        {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function MenuEditor() {
  const { rol } = usePermisos();
  const [items, setItems] = useState<string[]>(MODULOS.map((m) => m.href));
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let vivo = true;
    fetchLayout()
      .then((l) => {
        if (!vivo) return;
        const todos = MODULOS.map((m) => m.href);
        const orden = [...l.orden.filter((h) => todos.includes(h)), ...todos.filter((h) => !l.orden.includes(h))];
        setItems(orden);
        setOcultos(new Set(l.ocultos));
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setEstado('listo');
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (rol !== 'PROPIETARIO') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede configurar el menú.</p>;
  }
  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando el menú…</p>;
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)));
      setAviso(null);
    }
  }

  function toggle(href: string) {
    if (NO_OCULTABLES.includes(href)) return;
    setOcultos((prev) => {
      const n = new Set(prev);
      if (n.has(href)) n.delete(href);
      else n.add(href);
      return n;
    });
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarLayoutApi({ orden: items, ocultos: [...ocultos], menuPosition: DEFAULT_LAYOUT.menuPosition });
      setAviso({ tipo: 'ok', texto: 'Menú guardado. Recarga la página para verlo aplicado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  }

  function restaurar() {
    setItems(MODULOS.map((m) => m.href));
    setOcultos(new Set());
    setAviso(null);
  }

  const porHref = new Map(MODULOS.map((m) => [m.href, m]));

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-[13px] text-muted-foreground">
        Arrastra para reordenar los módulos del menú y usa el ojo para ocultar los que no uses. Se aplica a todo el equipo del estudio.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((href) => {
              const item = porHref.get(href);
              if (!item) return null;
              return <Fila key={href} item={item} oculto={ocultos.has(href)} onToggle={() => toggle(href)} />;
            })}
          </div>
        </SortableContext>
      </DndContext>

      {aviso && (
        <div className={`flex items-center gap-2 text-[12.5px] font-medium ${aviso.tipo === 'ok' ? 'text-green-700' : 'text-destructive'}`}>
          {aviso.tipo === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-4">
        <button onClick={restaurar} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-muted-foreground">
          <RotateCcw size={14} /> Restaurar
        </button>
        <div className="flex-1" />
        <button onClick={guardar} disabled={guardando} className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar menú'}
        </button>
      </div>
    </div>
  );
}
