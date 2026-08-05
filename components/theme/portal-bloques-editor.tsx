'use client';

import { useEffect, useState } from 'react';
import {
  GripVertical, Eye, EyeOff, Plus, Trash2,
  Image as ImageIcon, Type, MousePointerClick, HelpCircle,
  GalleryHorizontal, Video, Quote, type LucideIcon,
} from 'lucide-react';
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
import { fetchBloquesBorrador, guardarBloquesBorradorApi, publicarBloquesApi } from '@/lib/api-client';
import {
  BLOCK_CATALOG, DEFAULT_BLOQUES_POR_PANTALLA, BLOQUE_SISTEMA_LABEL, PANTALLA_IDS, getBlockCatalogEntry,
  getDefinicionBloque, CAMPOS_ESTILO,
  type BloqueHome, type PantallaId, type EstiloBloque,
} from '@/lib/portal-home-bloques';
import { CamposForm } from '@/components/theme/inspector/campos-form';
import { uid } from '@/lib/utils';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Constructor de bloques tipo Shopify Sections para el portal de clientas
// (Inicio/Clases/Bonos) — el estudio añade banner/texto/cta/faq del catálogo
// (BLOCK_CATALOG), los configura y los reordena junto a los del sistema.
// Borrador/publicar propio POR PANTALLA — hay contenido editorial real
// (texto, imagen, preguntas) que un cambio a medias no debe publicar solo, y
// cada pantalla puede ir a su ritmo (terminar Clases sin publicar Bonos a
// medias).
//
// Separado en hook (estado/persistencia) + lista (columna Secciones) + panel
// (columna derecha) para montarse dentro del workspace único de Apariencia
// (theme-workspace.tsx) — la selección de fila ya no abre un acordeón
// inline, abre su `ConfigForm` en el panel derecho.

const ICONOS: Record<string, LucideIcon> = {
  Image: ImageIcon, Type, MousePointerClick, HelpCircle,
  GalleryHorizontal, Video, Quote,
};

const DESCRIPCION_PANTALLA: Record<PantallaId, string> = {
  home: 'El saludo y tu próxima clase se mantienen siempre arriba.',
  clases: 'El calendario de clases se mantiene siempre visible; los bloques que añadas van antes o después.',
  bonos: 'Tu bono y accesos rápidos se mantienen siempre visibles; los bloques que añadas van antes o después.',
};

export function labelDe(b: BloqueHome): string {
  if (b.kind === 'sistema') return BLOQUE_SISTEMA_LABEL[b.sistemaId];
  return getBlockCatalogEntry(b.kind)?.label ?? b.kind;
}

// El panel de configuración de un bloque ya no se escribe: sale de su schema
// (REGISTRO_BLOQUES → `campos`) a través del Inspector genérico. Antes esto
// eran siete componentes de formulario más una cadena de siete `if`, con la
// forma de cada bloque duplicada respecto al tipo, al zod y al render.
function ConfigForm({ bloque, onChange }: { bloque: BloqueHome; onChange: (b: BloqueHome) => void }) {
  if (bloque.kind === 'sistema') return null;
  const def = getDefinicionBloque(bloque.kind);
  if (!def) return null;
  return (
    <CamposForm
      campos={def.campos}
      valores={bloque.config as Record<string, unknown>}
      // Los repetidores (preguntas, imágenes, testimonios) van sin rótulo
      // encima, igual que antes: dentro de la lista el marcador de cada
      // casilla ya dice qué es, y un "Preguntas" suelto solo añadía ruido.
      etiquetaListaSinTitulo
      onChange={(config) => onChange({ ...bloque, config } as BloqueHome)}
    />
  );
}

// Estilo PROPIO de la sección — pisa el tema global solo para este bloque.
// Solo aplica a bloques del catálogo: los `sistema` son UI de producto, no
// contenido de la propietaria (ConfigForm ya los filtra por el mismo motivo).
//
// ⚠️ Aquí **no** se rellenan defaults: en `estilo`, "ausente" significa
// "hereda del tema", que es un tercer estado distinto de "el valor por
// defecto". Se le pasa al Inspector el objeto guardado tal cual, y cada
// control enseña su `porDefecto` como opción marcada sin escribirla — que es
// exactamente lo que hacía el `?? 'redondeada'` de antes.
function EstiloForm({ bloque, onChange }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; onChange: (b: BloqueHome) => void }) {
  return (
    <div className="space-y-3 border-t border-border pt-3 mt-3">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Estilo de esta sección</p>
      <p className="text-[11px] text-muted-foreground -mt-1">Pisa el tema global solo aquí. Vacío = hereda del tema.</p>
      <CamposForm
        campos={CAMPOS_ESTILO}
        valores={(bloque.estilo ?? {}) as Record<string, unknown>}
        onChange={(estilo) => onChange({ ...bloque, estilo: estilo as EstiloBloque })}
      />
    </div>
  );
}

function Fila({
  bloque, activa, onSeleccionar, onToggle, onDelete,
}: {
  bloque: BloqueHome; activa: boolean; onSeleccionar: () => void; onToggle: () => void; onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bloque.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border ${activa ? 'border-brand bg-brand/5' : 'border-border bg-card'}`}
    >
      <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label={`Reordenar ${labelDe(bloque)}`}>
        <GripVertical size={16} />
      </button>
      <button type="button" onClick={onSeleccionar} className="flex-1 text-left">
        <span className={`text-[13px] font-medium ${bloque.oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
          {labelDe(bloque)}
        </span>
      </button>
      <button onClick={onToggle} title={bloque.oculto ? 'Mostrar' : 'Ocultar'} className="text-muted-foreground hover:text-foreground" aria-label={bloque.oculto ? `Mostrar ${labelDe(bloque)}` : `Ocultar ${labelDe(bloque)}`}>
        {bloque.oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      {onDelete && (
        <button onClick={onDelete} title="Eliminar" className="text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${labelDe(bloque)}`}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

// Estado + persistencia de los bloques de UNA pantalla del portal
// (home/clases/bonos). `pantalla` es controlada por el padre (el selector de
// página del workspace) — el hook carga las TRES pantallas de una vez (así
// el preview de la derecha enseña el borrador correcto sea cual sea la
// pantalla que se mire) pero opera sobre la que le pasen.
export function useBloquesEditor(pantalla: PantallaId) {
  const { rol } = usePermisos();
  const [bloquesPorPantalla, setBloquesPorPantalla] = useState<Record<PantallaId, BloqueHome[]>>(DEFAULT_BLOQUES_POR_PANTALLA);
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all(PANTALLA_IDS.map((p) => fetchBloquesBorrador(p).catch(() => null)))
      .then((resultados) => {
        if (!vivo) return;
        setBloquesPorPantalla((prev) => {
          const siguiente = { ...prev };
          PANTALLA_IDS.forEach((p, i) => {
            const r = resultados[i];
            if (r && r.length > 0) siguiente[p] = r;
          });
          return siguiente;
        });
      })
      .finally(() => { if (vivo) setEstado('listo'); });
    return () => { vivo = false; };
  }, []);

  const bloques = bloquesPorPantalla[pantalla];
  function setBloques(actualizar: (prev: BloqueHome[]) => BloqueHome[]) {
    setBloquesPorPantalla((prev) => ({ ...prev, [pantalla]: actualizar(prev[pantalla]) }));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setBloques((prev) => arrayMove(prev, prev.findIndex((b) => b.id === active.id), prev.findIndex((b) => b.id === over.id)));
      setAviso(null);
    }
  }

  function toggle(id: string) {
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, oculto: !b.oculto } : b)));
    setAviso(null);
  }

  function eliminar(id: string) {
    setBloques((prev) => prev.filter((b) => b.id !== id));
    setAviso(null);
  }

  function cambiar(actualizado: BloqueHome) {
    setBloques((prev) => prev.map((b) => (b.id === actualizado.id ? actualizado : b)));
    setAviso(null);
  }

  function anadir(kind: (typeof BLOCK_CATALOG)[number]['kind']): string | null {
    const entry = getBlockCatalogEntry(kind);
    if (!entry) return null;
    const nuevo = { id: uid(), kind, config: entry.defaultConfig } as BloqueHome;
    setBloques((prev) => [...prev, nuevo]);
    setAviso(null);
    return nuevo.id;
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarBloquesBorradorApi(pantalla, bloques);
      setAviso({ tipo: 'ok', texto: 'Borrador guardado. Tus clientas no lo ven todavía.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  async function publicar() {
    setPublicando(true);
    setAviso(null);
    try {
      await guardarBloquesBorradorApi(pantalla, bloques);
      await publicarBloquesApi(pantalla);
      setAviso({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus clientas.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  function restaurar() {
    setBloques(() => DEFAULT_BLOQUES_POR_PANTALLA[pantalla]);
    setAviso(null);
  }

  // "Deshacer" del editor a pantalla completa: relee el borrador de ESTA
  // pantalla desde el servidor, descartando ediciones locales — distinto de
  // `restaurar()`, que vacía a los bloques `sistema` de fábrica.
  function recargar() {
    fetchBloquesBorrador(pantalla).then((r) => setBloques(() => r)).catch(() => {});
    setAviso(null);
  }

  return {
    rol, bloquesPorPantalla, bloques, estado, guardando, publicando, aviso,
    onDragEnd, toggle, eliminar, cambiar, anadir, guardar, publicar, restaurar, recargar,
  };
}

export function BloquesSeccionesList({
  hook, pantalla, seleccionId, onSeleccionar,
}: {
  hook: ReturnType<typeof useBloquesEditor>;
  pantalla: PantallaId;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-muted-foreground">
        Arrastra para reordenar, usa el ojo para ocultar, y añade bloques nuevos del catálogo. {DESCRIPCION_PANTALLA[pantalla]}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={hook.onDragEnd}>
        <SortableContext items={hook.bloques.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {hook.bloques.map((b) => (
              <Fila
                key={b.id}
                bloque={b}
                activa={seleccionId === b.id}
                onSeleccionar={() => onSeleccionar(b.id)}
                onToggle={() => hook.toggle(b.id)}
                onDelete={b.kind === 'sistema' ? undefined : () => hook.eliminar(b.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="relative">
        <button
          onClick={() => setPicker((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-border text-foreground"
        >
          <Plus size={14} /> Añadir bloque
        </button>
        {picker && (
          <>
            <button className="fixed inset-0 z-20 cursor-default" onClick={() => setPicker(false)} aria-hidden tabIndex={-1} />
            <div className="absolute left-0 top-11 z-30 w-72 rounded-xl border border-border bg-card shadow-lg p-2 grid grid-cols-2 gap-2">
              {BLOCK_CATALOG.map((entry) => {
                const Icono = ICONOS[entry.icono] ?? Plus;
                return (
                  <button
                    key={entry.kind}
                    onClick={() => { const id = hook.anadir(entry.kind); setPicker(false); if (id) onSeleccionar(id); }}
                    className="flex flex-col items-start gap-1 p-2.5 rounded-lg border border-border hover:bg-muted text-left"
                  >
                    <Icono size={16} className="text-brand-medio" />
                    <span className="text-[12.5px] font-semibold text-foreground">{entry.label}</span>
                    <span className="text-[11px] text-muted-foreground">{entry.descripcion}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {hook.aviso && (
        <div className={`flex items-center gap-2 text-[12.5px] font-medium ${hook.aviso.tipo === 'ok' ? 'text-green-700' : 'text-destructive'}`}>
          <span>{hook.aviso.texto}</span>
        </div>
      )}
    </div>
  );
}

export function BloquesConfigPanel({
  hook, seleccionId,
}: {
  hook: ReturnType<typeof useBloquesEditor>;
  seleccionId: string | null;
}) {
  const bloque = hook.bloques.find((b) => b.id === seleccionId);
  if (!bloque) return <p className="text-[13px] text-muted-foreground">Selecciona un bloque de la izquierda para configurarlo.</p>;
  if (bloque.kind === 'sistema') return <p className="text-[13px] text-muted-foreground">{labelDe(bloque)} no tiene ajustes propios — solo se puede reordenar u ocultar.</p>;
  return (
    <div>
      <ConfigForm bloque={bloque} onChange={hook.cambiar} />
      <EstiloForm bloque={bloque} onChange={hook.cambiar} />
    </div>
  );
}
