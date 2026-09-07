'use client';

// Lista de «arrastra para ordenar, ojo para ocultar».
//
// Genérica porque en «Personalizar tu panel» hacen falta DOS —los módulos del
// menú y las secciones de Inicio— y dos listas parecidas pero no iguales es
// como acaban divergiendo: una con el ojo a la derecha, la otra a la
// izquierda, y ninguna de las dos parece del mismo producto.
//
// No trae texto explicativo dentro a propósito: lo pone quien la usa, que es
// el que sabe qué está ordenando. Meter el párrafo aquí fue justo lo que
// dejó dos explicaciones seguidas diciendo lo mismo.

import { GripVertical, Eye, EyeOff, Lock } from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';

export interface ItemOrdenable {
  id: string;
  label: string;
  /** No se puede ocultar (p. ej. Inicio o Configuración): sin él no hay salida. */
  fijo?: boolean;
}

function Fila({ item, oculto, onToggle }: { item: ItemOrdenable; oculto: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label={`Reordenar ${item.label}`}
      >
        <GripVertical size={16} />
      </button>
      <span className={cn('flex-1 text-[13px] font-medium', oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground')}>
        {item.label}
      </span>
      {item.fijo ? (
        // Se enseña el candado en vez de esconder el control: así se entiende
        // que no se puede, en vez de parecer que falta.
        <span title="Siempre visible" aria-label={`${item.label} siempre visible`} className="text-muted-foreground/40">
          <Lock size={15} />
        </span>
      ) : (
        <button
          onClick={onToggle}
          title={oculto ? 'Mostrar' : 'Ocultar'}
          aria-label={oculto ? `Mostrar ${item.label}` : `Ocultar ${item.label}`}
          className="text-muted-foreground hover:text-foreground"
        >
          {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );
}

export function ListaOrdenable({
  items, ocultos, onDragEnd, onToggle,
}: {
  items: ItemOrdenable[];
  ocultos: ReadonlySet<string>;
  onDragEnd: (e: DragEndEvent) => void;
  onToggle: (id: string) => void;
}) {
  const sensors = useSensors(
    // 5 px antes de arrastrar: sin esto, pulsar el ojo cuenta como arrastre en
    // pantallas táctiles y la fila se mueve en vez de ocultarse.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map(i => (
            <Fila key={i.id} item={i} oculto={ocultos.has(i.id)} onToggle={() => onToggle(i.id)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
