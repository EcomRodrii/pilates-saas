'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Eye, EyeOff } from 'lucide-react';
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
import { HOME_SECCIONES, HOME_FIJAS_PRIMERO, type HomeSeccion } from '@/lib/home-sections';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Las secciones de HOME_FIJAS_PRIMERO (hoy solo 'onboarding') no se listan
// aquí: no son contenido que tenga sentido arrastrar u ocultar a mano, son
// avisos de estado que se muestran y ocultan solos. Así se evita que alguien
// las reordene sin querer y el aviso importante quede enterrado (ver el
// comentario de HOME_FIJAS_PRIMERO en lib/home-sections.ts).
const SECCIONES_EDITABLES = HOME_SECCIONES.filter((s) => !HOME_FIJAS_PRIMERO.includes(s.id));

// Estado + persistencia de "Inicio del panel" (dashboard interno de staff),
// separado de la presentación (Fila/lista) para poder montarlo dentro del
// workspace único de Apariencia (theme-workspace.tsx) sin un componente de
// página aparte. Guarda EN VIVO (sin borrador/publicar) — igual que siempre.
export function useHomeSeccionesEditor() {
  const { rol } = usePermisos();
  const [items, setItems] = useState<string[]>(SECCIONES_EDITABLES.map((s) => s.id));
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchLayout()
      .then((l) => {
        if (!vivo) return;
        const todos = SECCIONES_EDITABLES.map((s) => s.id);
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
    setItems(SECCIONES_EDITABLES.map((s) => s.id));
    setOcultos(new Set());
    setAviso(null);
  }

  return { rol, items, ocultos, estado, guardando, aviso, onDragEnd, toggle, guardar, restaurar };
}

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

// Lista arrastrable — sin panel de configuración propio: `HomeSeccion` no
// tiene campos editables más allá de orden/oculto, así que aquí no hay
// selección de fila ni panel derecho (el workspace muestra un aviso).
export function HomeSeccionesList({ hook }: { hook: ReturnType<typeof useHomeSeccionesEditor> }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const porId = new Map(HOME_SECCIONES.map((s) => [s.id, s]));

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Arrastra para reordenar las secciones de la pantalla de inicio y usa el ojo para ocultar las que no uses. El encabezado se mantiene siempre arriba.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={hook.onDragEnd}>
        <SortableContext items={hook.items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {hook.items.map((id) => {
              const seccion = porId.get(id);
              if (!seccion) return null;
              return <Fila key={id} seccion={seccion} oculto={hook.ocultos.has(id)} onToggle={() => hook.toggle(id)} />;
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
