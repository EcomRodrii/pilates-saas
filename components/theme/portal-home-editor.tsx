'use client';

import { useEffect, useState } from 'react';
import {
  GripVertical, Eye, EyeOff, RotateCcw, Check, AlertTriangle, Plus, Trash2, ChevronDown,
  Image as ImageIcon, Type, MousePointerClick, HelpCircle, type LucideIcon,
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
import { fetchHomeBloquesBorrador, guardarHomeBloquesBorradorApi, publicarHomeBloquesApi } from '@/lib/api-client';
import {
  BLOCK_CATALOG, DEFAULT_HOME_BLOQUES, BLOQUE_SISTEMA_LABEL, getBlockCatalogEntry,
  type BloqueHome, type BannerConfig, type TextoConfig, type CtaConfig, type FaqConfig,
} from '@/lib/portal-home-bloques';
import { uid } from '@/lib/utils';
import { mensajeSeguro, ERROR_RED } from '@/lib/errores';

// Fase 3 del editor de temas: generaliza el reordenar/ocultar de Fase 2 (los 4
// módulos `sistema`) a un constructor de bloques tipo Shopify Sections — el
// estudio también puede AÑADIR banner/texto/cta/faq del catálogo
// (BLOCK_CATALOG), configurarlos y reordenarlos junto a los de siempre.
//
// A diferencia de Fase 2 (que guardaba en vivo), esto tiene borrador/publicar
// propio — hay contenido editorial real (texto, imagen, preguntas) que un
// cambio a medias no debe publicar solo.

const ICONOS: Record<string, LucideIcon> = {
  Image: ImageIcon, Type, MousePointerClick, HelpCircle,
};

const inputCls = 'w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background';
const labelCls = 'text-[11.5px] font-semibold text-muted-foreground block mb-1';

function labelDe(b: BloqueHome): string {
  if (b.kind === 'sistema') return BLOQUE_SISTEMA_LABEL[b.sistemaId];
  return getBlockCatalogEntry(b.kind)?.label ?? b.kind;
}

function ConfigBanner({ config, onChange }: { config: BannerConfig; onChange: (c: BannerConfig) => void }) {
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>URL de la imagen</span><input className={inputCls} value={config.imagenUrl} onChange={(e) => onChange({ ...config, imagenUrl: e.target.value })} placeholder="https://…" /></div>
      <div><span className={labelCls}>Título</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      <div><span className={labelCls}>Texto</span><input className={inputCls} value={config.texto} onChange={(e) => onChange({ ...config, texto: e.target.value })} /></div>
      <div><span className={labelCls}>Enlace (opcional)</span><input className={inputCls} value={config.href} onChange={(e) => onChange({ ...config, href: e.target.value })} placeholder="/reservar o https://…" /></div>
    </div>
  );
}
function ConfigTexto({ config, onChange }: { config: TextoConfig; onChange: (c: TextoConfig) => void }) {
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>Título (opcional)</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      <div><span className={labelCls}>Texto</span><textarea className={`${inputCls} min-h-20`} value={config.texto} onChange={(e) => onChange({ ...config, texto: e.target.value })} /></div>
    </div>
  );
}
function ConfigCta({ config, onChange }: { config: CtaConfig; onChange: (c: CtaConfig) => void }) {
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>Título</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      <div><span className={labelCls}>Texto del botón</span><input className={inputCls} value={config.textoBoton} onChange={(e) => onChange({ ...config, textoBoton: e.target.value })} /></div>
      <div><span className={labelCls}>Enlace</span><input className={inputCls} value={config.href} onChange={(e) => onChange({ ...config, href: e.target.value })} placeholder="/reservar o https://…" /></div>
    </div>
  );
}
function ConfigFaq({ config, onChange }: { config: FaqConfig; onChange: (c: FaqConfig) => void }) {
  function setPregunta(i: number, campo: 'pregunta' | 'respuesta', valor: string) {
    const preguntas = config.preguntas.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p));
    onChange({ ...config, preguntas });
  }
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>Título (opcional)</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      {config.preguntas.map((p, i) => (
        <div key={i} className="space-y-1 border-l-2 border-border pl-2.5">
          <input className={inputCls} value={p.pregunta} onChange={(e) => setPregunta(i, 'pregunta', e.target.value)} placeholder="Pregunta" />
          <textarea className={`${inputCls} min-h-14`} value={p.respuesta} onChange={(e) => setPregunta(i, 'respuesta', e.target.value)} placeholder="Respuesta" />
          <button onClick={() => onChange({ ...config, preguntas: config.preguntas.filter((_, idx) => idx !== i) })} className="text-[11.5px] font-semibold text-destructive">Quitar pregunta</button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...config, preguntas: [...config.preguntas, { pregunta: '', respuesta: '' }] })}
        className="text-[12px] font-semibold text-brand-medio"
      >
        + Añadir pregunta
      </button>
    </div>
  );
}

function ConfigForm({ bloque, onChange }: { bloque: BloqueHome; onChange: (b: BloqueHome) => void }) {
  if (bloque.kind === 'sistema') return null;
  if (bloque.kind === 'banner') return <ConfigBanner config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'texto') return <ConfigTexto config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'cta') return <ConfigCta config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  return <ConfigFaq config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
}

function Fila({
  bloque, onToggle, onDelete, onChange, expandido, onExpandir,
}: {
  bloque: BloqueHome; onToggle: () => void; onDelete?: () => void; onChange: (b: BloqueHome) => void;
  expandido: boolean; onExpandir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: bloque.id });
  const configurable = bloque.kind !== 'sistema';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="rounded-xl border border-border bg-card overflow-hidden"
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-muted-foreground hover:text-foreground" aria-label={`Reordenar ${labelDe(bloque)}`}>
          <GripVertical size={16} />
        </button>
        <span className={`flex-1 text-[13px] font-medium ${bloque.oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
          {labelDe(bloque)}
        </span>
        {configurable && (
          <button onClick={onExpandir} className="text-muted-foreground hover:text-foreground" aria-label="Configurar">
            <ChevronDown size={16} className={`transition-transform ${expandido ? 'rotate-180' : ''}`} />
          </button>
        )}
        <button onClick={onToggle} title={bloque.oculto ? 'Mostrar' : 'Ocultar'} className="text-muted-foreground hover:text-foreground" aria-label={bloque.oculto ? `Mostrar ${labelDe(bloque)}` : `Ocultar ${labelDe(bloque)}`}>
          {bloque.oculto ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
        {onDelete && (
          <button onClick={onDelete} title="Eliminar" className="text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${labelDe(bloque)}`}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {configurable && expandido && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          <ConfigForm bloque={bloque} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

export function PortalHomeEditor() {
  const { rol } = usePermisos();
  const [bloques, setBloques] = useState<BloqueHome[]>(DEFAULT_HOME_BLOQUES);
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    let vivo = true;
    fetchHomeBloquesBorrador()
      .then((b) => { if (vivo && b.length > 0) setBloques(b); })
      .catch(() => {})
      .finally(() => { if (vivo) setEstado('listo'); });
    return () => { vivo = false; };
  }, []);

  if (rol !== 'PROPIETARIO' && rol !== 'MANAGER') {
    return <p className="text-sm text-muted-foreground">Solo la propietaria o la gerencia del estudio pueden configurar el Inicio del portal.</p>;
  }
  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Cargando Inicio del portal…</p>;
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
    if (expandidoId === id) setExpandidoId(null);
    setAviso(null);
  }

  function cambiar(actualizado: BloqueHome) {
    setBloques((prev) => prev.map((b) => (b.id === actualizado.id ? actualizado : b)));
    setAviso(null);
  }

  function anadir(kind: (typeof BLOCK_CATALOG)[number]['kind']) {
    const entry = getBlockCatalogEntry(kind);
    if (!entry) return;
    const nuevo = { id: uid(), kind, config: entry.defaultConfig } as BloqueHome;
    setBloques((prev) => [...prev, nuevo]);
    setExpandidoId(nuevo.id);
    setPicker(false);
    setAviso(null);
  }

  async function guardar() {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarHomeBloquesBorradorApi(bloques);
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
      await guardarHomeBloquesBorradorApi(bloques);
      await publicarHomeBloquesApi();
      setAviso({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus clientas.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  function restaurar() {
    setBloques(DEFAULT_HOME_BLOQUES);
    setExpandidoId(null);
    setAviso(null);
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-[13px] text-muted-foreground">
        Arrastra para reordenar los bloques del Inicio del portal, usa el ojo para ocultar los que no uses, y añade bloques nuevos del catálogo. El saludo y tu próxima clase se mantienen siempre arriba.
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={bloques.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {bloques.map((b) => (
              <Fila
                key={b.id}
                bloque={b}
                onToggle={() => toggle(b.id)}
                onDelete={b.kind === 'sistema' ? undefined : () => eliminar(b.id)}
                onChange={cambiar}
                expandido={expandidoId === b.id}
                onExpandir={() => setExpandidoId((prev) => (prev === b.id ? null : b.id))}
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
                    onClick={() => anadir(entry.kind)}
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
        <button onClick={guardar} disabled={guardando} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-border disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar borrador'}
        </button>
        <button onClick={publicar} disabled={publicando} className="text-[13px] font-bold px-4 py-2 rounded-xl bg-brand text-brand-foreground disabled:opacity-50">
          {publicando ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
      <p className="text-[11.5px] text-muted-foreground">
        El borrador solo lo ves tú. Al publicar, el nuevo Inicio pasa a la app de clientas.
      </p>
    </div>
  );
}
