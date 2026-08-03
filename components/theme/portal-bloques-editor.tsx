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
  type BloqueHome, type PantallaId, type BannerConfig, type TextoConfig, type CtaConfig, type FaqConfig,
  type GaleriaConfig, type VideoConfig, type TestimoniosConfig, type EstiloBloque,
} from '@/lib/portal-home-bloques';
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

const inputCls = 'w-full text-[13px] px-3 py-2 rounded-xl border border-border bg-background';
const labelCls = 'text-[11.5px] font-semibold text-muted-foreground block mb-1';

const DESCRIPCION_PANTALLA: Record<PantallaId, string> = {
  home: 'El saludo y tu próxima clase se mantienen siempre arriba.',
  clases: 'El calendario de clases se mantiene siempre visible; los bloques que añadas van antes o después.',
  bonos: 'Tu bono y accesos rápidos se mantienen siempre visibles; los bloques que añadas van antes o después.',
};

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

function ConfigGaleria({ config, onChange }: { config: GaleriaConfig; onChange: (c: GaleriaConfig) => void }) {
  function setImagen(i: number, campo: 'url' | 'alt', valor: string) {
    const imagenes = config.imagenes.map((img, idx) => (idx === i ? { ...img, [campo]: valor } : img));
    onChange({ ...config, imagenes });
  }
  return (
    <div className="space-y-2">
      {config.imagenes.map((img, i) => (
        <div key={i} className="space-y-1 border-l-2 border-border pl-2.5">
          <input className={inputCls} value={img.url} onChange={(e) => setImagen(i, 'url', e.target.value)} placeholder="https://…" />
          <input className={inputCls} value={img.alt} onChange={(e) => setImagen(i, 'alt', e.target.value)} placeholder="Texto alternativo" />
          <button onClick={() => onChange({ ...config, imagenes: config.imagenes.filter((_, idx) => idx !== i) })} className="text-[11.5px] font-semibold text-destructive">Quitar imagen</button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...config, imagenes: [...config.imagenes, { url: '', alt: '' }] })}
        className="text-[12px] font-semibold text-brand-medio"
      >
        + Añadir imagen
      </button>
    </div>
  );
}
function ConfigVideo({ config, onChange }: { config: VideoConfig; onChange: (c: VideoConfig) => void }) {
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>Título (opcional)</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      <div><span className={labelCls}>URL de YouTube o Vimeo</span><input className={inputCls} value={config.url} onChange={(e) => onChange({ ...config, url: e.target.value })} placeholder="https://youtube.com/watch?v=…" /></div>
    </div>
  );
}
function ConfigTestimonios({ config, onChange }: { config: TestimoniosConfig; onChange: (c: TestimoniosConfig) => void }) {
  function setTestimonio(i: number, campo: 'cita' | 'autor' | 'rol', valor: string) {
    const testimonios = config.testimonios.map((te, idx) => (idx === i ? { ...te, [campo]: valor } : te));
    onChange({ ...config, testimonios });
  }
  return (
    <div className="space-y-2">
      <div><span className={labelCls}>Título (opcional)</span><input className={inputCls} value={config.titulo} onChange={(e) => onChange({ ...config, titulo: e.target.value })} /></div>
      {config.testimonios.map((te, i) => (
        <div key={i} className="space-y-1 border-l-2 border-border pl-2.5">
          <textarea className={`${inputCls} min-h-14`} value={te.cita} onChange={(e) => setTestimonio(i, 'cita', e.target.value)} placeholder="Cita" />
          <input className={inputCls} value={te.autor} onChange={(e) => setTestimonio(i, 'autor', e.target.value)} placeholder="Autora" />
          <input className={inputCls} value={te.rol} onChange={(e) => setTestimonio(i, 'rol', e.target.value)} placeholder="Rol (opcional)" />
          <button onClick={() => onChange({ ...config, testimonios: config.testimonios.filter((_, idx) => idx !== i) })} className="text-[11.5px] font-semibold text-destructive">Quitar testimonio</button>
        </div>
      ))}
      <button
        onClick={() => onChange({ ...config, testimonios: [...config.testimonios, { cita: '', autor: '', rol: '' }] })}
        className="text-[12px] font-semibold text-brand-medio"
      >
        + Añadir testimonio
      </button>
    </div>
  );
}

function ConfigForm({ bloque, onChange }: { bloque: BloqueHome; onChange: (b: BloqueHome) => void }) {
  if (bloque.kind === 'sistema') return null;
  if (bloque.kind === 'banner') return <ConfigBanner config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'texto') return <ConfigTexto config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'cta') return <ConfigCta config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'faq') return <ConfigFaq config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'galeria') return <ConfigGaleria config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  if (bloque.kind === 'video') return <ConfigVideo config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
  return <ConfigTestimonios config={bloque.config} onChange={(config) => onChange({ ...bloque, config })} />;
}

function ColorFieldMini({ label, value, onChange }: { label: string; value: string | null | undefined; onChange: (v: string | null) => void }) {
  const hexValido = !!value && /^#([0-9a-fA-F]{6})$/.test(value);
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] font-medium text-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Del tema"
          className="w-24 text-[12px] font-mono px-2 py-1.5 rounded-lg border border-border bg-background"
          aria-label={label}
        />
        <input
          type="color"
          value={hexValido ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-lg border border-border cursor-pointer bg-transparent"
          aria-label={`Selector de ${label}`}
        />
        {value && (
          <button type="button" onClick={() => onChange(null)} className="text-[11px] text-muted-foreground hover:text-destructive" aria-label={`Quitar ${label}`}>
            <Trash2 size={13} />
          </button>
        )}
      </span>
    </label>
  );
}

const ALINEACION_OPCIONES: { id: NonNullable<EstiloBloque['alineacion']>; label: string }[] = [
  { id: 'izquierda', label: 'Izquierda' }, { id: 'centro', label: 'Centro' }, { id: 'derecha', label: 'Derecha' },
];
const ESPACIADO_OPCIONES: { id: NonNullable<EstiloBloque['espaciado']>; label: string }[] = [
  { id: 'compacto', label: 'Compacto' }, { id: 'normal', label: 'Normal' }, { id: 'amplio', label: 'Amplio' },
];
const TAMANO_TEXTO_OPCIONES: { id: NonNullable<EstiloBloque['tamanoTexto']>; label: string }[] = [
  { id: 'pequeno', label: 'Pequeño' }, { id: 'normal', label: 'Normal' }, { id: 'grande', label: 'Grande' },
];
const ESQUINAS_OPCIONES: { id: NonNullable<EstiloBloque['esquinas']>; label: string }[] = [
  { id: 'ninguna', label: 'Recta' }, { id: 'suave', label: 'Suave' }, { id: 'redondeada', label: 'Redonda' }, { id: 'pill', label: 'Cápsula' },
];
const SOMBRA_OPCIONES: { id: NonNullable<EstiloBloque['sombra']>; label: string }[] = [
  { id: 'ninguna', label: 'Ninguna' }, { id: 'suave', label: 'Suave' }, { id: 'marcada', label: 'Marcada' },
];
const ANCHO_OPCIONES: { id: NonNullable<EstiloBloque['ancho']>; label: string }[] = [
  { id: 'completo', label: 'Completo' }, { id: 'contenido', label: 'Con margen' },
];

/** Fila de botones reutilizada por cada campo enum de EstiloBloque. */
function FilaOpciones<T extends string>({
  etiqueta, opciones, activa, onElegir,
}: { etiqueta: string; opciones: { id: T; label: string }[]; activa: T; onElegir: (id: T) => void }) {
  return (
    <div>
      <span className="text-[12.5px] font-medium text-foreground block mb-1.5">{etiqueta}</span>
      <div className="flex gap-2 flex-wrap">
        {opciones.map((op) => (
          <button
            key={op.id}
            type="button"
            onClick={() => onElegir(op.id)}
            className={`flex-1 text-[12px] font-semibold py-1.5 px-2 rounded-lg border transition-colors ${
              activa === op.id ? 'border-brand bg-brand text-brand-foreground' : 'border-border text-foreground'
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Estilo PROPIO de la sección — pisa el tema global solo para este bloque.
// Solo aplica a bloques del catálogo (banner/texto/cta/faq): los `sistema`
// son UI de producto, no contenido de la propietaria, y ConfigForm ya los
// filtra devolviendo null — este panel hace lo mismo por el mismo motivo.
function EstiloForm({ bloque, onChange }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; onChange: (b: BloqueHome) => void }) {
  const estilo: EstiloBloque = bloque.estilo ?? {};
  function setEstilo(cambios: Partial<EstiloBloque>) {
    onChange({ ...bloque, estilo: { ...estilo, ...cambios } });
  }
  return (
    <div className="space-y-3 border-t border-border pt-3 mt-3">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Estilo de esta sección</p>
      <p className="text-[11px] text-muted-foreground -mt-1">Pisa el tema global solo aquí. Vacío = hereda del tema.</p>
      <ColorFieldMini label="Fondo" value={estilo.fondo} onChange={(v) => setEstilo({ fondo: v })} />
      <ColorFieldMini label="Texto" value={estilo.color} onChange={(v) => setEstilo({ color: v })} />
      <FilaOpciones etiqueta="Alineación" opciones={ALINEACION_OPCIONES} activa={estilo.alineacion ?? 'izquierda'} onElegir={(v) => setEstilo({ alineacion: v })} />
      <FilaOpciones etiqueta="Espaciado" opciones={ESPACIADO_OPCIONES} activa={estilo.espaciado ?? 'normal'} onElegir={(v) => setEstilo({ espaciado: v })} />
      <FilaOpciones etiqueta="Tamaño del texto" opciones={TAMANO_TEXTO_OPCIONES} activa={estilo.tamanoTexto ?? 'normal'} onElegir={(v) => setEstilo({ tamanoTexto: v })} />
      <FilaOpciones etiqueta="Esquinas" opciones={ESQUINAS_OPCIONES} activa={estilo.esquinas ?? 'redondeada'} onElegir={(v) => setEstilo({ esquinas: v })} />
      <FilaOpciones etiqueta="Sombra" opciones={SOMBRA_OPCIONES} activa={estilo.sombra ?? 'ninguna'} onElegir={(v) => setEstilo({ sombra: v })} />
      <FilaOpciones etiqueta="Ancho" opciones={ANCHO_OPCIONES} activa={estilo.ancho ?? 'completo'} onElegir={(v) => setEstilo({ ancho: v })} />
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

  return {
    rol, bloquesPorPantalla, bloques, estado, guardando, publicando, aviso,
    onDragEnd, toggle, eliminar, cambiar, anadir, guardar, publicar, restaurar,
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
