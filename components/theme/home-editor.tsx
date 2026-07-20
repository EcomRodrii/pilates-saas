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
import { HOME_SECCIONES, type HomeSeccion } from '@/lib/home-sections';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

function Fila({ seccion, oculto, onToggle }: { seccion: HomeSeccion; oculto: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seccion.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border bg-card"
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label={`Reordenar ${seccion.label}`}>
        <GripVertical size={16} />
      </button>
      <span className={`flex-1 text-[13px] font-medium ${oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
        {seccion.label}
      </span>
      <button onClick={onToggle} title={oculto ? 'Mostrar' : 'Ocultar'} className="text-muted-foreground hover:text-foreground" aria-label={oculto ? `Mostrar ${seccion.label}` : `Ocultar ${seccion.label}`}>
        {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function HomeEditor() {
  const { rol } = usePermisos();
  const [items, setItems] = useState<string[]>(HOME_SECCIONES.map((s) => s.id));
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
        const todos = HOME_SECCIONES.map((s) => s.id);
        const orden = [...l.home.orden.filter((h) => todos.includes(h)), ...todos.filter((h) => !l.home.orden.includes(h))];
        setItems(orden);
        setOcultos(new Set(l.home.ocultos));
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
    return <p className="text-sm text-muted-foreground">Solo la propietaria del estudio puede configurar la home.</p>;
  }
  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando la home…</p>;
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)));
      setAviso(null);
    }
  }

  function toggle(id: string) {
    setOcultos((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarLayoutApi({ home: { orden: items, ocultos: [...ocultos] } });
      window.dispatchEvent(new CustomEvent('tentare-layout-changed'));
      setAviso({ tipo: 'ok', texto: 'Inicio guardado y aplicado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  function restaurar() {
    setItems(HOME_SECCIONES.map((s) => s.id));
    setOcultos(new Set());
    setAviso(null);
  }

  const porId = new Map(HOME_SECCIONES.map((s) => [s.id, s]));

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-[13px] text-muted-foreground">
        Arrastra para reordenar las secciones de la pantalla de inicio y usa el ojo para ocultar las que no uses. El encabezado se mantiene siempre arriba.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {items.map((id) => {
              const seccion = porId.get(id);
              if (!seccion) return null;
              return <Fila key={id} seccion={seccion} oculto={ocultos.has(id)} onToggle={() => toggle(id)} />;
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
          {guardando ? 'Guardando…' : 'Guardar inicio'}
        </button>
      </div>
    </div>
  );
}
