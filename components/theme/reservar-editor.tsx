'use client';

import { useEffect, useState } from 'react';
import { GripVertical, Eye, EyeOff, Lock } from 'lucide-react';
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
import { fetchLayout, guardarLayoutApi } from '@/lib/api-client';
import {
  SECCIONES_RESERVAR, ordenarSecciones, esFija, type SeccionReservar,
} from '@/lib/reservar/secciones';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Solo estas se arrastran; el horario va fijo y no entra nunca en `orden`
// (ver el comentario de SECCIONES_FIJAS). Es también lo único que se guarda:
// mandar el id fijo lo dejaría escrito en la config para que `ordenarSecciones`
// lo tuviera que volver a ignorar en cada lectura.
const MOVIBLES = SECCIONES_RESERVAR.filter((s) => !esFija(s.id)).map((s) => s.id);

/**
 * Estado + persistencia del orden de `/reservar` — la página pública que el
 * estudio enlaza desde su web.
 *
 * ⚠️ **La lista que se pinta sale de `ordenarSecciones`, no de `items`.** Es la
 * MISMA función que usa la página, así que el rail no puede enseñar un orden y
 * la clienta ver otro: las reglas (fija en su sitio, id nuevo al final, id
 * retirado sin hueco) se aplican una sola vez, en un sitio, con sus tests.
 *
 * Guarda EN VIVO, sin borrador/publicar — igual que «Inicio del panel» y por el
 * mismo motivo: esto es orden y visibilidad, no contenido que revisar antes de
 * enseñarlo. El botón «Publicar» de la barra no lo toca.
 */
export function useReservarSeccionesEditor() {
  const [items, setItems] = useState<string[]>(MOVIBLES);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  // ⚠️ `reservar` se lee con `?.`, aunque el servidor SIEMPRE devuelva el objeto
  // entero (`resolveLayout` lo rellena). `fetchLayout` hace un cast, no una
  // validación: si alguna vez llega una respuesta sin esa clave, un acceso
  // directo tumbaría el editor entero en vez de esta lista.
  function aplicar(l: { reservar?: { orden?: string[]; ocultos?: string[] } }) {
    // Se normaliza a través de `ordenarSecciones` para que lo que se ve sea lo
    // que se pinta, y para que un `orden` guardado con basura (duplicados, ids
    // retirados) no llegue nunca al estado del editor.
    setItems(ordenarSecciones(l.reservar).map((s) => s.id).filter((id) => !esFija(id)));
    setOcultos(new Set((l.reservar?.ocultos ?? []).filter((id) => !esFija(id))));
  }

  useEffect(() => {
    let vivo = true;
    fetchLayout().then((l) => { if (vivo) aplicar(l); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setItems((prev) => arrayMove(prev, prev.indexOf(active.id as string), prev.indexOf(over.id as string)));
      setAviso(null);
    }
  }

  function toggle(id: string) {
    if (esFija(id)) return; // el ojo ni se pinta para las fijas; segunda puerta
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
      await guardarLayoutApi({ reservar: { orden: items, ocultos: [...ocultos] } });
      setAviso({ tipo: 'ok', texto: 'Guardado. Ya se ve así en tu página de reservas.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  /** Relee del servidor y tira las ediciones sin guardar (el «Descartar» de la barra). */
  function recargar() {
    fetchLayout().then(aplicar).catch(() => {});
    setAviso(null);
  }

  /** El orden final, ya con las fijas en su sitio: lo que pintará la página. */
  const secciones = ordenarSecciones({ orden: items, ocultos: [...ocultos] });

  return { items, secciones, ocultos, guardando, aviso, onDragEnd, toggle, guardar, recargar };
}

function Fila({ seccion, oculto, onToggle }: { seccion: SeccionReservar; oculto: boolean; onToggle: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: seccion.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-border bg-card"
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label={`Reordenar ${seccion.label}`}>
        <GripVertical size={16} />
      </button>
      <span className="flex-1 min-w-0">
        <span className={`block text-[13px] font-medium truncate ${oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
          {seccion.label}
        </span>
        <span className="block text-[11px] text-muted-foreground/80 truncate">{seccion.ayuda}</span>
      </span>
      <button onClick={onToggle} title={oculto ? 'Mostrar' : 'Ocultar'} className="text-muted-foreground hover:text-foreground" aria-label={oculto ? `Mostrar ${seccion.label}` : `Ocultar ${seccion.label}`}>
        {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// La fija se pinta EN SU SITIO dentro de la misma lista, no fuera ni al final:
// así se ve dónde cae de verdad respecto a las que sí se mueven. Sin asa y sin
// ojo — lo que no se puede hacer no se ofrece.
function FilaFija({ seccion }: { seccion: SeccionReservar }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-dashed border-border bg-muted/40">
      <Lock size={15} className="flex-none text-muted-foreground" aria-hidden />
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] font-medium truncate text-foreground">{seccion.label}</span>
        <span className="block text-[11px] text-muted-foreground/80 truncate">Va siempre, y en su sitio.</span>
      </span>
    </div>
  );
}

export function ReservarSeccionesList({ hook }: { hook: ReturnType<typeof useReservarSeccionesEditor> }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Arrastra para reordenar tu página pública de reservas y usa el ojo para ocultar lo que no uses. El horario va siempre.
      </p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={hook.onDragEnd}>
        {/* Al contexto de arrastre solo entran las movibles: la fija no es un
            destino válido, así que arrastrar por encima de ella salta a la
            siguiente ranura de verdad en vez de fingir un hueco. */}
        <SortableContext items={hook.items} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {hook.secciones.map((s) => (
              esFija(s.id)
                ? <FilaFija key={s.id} seccion={s} />
                : <Fila key={s.id} seccion={s} oculto={hook.ocultos.has(s.id)} onToggle={() => hook.toggle(s.id)} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/**
 * El lienzo central para esta pantalla.
 *
 * NO es un iframe de `/reservar`: esa página enseñaría el orden PUBLICADO, y
 * mientras se arrastra aquí diría lo contrario de lo que se está haciendo — el
 * fallo de «el preview miente» que este editor ya ha pagado una vez. Un esquema
 * de la página no promete píxeles, pero lo que dice es cierto en todo momento.
 */
export function ReservarEsquema({ hook }: { hook: ReturnType<typeof useReservarSeccionesEditor> }) {
  return (
    <div className="w-[360px] rounded-2xl border border-border bg-background p-4 space-y-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Tu página de reservas</p>
      {hook.secciones.map((s) => {
        const oculta = !esFija(s.id) && hook.ocultos.has(s.id);
        return (
          <div
            key={s.id}
            className={`rounded-xl px-3 py-3 border ${oculta
              ? 'border-dashed border-border bg-transparent'
              : 'border-transparent bg-muted'}`}
          >
            <p className={`text-[13px] font-semibold ${oculta ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
              {s.label}
            </p>
            <p className="text-[11px] text-muted-foreground/80">{oculta ? 'Oculta — no se ve' : s.ayuda}</p>
          </div>
        );
      })}
    </div>
  );
}
