'use client';

import { useEffect, useState } from 'react';
import {
  GripVertical, Eye, EyeOff, Plus, Trash2,
  Image as ImageIcon, Type, MousePointerClick, HelpCircle,
  GalleryHorizontal, Video, Quote, type LucideIcon, ChevronUp, ChevronDown, Copy } from 'lucide-react';
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
import { fetchBloquesBorrador, fetchBloquesBorradorTodas, guardarBloquesBorradorApi, publicarBloquesApi } from '@/lib/api-client';
import {
  BLOCK_CATALOG, DEFAULT_BLOQUES_POR_PANTALLA, BLOQUE_SISTEMA_LABEL, PANTALLA_IDS, getBlockCatalogEntry,
  getDefinicionBloque, CAMPOS_ESTILO, DEFINICIONES_CATALOGO,
  type BloqueHome, type PantallaId, type EstiloBloque,
  esBloqueFijo, admiteHijo, type BloqueHijo, type BloqueTipoCatalogo,
} from '@/lib/portal-home-bloques';
import { CamposForm } from '@/components/theme/inspector/campos-form';
import { desdeArray, aArray, duplicar as duplicarEnDoc } from '@/lib/theme/documento';
import { uid } from '@/lib/utils';
import {
  crearHistorial, registrar, deshacer, rehacer, puedeDeshacer, puedeRehacer,
} from '@/lib/theme/editor-historial';
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

/**
 * La segunda línea de la fila: qué hace ese bloque, en gris y pequeño.
 *
 * Existe porque hasta ahora la explicación iba metida DENTRO del nombre y la
 * lista se leía fatal —«Retos (carrusel con conteo real de apuntadas y botón
 * Apuntarme)» ocupaba tres renglones—. La información no sobraba; sobraba
 * tenerla al mismo peso que el nombre.
 */
function descripcionDe(b: BloqueHome): string | undefined {
  return getDefinicionBloque(b.kind === 'sistema' ? b.sistemaId : b.kind)?.descripcion;
}

// El panel de configuración de un bloque ya no se escribe: sale de su schema
// (REGISTRO_BLOQUES → `campos`) a través del Inspector genérico. Antes esto
// eran siete componentes de formulario más una cadena de siete `if`, con la
// forma de cada bloque duplicada respecto al tipo, al zod y al render.
function ConfigForm({ bloque, onChange }: { bloque: BloqueHome; onChange: (b: BloqueHome, campoId?: string) => void }) {
  // El registro se busca por `sistemaId` en los módulos de producto y por
  // `kind` en el catálogo — es la misma clave del registro, ver ClaveBloque.
  const def = getDefinicionBloque(bloque.kind === 'sistema' ? bloque.sistemaId : bloque.kind);
  if (!def || def.campos.length === 0) return null;
  return (
    <CamposForm
      campos={def.campos}
      valores={(bloque.config ?? {}) as Record<string, unknown>}
      // Los repetidores (preguntas, imágenes, testimonios) van sin rótulo
      // encima, igual que antes: dentro de la lista el marcador de cada
      // casilla ya dice qué es, y un "Preguntas" suelto solo añadía ruido.
      etiquetaListaSinTitulo
      // El id del bloque nombra los ficheros que se suban desde este panel:
      // dos banners distintos tienen que poder tener fotos distintas, y sin
      // esto el segundo pisaría la del primero.
      prefijoSubida={bloque.id}
      onChange={(config, campoId) => onChange({ ...bloque, config } as BloqueHome, campoId)}
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
function EstiloForm({ bloque, onChange }: { bloque: Exclude<BloqueHome, { kind: 'sistema' }>; onChange: (b: BloqueHome, campoId?: string) => void }) {
  return (
    <div className="space-y-3 border-t border-border pt-3 mt-3">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Estilo de esta sección</p>
      <p className="text-[11px] text-muted-foreground -mt-1">Pisa el tema global solo aquí. Vacío = hereda del tema.</p>
      <CamposForm
        campos={getDefinicionBloque(bloque.kind)?.camposEstilo ?? CAMPOS_ESTILO}
        valores={(bloque.estilo ?? {}) as Record<string, unknown>}
        // El estilo se GUARDA solo, pero sus condiciones miran también la
        // config del bloque (ver `valoresCondicion`): el fondo de un banner
        // depende de si hay foto.
        valoresCondicion={{ ...(bloque.config as Record<string, unknown>), ...(bloque.estilo ?? {}) }}
        onChange={(estilo, campoId) => onChange({ ...bloque, estilo: estilo as EstiloBloque }, `estilo:${campoId}`)}
      />
    </div>
  );
}

function Fila({
  bloque, activa, onSeleccionar, onToggle, onDelete, onDuplicar,
}: {
  bloque: BloqueHome; activa: boolean; onSeleccionar: () => void; onToggle: () => void;
  onDelete?: () => void; onDuplicar?: () => void;
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
      {/* ⚠️ `aria-label` explícito con SOLO el nombre. Sin él, el nombre
          accesible del botón pasa a ser «Texto Un bloque de texto libre, con
          título opcional.» —la concatenación de las dos líneas— y cualquier
          `getByRole('button', { name: 'Texto', exact: true })` deja de
          encontrarlo. Lo cazó CI. Aparte del test, es lo correcto: al tabular
          por la lista interesa oír el nombre del bloque, no su descripción
          repetida en cada fila. */}
      <button type="button" onClick={onSeleccionar} aria-label={labelDe(bloque)} className="flex-1 text-left min-w-0">
        <span className={`block text-[13px] font-medium truncate ${bloque.oculto ? 'text-muted-foreground/50 line-through' : 'text-foreground'}`}>
          {labelDe(bloque)}
        </span>
        {/* Se corta con puntos suspensivos en vez de envolver: una fila de
            altura fija hace que la lista se pueda recorrer con la vista. El
            texto entero sigue disponible en el `title`. */}
        {descripcionDe(bloque) && !bloque.oculto && (
          <span className="block text-[11px] text-muted-foreground truncate" title={descripcionDe(bloque)}>
            {descripcionDe(bloque)}
          </span>
        )}
      </button>
      <button onClick={onToggle} title={bloque.oculto ? 'Mostrar' : 'Ocultar'} className="text-muted-foreground hover:text-foreground" aria-label={bloque.oculto ? `Mostrar ${labelDe(bloque)}` : `Ocultar ${labelDe(bloque)}`}>
        {bloque.oculto ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      {onDuplicar && (
        <button onClick={onDuplicar} title="Duplicar" className="text-muted-foreground hover:text-foreground" aria-label={`Duplicar ${labelDe(bloque)}`}>
          <Copy size={16} />
        </button>
      )}
      {onDelete && (
        <button onClick={onDelete} title="Eliminar" className="text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${labelDe(bloque)}`}>
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

// Estado + persistencia de los bloques de las TRES pantallas del portal.
//
// Una sola instancia, no una por pantalla. Antes se montaba tres veces —una
// por Inicio/Clases/Bonos— con el argumento de que así podían estar las tres
// desplegadas a la vez en el rail; pero cada instancia ya cargaba LAS TRES
// pantallas de todos modos, así que eran nueve peticiones para los datos de
// tres, y tres copias independientes del mismo estado. No llegaban a
// divergir de milagro: cada copia solo se leía para su propia pantalla.
//
// Ahora las operaciones reciben la `pantalla` sobre la que actúan, que los
// componentes ya tienen como prop.
export function useBloquesEditor() {
  const { rol } = usePermisos();
  // El estado de las tres pantallas vive DENTRO de un historial. Todas las
  // mutaciones pasan por `setBloques`, así que hay un único punto donde
  // registrar un paso — por eso aquí no hace falta el `ref` de "estoy
  // aplicando un undo" que haría falta si el historial observara varios
  // hooks separados: deshacer no dispara ningún setter, cambia `presente`.
  const [hist, setHist] = useState(() => crearHistorial(DEFAULT_BLOQUES_POR_PANTALLA));
  const bloquesPorPantalla = hist.presente;
  const [estado, setEstado] = useState<'cargando' | 'listo'>('cargando');
  const [guardando, setGuardando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    // Una petición para las tres pantallas, no tres. Ver
    // `fetchBloquesBorradorTodas`: salen de la misma lectura del layout, y en
    // este panel cada viaje cuesta ~140 ms en caliente y hasta 7,8 s en frío.
    fetchBloquesBorradorTodas()
      .then((todas) => PANTALLA_IDS.map((p) => todas[p]))
      .catch(() => PANTALLA_IDS.map(() => null))
      .then((resultados) => {
        if (!vivo) return;
        // La carga inicial NO es una edición: reemplaza la base del historial
        // en vez de apilar un paso. Si apilara, la primera pulsación de
        // deshacer devolvería a los bloques de fábrica en vez de a lo que la
        // propietaria tenía guardado.
        setHist((h) => {
          const siguiente = { ...h.presente };
          PANTALLA_IDS.forEach((p, i) => {
            const r = resultados[i];
            if (r && r.length > 0) siguiente[p] = r;
          });
          return crearHistorial(siguiente);
        });
      })
      .finally(() => { if (vivo) setEstado('listo'); });
    return () => { vivo = false; };
  }, []);

  function bloquesDe(pantalla: PantallaId) {
    return bloquesPorPantalla[pantalla];
  }
  /**
   * `clave` identifica el campo que se está tocando, para que escribir un
   * título sea UN paso y no una letra por pulsación. Las acciones discretas
   * —reordenar, ocultar, añadir, eliminar— la dejan vacía a propósito: cada
   * una es su propio paso aunque vayan seguidas.
   */
  function setBloques(pantalla: PantallaId, actualizar: (prev: BloqueHome[]) => BloqueHome[], clave?: string) {
    setHist((h) => registrar(h, { ...h.presente, [pantalla]: actualizar(h.presente[pantalla]) }, { clave }));
  }

  function onDragEnd(pantalla: PantallaId, e: DragEndEvent) {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setBloques(pantalla, (prev) => arrayMove(prev, prev.findIndex((b) => b.id === active.id), prev.findIndex((b) => b.id === over.id)));
      setAviso(null);
    }
  }

  function toggle(pantalla: PantallaId, id: string) {
    setBloques(pantalla, (prev) => prev.map((b) => (b.id === id ? { ...b, oculto: !b.oculto } : b)));
    setAviso(null);
  }

  /**
   * Duplica un bloque justo detrás del original. Pasa por `lib/theme/documento`
   * en vez de manipular el array a mano: ahí está la regla de que los HIJOS
   * también reciben ids nuevos, que es la parte fácil de olvidar — si la
   * copia compartiera los ids de sus hijos, seleccionar uno marcaría los dos.
   */
  function duplicar(pantalla: PantallaId, id: string): string | null {
    let nuevoIdCreado: string | null = null;
    setBloques(pantalla, (prev) => {
      const r = duplicarEnDoc(desdeArray(prev), id, uid);
      nuevoIdCreado = r.id;
      return aArray(r.doc);
    });
    setAviso(null);
    return nuevoIdCreado;
  }

  function eliminar(pantalla: PantallaId, id: string) {
    setBloques(pantalla, (prev) => prev.filter((b) => b.id !== id));
    setAviso(null);
  }

  function cambiar(pantalla: PantallaId, actualizado: BloqueHome, campoId?: string) {
    setBloques(
      pantalla,
      (prev) => prev.map((b) => (b.id === actualizado.id ? actualizado : b)),
      campoId ? `${pantalla}:${actualizado.id}:${campoId}` : undefined,
    );
    setAviso(null);
  }

  // ── Hijos ────────────────────────────────────────────────────────────────
  // Todas pasan por `setBloques`, así que entran en el historial igual que
  // cualquier otra edición: deshacer alcanza a los hijos sin nada extra.
  function conHijos(pantalla: PantallaId, padreId: string, f: (hijos: BloqueHijo[]) => BloqueHijo[], clave?: string) {
    setBloques(pantalla, (prev) => prev.map((b) => (
      b.id === padreId && b.kind !== 'sistema' ? { ...b, hijos: f(b.hijos ?? []) } : b
    )), clave);
    setAviso(null);
  }

  function anadirHijo(pantalla: PantallaId, padreId: string, kind: BloqueTipoCatalogo): string | null {
    const padre = bloquesDe(pantalla).find((b) => b.id === padreId);
    const def = padre && padre.kind !== 'sistema' ? getDefinicionBloque(padre.kind) : undefined;
    const entry = getBlockCatalogEntry(kind);
    // Se comprueba aquí, no solo en el picker: el `max` y la whitelist son del
    // MODELO, y la lectura tolerante los volvería a aplicar al recargar —
    // añadir uno de más se perdería en silencio al guardar.
    if (!padre || padre.kind === 'sistema' || !def || !entry || !admiteHijo(def, kind)) return null;
    if ((padre.hijos ?? []).length >= (def.hijos?.max ?? Infinity)) return null;
    const nuevo = { id: uid(), kind, config: entry.defaultConfig } as BloqueHijo;
    conHijos(pantalla, padreId, (hijos) => [...hijos, nuevo]);
    return nuevo.id;
  }

  function eliminarHijo(pantalla: PantallaId, padreId: string, hijoId: string) {
    conHijos(pantalla, padreId, (hijos) => hijos.filter((h) => h.id !== hijoId));
  }

  /** Sube (-1) o baja (+1) un hijo. Botones y no arrastre: dentro de un rail
   *  de 272 px, un drop anidado es difícil de acertar y no es accesible por
   *  teclado. El arrastre de primer nivel se queda como está. */
  function moverHijo(pantalla: PantallaId, padreId: string, hijoId: string, delta: -1 | 1) {
    conHijos(pantalla, padreId, (hijos) => {
      const i = hijos.findIndex((h) => h.id === hijoId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= hijos.length) return hijos;
      const copia = [...hijos];
      [copia[i], copia[j]] = [copia[j]!, copia[i]!];
      return copia;
    });
  }

  function cambiarHijo(pantalla: PantallaId, padreId: string, actualizado: BloqueHijo, campoId?: string) {
    conHijos(pantalla, padreId, (hijos) => hijos.map((h) => (h.id === actualizado.id ? actualizado : h)),
      campoId ? `${pantalla}:${actualizado.id}:${campoId}` : undefined);
  }

  /** Dónde está un id: suelto arriba, o dentro de un contenedor. */
  function localizar(pantalla: PantallaId, id: string | null): { bloque: BloqueHome; padreId: string | null } | null {
    if (!id) return null;
    for (const b of bloquesDe(pantalla)) {
      if (b.id === id) return { bloque: b, padreId: null };
      if (b.kind !== 'sistema') {
        const hijo = (b.hijos ?? []).find((h) => h.id === id);
        if (hijo) return { bloque: hijo as BloqueHome, padreId: b.id };
      }
    }
    return null;
  }

  /**
   * `indice` es dónde cae el bloque nuevo. Sin él, al final — que es lo que
   * hace el botón "Añadir bloque" del rail. Con él, en el hueco que se pulsó
   * en la vista previa.
   */
  /**
   * `configPreset` es un PARCHE sobre los defaults del schema, no un objeto
   * completo: así un campo nuevo aparece en todos los presets sin tocarlos
   * uno a uno, y un preset viejo nunca deja un hueco sin rellenar.
   */
  function anadir(
    pantalla: PantallaId,
    kind: (typeof BLOCK_CATALOG)[number]['kind'],
    indice?: number,
    configPreset?: Record<string, unknown>,
  ): string | null {
    const entry = getBlockCatalogEntry(kind);
    if (!entry) return null;
    const nuevo = { id: uid(), kind, config: { ...entry.defaultConfig, ...(configPreset ?? {}) } } as BloqueHome;
    setBloques(pantalla, (prev) => {
      if (indice == null) return [...prev, nuevo];
      // Acotado a propósito: un índice fuera de rango (medidas viejas tras
      // borrar un bloque) mete el bloque en un extremo en vez de perderlo.
      const i = Math.max(0, Math.min(indice, prev.length));
      return [...prev.slice(0, i), nuevo, ...prev.slice(i)];
    });
    setAviso(null);
    return nuevo.id;
  }

  async function guardar(pantalla: PantallaId) {
    setGuardando(true);
    setAviso(null);
    try {
      await guardarBloquesBorradorApi(pantalla, bloquesDe(pantalla));
      setAviso({ tipo: 'ok', texto: 'Borrador guardado. Tus clientas no lo ven todavía.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setGuardando(false);
    }
  }

  async function publicar(pantalla: PantallaId) {
    setPublicando(true);
    setAviso(null);
    try {
      await guardarBloquesBorradorApi(pantalla, bloquesDe(pantalla));
      await publicarBloquesApi(pantalla);
      setAviso({ tipo: 'ok', texto: '¡Publicado! Ya lo ven tus clientas.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeSeguro((e as Error).message, ERROR_RED) });
    } finally {
      setPublicando(false);
    }
  }

  function restaurar(pantalla: PantallaId) {
    setBloques(pantalla, () => DEFAULT_BLOQUES_POR_PANTALLA[pantalla]);
    setAviso(null);
  }

  // "Deshacer" del editor a pantalla completa: relee el borrador de ESTA
  // pantalla desde el servidor, descartando ediciones locales — distinto de
  // `restaurar()`, que vacía a los bloques `sistema` de fábrica.
  // Descartar TODO lo editado en esta pantalla y releer del servidor. No es un
  // paso del historial: es tirar el historial. Por eso reemplaza la base.
  function descartarCambios(pantalla: PantallaId) {
    fetchBloquesBorrador(pantalla)
      .then((r) => setHist((h) => crearHistorial({ ...h.presente, [pantalla]: r })))
      .catch(() => {});
    setAviso(null);
  }

  return {
    rol, bloquesPorPantalla, bloquesDe, estado, guardando, publicando, aviso,
    onDragEnd, toggle, eliminar, duplicar, cambiar, anadir, guardar, publicar, restaurar,
    anadirHijo, eliminarHijo, moverHijo, cambiarHijo, localizar,
    descartarCambios,
    // Deshacer/rehacer de verdad, sobre las tres pantallas a la vez: "lo
    // último que hice" no entiende de en qué pantalla estaba.
    deshacer: () => setHist(deshacer),
    rehacer: () => setHist(rehacer),
    puedeDeshacer: puedeDeshacer(hist),
    puedeRehacer: puedeRehacer(hist),
    // Para que la barra superior sepa cuál de las dos pilas (esta o la de los
    // ajustes del tema) tiene el paso más reciente — ver `pilaADeshacer`.
    instanteUltimo: hist.instanteUltima,
  };
}


/**
 * Lo que se ofrece en el picker: un bloque sin `presets` da una tarjeta; uno
 * con `presets` da una por preset.
 *
 * Puro y exportado para poder testearlo: es la única pieza donde «cuántas
 * tarjetas salen» se decide, y equivocarse aquí es ofrecer un bloque que no
 * existe o esconder uno que sí.
 */
export function opcionesDelCatalogo(
  soloKinds?: (kind: BloqueTipoCatalogo) => boolean,
): { kind: BloqueTipoCatalogo; nombre: string; descripcion?: string; icono: string; config?: Record<string, unknown> }[] {
  return DEFINICIONES_CATALOGO
    .filter((d): boolean => !soloKinds || soloKinds(d.id as BloqueTipoCatalogo))
    .flatMap((d) => {
      const kind = d.id as BloqueTipoCatalogo;
      if (!d.presets?.length) {
        return [{ kind, nombre: d.nombre, descripcion: d.descripcion, icono: d.icono }];
      }
      return d.presets.map((p) => ({
        kind,
        nombre: p.nombre,
        // La del preset si la trae; si no, la del bloque — nunca vacío.
        descripcion: p.descripcion ?? d.descripcion,
        icono: d.icono,
        config: p.config,
      }));
    });
}

/**
 * El catálogo de bloques. Extraído porque ahora tiene DOS puntos de entrada —
 * el botón "Añadir bloque" del rail y el "+" entre secciones de la vista
 * previa— y una segunda copia se separaría de la primera en cuanto se añada
 * un bloque nuevo.
 */
export function CatalogoBloques({
  onElegir, onCerrar, ancla, soloKinds,
}: {
  onElegir: (kind: (typeof BLOCK_CATALOG)[number]['kind'], config?: Record<string, unknown>) => void;
  onCerrar: () => void;
  /** Filtra el catálogo. Sin esto, entero — que es el caso del rail. Al
   *  añadir DENTRO de un contenedor se pasa su whitelist, así que no se puede
   *  elegir algo que el modelo iba a descartar luego en silencio. */
  soloKinds?: (kind: (typeof BLOCK_CATALOG)[number]['kind']) => boolean;
  /** Colocación cuando se abre desde el preview y no desde el rail. */
  ancla?: React.CSSProperties;
}) {
  return (
    <>
      <button className="fixed inset-0 z-20 cursor-default" onClick={onCerrar} aria-hidden tabIndex={-1} />
      <div
        className={`${ancla ? 'fixed' : 'absolute left-0 top-11'} z-30 w-72 rounded-xl border border-border bg-card shadow-lg p-2 grid grid-cols-2 gap-2`}
        style={ancla}
        role="dialog"
        aria-label="Elegir una sección"
      >
        {/* Una tarjeta por PRESET, no por bloque.
            ────────────────────────────────────────────────────────────────
            Antes «Banner» era una sola tarjeta que daba siempre el mismo
            banner vacío: la propietaria tenía que adivinar qué combinación
            de campos hacía cada aspecto. Ahora el mismo `kind` puede
            ofrecer varios puntos de partida con nombre («Banner con foto»,
            «Solo texto», «Con botón») — mismo render, distinto arranque.
            Un bloque sin `presets` sigue dando una sola tarjeta, como
            siempre. */}
        {opcionesDelCatalogo(soloKinds).map((op) => {
          const Icono = ICONOS[op.icono] ?? Plus;
          return (
            <button
              key={`${op.kind}:${op.nombre}`}
              onClick={() => onElegir(op.kind, op.config)}
              className="flex flex-col items-start gap-1 p-2.5 rounded-lg border border-border hover:bg-muted text-left"
            >
              <Icono size={16} className="text-brand-medio" />
              <span className="text-[12.5px] font-semibold text-foreground">{op.nombre}</span>
              <span className="text-[11px] text-muted-foreground">{op.descripcion}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BloquesSeccionesList({
  hook, pantalla, seleccionId, onSeleccionar,
}: {
  hook: ReturnType<typeof useBloquesEditor>;
  pantalla: PantallaId;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const todos = hook.bloquesDe(pantalla);
  // Los FIJOS van aparte y arriba: son el saludo y la tarjeta grande, que se
  // editan pero no se mueven ni se ocultan. Meterlos en la lista arrastrable
  // pintaría una agarradera y un ojo que no hacen nada.
  // Se pregunta al BLOQUE, no a una tabla por pantalla: así el rail no
  // puede consultar la pantalla equivocada, que es como se coló el bug de
  // los bloques fijos invisibles.
  const fijos = todos.filter(esBloqueFijo);
  const bloques = todos.filter((b) => !esBloqueFijo(b));
  const [picker, setPicker] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="space-y-3">
      {fijos.length > 0 && (
        <div className="space-y-1">
          {fijos.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSeleccionar(b.id)}
              className={`w-full flex items-center gap-2 rounded-xl border p-2.5 text-left ${seleccionId === b.id ? 'border-brand bg-brand/5' : 'border-border'}`}
            >
              <span className="text-[12.5px] font-medium text-foreground flex-1">{labelDe(b)}</span>
              <span className="text-[10.5px] text-muted-foreground/70">siempre arriba</span>
            </button>
          ))}
        </div>
      )}

      <p className="text-[12.5px] text-muted-foreground">
        Arrastra para reordenar, usa el ojo para ocultar, y añade bloques nuevos del catálogo. {DESCRIPCION_PANTALLA[pantalla]}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => hook.onDragEnd(pantalla, e)}>
        <SortableContext items={bloques.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {bloques.map((b) => (
              <div key={b.id} className="space-y-1">
              <Fila
                bloque={b}
                activa={seleccionId === b.id}
                onSeleccionar={() => onSeleccionar(b.id)}
                onToggle={() => hook.toggle(pantalla, b.id)}
                onDelete={b.kind === 'sistema' ? undefined : () => hook.eliminar(pantalla, b.id)}
                // Un bloque de SISTEMA no se duplica: es un módulo de producto,
                // no contenido. Dos "Esta semana" no significan nada.
                onDuplicar={b.kind === 'sistema' ? undefined : () => { const id = hook.duplicar(pantalla, b.id); if (id) onSeleccionar(id); }}
              />
              {/* Los hijos cuelgan del padre, sangrados. Solo aparecen si el
                  bloque admite hijos — para los demás no cambia nada. */}
              <HijosDe hook={hook} pantalla={pantalla} padre={b} seleccionId={seleccionId} onSeleccionar={onSeleccionar} />
              </div>
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
          <CatalogoBloques
            onCerrar={() => setPicker(false)}
            onElegir={(kind, config) => { const id = hook.anadir(pantalla, kind, undefined, config); setPicker(false); if (id) onSeleccionar(id); }}
          />
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

/**
 * Los hijos de un contenedor, en el rail. Sangrados bajo su padre y con su
 * propio "Añadir dentro" — así queda claro DÓNDE va a caer el bloque nuevo,
 * que es lo primero que se pierde cuando un editor mezcla niveles.
 */
function HijosDe({ hook, pantalla, padre, seleccionId, onSeleccionar }: {
  hook: ReturnType<typeof useBloquesEditor>;
  pantalla: PantallaId;
  padre: BloqueHome;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  if (padre.kind === 'sistema') return null;
  const def = getDefinicionBloque(padre.kind);
  if (!def?.hijos) return null;
  const hijos = padre.hijos ?? [];
  const lleno = hijos.length >= (def.hijos.max ?? Infinity);
  return (
    <div className="ml-5 pl-3 border-l border-border space-y-1">
      {hijos.map((h, i) => (
        <div key={h.id} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${seleccionId === h.id ? 'border-brand bg-brand/5' : 'border-border bg-card'}`}>
          <button type="button" onClick={() => onSeleccionar(h.id)} className="flex-1 text-left text-[12.5px] text-foreground">
            {labelDe(h as BloqueHome)}
          </button>
          <button onClick={() => hook.moverHijo(pantalla, padre.id, h.id, -1)} disabled={i === 0}
            aria-label={`Subir ${labelDe(h as BloqueHome)}`} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronUp size={14} />
          </button>
          <button onClick={() => hook.moverHijo(pantalla, padre.id, h.id, 1)} disabled={i === hijos.length - 1}
            aria-label={`Bajar ${labelDe(h as BloqueHome)}`} className="text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronDown size={14} />
          </button>
          <button onClick={() => hook.eliminarHijo(pantalla, padre.id, h.id)}
            aria-label={`Eliminar ${labelDe(h as BloqueHome)}`} className="text-muted-foreground hover:text-destructive">
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div className="relative">
        <button
          onClick={() => setPicker((v) => !v)}
          disabled={lleno}
          className="flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-1.5 rounded-lg border border-dashed border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Plus size={13} /> {lleno ? `Máximo ${def.hijos.max}` : `Añadir dentro de ${def.nombre}`}
        </button>
        {picker && (
          <CatalogoBloques
            soloKinds={(k) => admiteHijo(def, k)}
            onCerrar={() => setPicker(false)}
            onElegir={(kind) => { const id = hook.anadirHijo(pantalla, padre.id, kind); setPicker(false); if (id) onSeleccionar(id); }}
          />
        )}
      </div>
    </div>
  );
}

export function BloquesConfigPanel({
  hook, pantalla, seleccionId,
}: {
  hook: ReturnType<typeof useBloquesEditor>;
  pantalla: PantallaId;
  seleccionId: string | null;
}) {
  // Busca también DENTRO de los contenedores: un hijo se configura igual
  // que cualquier bloque, solo cambia dónde se escribe el resultado.
  const encontrado = hook.localizar(pantalla, seleccionId);
  const bloque = encontrado?.bloque;
  const padreId = encontrado?.padreId ?? null;
  if (!bloque) return <p className="text-[13px] text-muted-foreground">Selecciona un bloque de la izquierda para configurarlo.</p>;
  // ⚠️ Aquí había un `return` en seco para los bloques de sistema: "no tiene
  // ajustes propios — solo se puede reordenar u ocultar". Como el estado por
  // defecto de las tres pantallas es 100 % bloques de sistema, ESA frase era
  // lo primero y lo único que veía una propietaria al abrir el editor.
  //
  // Ahora los que tienen campos abren su panel como cualquier otro. Los que
  // todavía no —su contenido sale entero de los datos del estudio— siguen
  // diciéndolo, pero sin `estilo`: el fondo y las esquinas de un módulo de
  // producto los decide el tema, no la propietaria bloque a bloque.
  const def = getDefinicionBloque(bloque.kind === 'sistema' ? bloque.sistemaId : bloque.kind);
  if (bloque.kind === 'sistema' && (!def || def.campos.length === 0)) {
    return <p className="text-[13px] text-muted-foreground">{labelDe(bloque)} se alimenta de los datos de tu estudio — aquí solo puedes reordenarlo u ocultarlo.</p>;
  }
  return (
    <div>
      <ConfigForm bloque={bloque} onChange={(b, campoId) => (padreId ? hook.cambiarHijo(pantalla, padreId, b as BloqueHijo, campoId) : hook.cambiar(pantalla, b, campoId))} />
      {bloque.kind !== 'sistema' && (
        <EstiloForm bloque={bloque} onChange={(b, campoId) => (padreId ? hook.cambiarHijo(pantalla, padreId, b as BloqueHijo, campoId) : hook.cambiar(pantalla, b, campoId))} />
      )}
    </div>
  );
}
