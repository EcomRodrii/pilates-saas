'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent, type Modifier, type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { btnPrimary, cardCls } from '@/components/configuracion/estilos';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PanelTipoClase } from '@/components/configuracion/panel-tipo-clase';
import { eliminarFotoClase, subirFotoClase, eliminarLogoClase, subirLogoClase } from '@/lib/portal-storage';
import { colorSalaPorDefecto } from '@/components/configuracion/tab-salas';
import { useStudio } from '@/lib/studio-context';
import { imagenDeClase } from '@/lib/imagenes-por-defecto';
import { urlServida } from '@/lib/student/imagen-servida';
import { TARJETAS_REGLAS, queCambiaElTipo, reglasGuardadas, type ReglasReserva } from '@/lib/configuracion/reglas-reserva';
import { reglasEfectivasDeTipo } from '@/lib/configuracion/linea-de-tiempo-reserva';
import { useRol } from '@/lib/permisos';
import { cambiosDeOrden, estaArchivado, hayOrdenGuardado, impactoDeArchivar, ordenarTipos, type ImpactoArchivar } from '@/lib/tipos-clase/orden-y-archivo';
import { DialogoArchivarTipo } from '@/components/configuracion/dialogo-archivar-tipo';
import {
  NIVEL_LABELS,
  camposParaGuardar,
  claseToForm,
  emptyClaseForm,
  plazasSiPropias,
  type ClaseForm,
} from '@/lib/configuracion/tipo-clase-form';
import type { PlanTarifa, TipoClase } from '@/lib/types';
import { cn, fechaCortaEstudio } from '@/lib/utils';
import { AlertTriangle, Archive, ChevronDown, Copy, GripVertical, Pencil, Plus, Ticket, Trash2, Undo2, Video } from 'lucide-react';

// Las reglas propias de un tipo, dichas como en «Cómo reservan mis alumnas»:
// UNA fuente (`queCambiaElTipo`), la misma que usa esa pantalla. Solo lo que
// CAMBIA de verdad: un valor propio igual al del estudio no le lleva la contraria
// a nadie, y un cargo propio distinto del del estudio se dice como es («no se
// cobra»), no como «Penalización 8 €» (el consentimiento es sobre el del estudio).
function reglasPropias(tc: TipoClase, estudio: ReglasReserva): string[] {
  return TARJETAS_REGLAS
    .map(id => queCambiaElTipo(id, tc, estudio))
    .filter((t): t is string => !!t)
    .map(t => t.charAt(0).toUpperCase() + t.slice(1));
}

/** Los planes y bonos activos que sirven para esta clase (sin clases marcadas = todas). */
function planesQueLaCubren(tc: TipoClase, planes: readonly PlanTarifa[]): string[] {
  return planes
    .filter(p => p.activo !== false && (!p.tiposClaseIds?.length || p.tiposClaseIds.includes(tc.id)))
    .map(p => p.nombre);
}

function enumerarCorto(nombres: readonly string[]): string {
  return nombres.length > 3 ? `${nombres.slice(0, 3).join(', ')} y ${nombres.length - 3} más` : nombres.join(', ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Un tipo de clase, como FILA de una lista que se ordena.
//
// Antes eran tarjetas en rejilla (dos o tres columnas): ahí no se lee un orden
// —¿va antes la de la derecha o la de abajo?— y el orden es justo lo que ahora
// se decide aquí, porque es el de los filtros por tipo que ve la alumna. Una
// columna lo dice sin explicarlo.
//
// Lo de la tarjeta se queda: la foto (lo que ve la alumna) ancla la fila, el
// nombre manda, una línea de datos duros (nivel · duración · plazas), «Entra
// en:» con los planes, y las reglas propias cortadas a 3 con un «+N» (enteras
// al abrir la clase). En pantalla ancha las acciones van a la derecha; en el
// móvil, debajo, a todo el ancho, para que quepan sin partirse.
// ─────────────────────────────────────────────────────────────────────────────
function FilaTipoClase({
  tc,
  estudio,
  planes,
  conAsa,
  quieta,
  onEditar,
  onDuplicar,
  onArchivar,
  onEliminar,
}: {
  tc: TipoClase;
  /** Las reglas del estudio; `null` sin cargar (no se dice qué cambia). */
  estudio: ReglasReserva | null;
  planes: readonly PlanTarifa[];
  /** Con el asa para arrastrar: no con un solo tipo, que no hay nada que ordenar. */
  conAsa: boolean;
  /** Mientras se guarda un orden: el asa se ve, pero no se deja arrastrar. */
  quieta: boolean;
  onEditar: () => void;
  onDuplicar: () => void;
  onArchivar: () => void;
  /** Sin esto no se enseña «Eliminar»: borrar un tipo es de la propietaria. */
  onEliminar?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: tc.id, disabled: !conAsa || quieta });
  const chips = estudio ? reglasPropias(tc, estudio) : [];
  const cubren = planesQueLaCubren(tc, planes);
  // Solo avisa si hace falta plan para reservarla, resuelto como en el servidor:
  // sin ese requisito, o sin nada a la venta (solo planes inactivos o la clase de
  // prueba), que ningún plan la incluya no le impide nada a nadie.
  const exigePlan = estudio ? reglasEfectivasDeTipo(estudio, tc, [...planes]).reservaExigirPlan : false;
  const visibles = chips.slice(0, 3);
  const ocultos = chips.length - visibles.length;
  // Las plazas solo si esta clase fija las suyas: si las hereda de la sala, la
  // cifra depende de dónde se programe y la tarjeta no puede prometerla.
  const meta = [NIVEL_LABELS[tc.nivel], `${tc.duracionMinutos} min`];
  const plazas = plazasSiPropias(String(tc.aforoPorDefecto ?? ''));
  if (plazas) meta.push(plazas);

  const accion = 'flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground';

  return (
    <li
      ref={setNodeRef}
      data-testid="fila-tipo-clase"
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative grid items-start gap-x-3 gap-y-2 bg-card px-3 py-3.5 first:rounded-t-xl last:rounded-b-xl sm:px-4',
        conAsa
          ? 'grid-cols-[auto_auto_minmax(0,1fr)] @2xl/config:grid-cols-[auto_auto_minmax(0,1fr)_auto]'
          : 'grid-cols-[auto_minmax(0,1fr)] @2xl/config:grid-cols-[auto_minmax(0,1fr)_auto]',
        isDragging && 'z-10 rounded-xl shadow-lg ring-1 ring-border',
      )}
    >
      {conAsa && (
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={quieta}
          aria-label={`Mover ${tc.nombre}`}
          className="-ml-1 flex h-11 w-7 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-wait disabled:opacity-40"
        >
          <GripVertical size={16} aria-hidden />
        </button>
      )}
      <div className="relative shrink-0">
        {/* El logo si lo hay (es cuadrado, como el hueco) y si no la foto;
            pedida al doble de su lado, no el banner entero de hasta 1600 px. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- ya redimensionada por Storage (urlServida), sin pasar por next/image */}
        <img
          src={urlServida(tc.logoUrl || imagenDeClase(tc), 88)}
          alt=""
          loading="lazy"
          decoding="async"
          width={44}
          height={44}
          className="h-11 w-11 rounded-lg border border-black/5 object-cover"
        />
        {/* El color sigue siendo el código con el que se lee la agenda: va
            sobre la foto, no en su lugar. */}
        <span
          className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card"
          style={{ backgroundColor: tc.color }}
          aria-hidden="true"
        />
      </div>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <span className="truncate">{tc.nombre}</span>
          {tc.esOnline && (
            <Video size={12} className="shrink-0 text-muted-foreground" aria-label="Clase online" />
          )}
        </p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{meta.join(' · ')}</p>
        {tc.descripcion && (
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">{tc.descripcion}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {cubren.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Ticket size={11} aria-hidden />Entra en: {enumerarCorto(cubren)}
            </span>
          ) : exigePlan ? (
            <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-foreground">
              <AlertTriangle size={11} aria-hidden />Ningún plan ni bono activo la incluye
            </span>
          ) : null}
          {estudio && (chips.length === 0 ? (
            <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Reglas del estudio</span>
          ) : (
            <>
              {visibles.map(chip => (
                <span key={chip} className="rounded border border-border px-1.5 py-0.5 text-xs font-medium text-foreground">{chip}</span>
              ))}
              {ocultos > 0 && (
                <span className="rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  +{ocultos} regla{ocultos === 1 ? '' : 's'} propia{ocultos === 1 ? '' : 's'}
                </span>
              )}
            </>
          ))}
        </div>
      </div>

      <div className={cn(
        '-mx-1 flex flex-wrap items-center gap-0.5 border-t border-border/60 pt-1.5 @2xl/config:col-span-1 @2xl/config:mx-0 @2xl/config:-mt-1 @2xl/config:border-t-0 @2xl/config:pt-0',
        conAsa ? 'col-span-3' : 'col-span-2',
      )}>
        <button onClick={onEditar} className={accion}>
          <Pencil size={12} aria-hidden />
          Editar
        </button>
        <button onClick={onDuplicar} aria-label={`Duplicar ${tc.nombre}`} className={accion}>
          <Copy size={12} aria-hidden />
          Duplicar
        </button>
        {/* Archivar es lo que se hace con una clase que ya no se da: borrar solo
            se puede si nunca ha tenido clases (la FK de `sesiones` lo impide). */}
        <button onClick={onArchivar} aria-label={`Archivar ${tc.nombre}`} className={accion}>
          <Archive size={12} aria-hidden />
          Archivar
        </button>
        {onEliminar && (
          <button
            onClick={onEliminar}
            className="ml-auto flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive @2xl/config:ml-0"
          >
            <Trash2 size={12} aria-hidden />
            Eliminar
          </button>
        )}
      </div>
    </li>
  );
}

// Arrastrar solo sube o baja: la lista es una columna.
const soloVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// Un tipo archivado, en la lista plegable de abajo: sin reglas ni planes (ya no
// se programa), con lo que le queda por dar y cómo volver a tenerlo.
function FilaArchivado({ tc, quedan, recuperando, onRecuperar, onEliminar }: {
  tc: TipoClase;
  /** Clases suyas que aún no han pasado, y la última. */
  quedan: { clases: number; ultima: string | null };
  recuperando: boolean;
  onRecuperar: () => void;
  onEliminar?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full opacity-60" style={{ backgroundColor: tc.color }} aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-foreground">{tc.nombre}</span>
        <span className="block text-[12px] text-muted-foreground text-pretty">
          {tc.archivadoEn ? `Archivado el ${fechaCortaEstudio(tc.archivadoEn)}` : 'Archivado'}
          {quedan.clases > 0 && ` · le ${quedan.clases === 1 ? 'queda 1 clase' : `quedan ${quedan.clases} clases`}${quedan.ultima ? `, ${quedan.clases === 1 ? 'el' : 'la última el'} ${fechaCortaEstudio(quedan.ultima)}` : ''}`}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <button
          onClick={onRecuperar}
          disabled={recuperando}
          aria-label={`Recuperar ${tc.nombre}`}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Undo2 size={11} />
          {recuperando ? 'Recuperando…' : 'Recuperar'}
        </button>
        {onEliminar && (
          <button
            onClick={onEliminar}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={11} />
            Eliminar
          </button>
        )}
      </span>
    </li>
  );
}

export function TabClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, tiposClase, planesTarifa, sesiones, reservas, addTipoClase, updateTipoClase, deleteTipoClase } = useStudio();
  const estudio = dataLoaded ? reglasGuardadas(studio) : null;
  // En el orden que ve la alumna: el que se guardó al arrastrar, y detrás, por
  // nombre, los que nunca se han colocado. Hasta el primer arrastre, por nombre,
  // como siempre (`ordenarTipos` no reordena si no hay ninguno colocado). Los
  // archivados van aparte, plegados y por nombre: ya no se programan y no deben
  // competir con los que sí.
  const hayOrden = hayOrdenGuardado(tiposClase);
  const ordenados = useMemo(
    () => ordenarTipos([...tiposClase].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))),
    [tiposClase],
  );
  const activos = useMemo(() => ordenados.filter(t => !estaArchivado(t)), [ordenados]);
  const archivados = useMemo(
    () => ordenados.filter(t => estaArchivado(t)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    [ordenados],
  );
  // Mientras se guarda un orden nuevo, la lista enseña ese (los ids en su sitio
  // nuevo) y no deja arrastrar otra vez. Al terminar se vuelve a lo guardado:
  // si algo falló, lo que se ve es lo que la base de datos tiene de verdad.
  const [ordenPendiente, setOrdenPendiente] = useState<string[] | null>(null);
  const guardandoOrden = useRef(false);
  const enLista = useMemo(() => {
    if (!ordenPendiente) return activos;
    const porId = new Map(activos.map(t => [t.id, t]));
    return ordenPendiente.map(id => porId.get(id)).filter((t): t is TipoClase => !!t);
  }, [activos, ordenPendiente]);
  // «Le quedan N clases» se cuenta desde que se abre la pantalla.
  const [ahora] = useState(() => Date.now());
  const quedanPorTipo = useMemo(() => {
    const m = new Map<string, { clases: number; ultima: string | null }>();
    for (const s of sesiones) {
      if (s.cancelada || Date.parse(s.inicio) <= ahora) continue;
      const q = m.get(s.tipoClaseId) ?? { clases: 0, ultima: null };
      q.clases += 1;
      if (!q.ultima || Date.parse(s.inicio) > Date.parse(q.ultima)) q.ultima = s.inicio;
      m.set(s.tipoClaseId, q);
    }
    return m;
  }, [sesiones, ahora]);
  // La gerencia da de alta y edita tipos de clase, pero no borra ninguno ni toca
  // las tres reglas que acaban en dinero: un trigger las rechaza con 42501
  // (`tipos_clase_dinero_solo_propietaria`). La cerradura es esa, no esto.
  const reglasDeDinero = useRol() === 'PROPIETARIO';

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaseForm>(() => emptyClaseForm(colorSalaPorDefecto(0)));
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [archivar, setArchivar] = useState<{ id: string; nombre: string; impacto: ImpactoArchivar } | null>(null);
  const [verArchivados, setVerArchivados] = useState(false);
  const [recuperando, setRecuperando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const editando = editId ? tiposClase.find(t => t.id === editId) ?? null : null;

  // Subir y guardar van separados: `CampoImagen` ofrece dos vías —archivo o
  // enlace pegado— y solo la primera pasa por Storage.
  const subirFotoDeClase = useCallback(async (file: File) => {
    if (!editId) return { error: 'Guarda la clase antes de ponerle foto.' };
    if (!file.type.startsWith('image/')) return { error: 'Elige un archivo de imagen' };
    if (file.size > 5 * 1024 * 1024) return { error: 'La imagen no puede superar 5 MB' };
    setSubiendoFoto(true);
    const result = await subirFotoClase(editId, file);
    setSubiendoFoto(false);
    return result;
  }, [editId]);

  const guardarFotoDeClase = useCallback(async (url: string | null) => {
    if (!editId) return;
    // Quitar borra también el archivo del bucket; si lo que había era un
    // enlace pegado no hay nada que borrar y no pasa nada.
    if (url === null) {
      setSubiendoFoto(true);
      const result = await eliminarFotoClase(editId);
      setSubiendoFoto(false);
      if ('error' in result) { showToast(result.error); return; }
    }
    const res = await updateTipoClase(editId, { fotoUrl: url });
    if (!res.ok) showToast(res.error);
  }, [editId, updateTipoClase, showToast]);

  // El logo va por su propia vía, igual que el banner: mismo par subir/guardar,
  // distinto prefijo de Storage y distinta columna.
  const subirLogoDeClase = useCallback(async (file: File) => {
    if (!editId) return { error: 'Guarda la clase antes de ponerle logo.' };
    if (!file.type.startsWith('image/')) return { error: 'Elige un archivo de imagen' };
    if (file.size > 5 * 1024 * 1024) return { error: 'La imagen no puede superar 5 MB' };
    setSubiendoLogo(true);
    const result = await subirLogoClase(editId, file);
    setSubiendoLogo(false);
    return result;
  }, [editId]);

  const guardarLogoDeClase = useCallback(async (url: string | null) => {
    if (!editId) return;
    if (url === null) {
      setSubiendoLogo(true);
      const result = await eliminarLogoClase(editId);
      setSubiendoLogo(false);
      if ('error' in result) { showToast(result.error); return; }
    }
    const res = await updateTipoClase(editId, { logoUrl: url });
    if (!res.ok) showToast(res.error);
  }, [editId, updateTipoClase, showToast]);

  const openNueva = useCallback(() => {
    setForm(emptyClaseForm(colorSalaPorDefecto(tiposClase.length)));
    setEditId(null);
    setErrorGuardar(null);
    setModal('nueva');
  }, [tiposClase.length]);

  // Duplicar: el mismo formulario con sus datos y «(copia)», como uno NUEVO. Sin
  // imágenes a propósito: apuntarían al mismo archivo, y quitárselas a una
  // borraría el de la otra.
  const openDuplicar = useCallback((t: TipoClase) => {
    setForm({ ...claseToForm(t), nombre: `${t.nombre} (copia)` });
    setEditId(null);
    setErrorGuardar(null);
    setModal('nueva');
  }, []);

  const openEditar = useCallback((t: TipoClase) => {
    setForm(claseToForm(t));
    setEditId(t.id);
    setErrorGuardar(null);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => { setModal(null); setErrorGuardar(null); }, []);

  const guardar = useCallback(async () => {
    if (modal === 'nueva') {
      // Esperamos a la base de datos antes de decir que está creado.
      setGuardando(true);
      setErrorGuardar(null);
      // Las dos imágenes nacen vacías: sus campos ni siquiera se enseñan al
      // crear, porque para subirlas a Storage hace falta el id de la clase.
      const fields = camposParaGuardar(form, { modo: 'nueva', reglasDeDinero });
      const res = await addTipoClase({ ...fields, fotoUrl: null, logoUrl: null });
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      showToast(`"${fields.nombre}" ya está guardado`);
    } else if (editId) {
      setGuardando(true);
      setErrorGuardar(null);
      // Sin las reglas de dinero si no es la propietaria: no se mandan los
      // mismos valores, se dejan fuera del cambio (ver `camposParaGuardar`).
      const res = await updateTipoClase(editId, camposParaGuardar(form, { modo: 'editar', reglasDeDinero }));
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      showToast('Tipo de clase actualizado');
    }
    setModal(null);
  }, [modal, editId, form, reglasDeDinero, addTipoClase, updateTipoClase, showToast]);

  // Un PATCH por cada tipo cuya posición cambia (`cambiosDeOrden`), en paralelo,
  // y cada uno comprueba que tocó su fila (`dbUpdateTipoClase`). El contexto
  // solo aplica los que la base de datos aceptó, así que si alguno falla, la
  // lista que queda es exactamente lo guardado — y se dice.
  const alSoltar = useCallback(async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || guardandoOrden.current) return;
    const ids = activos.map(t => t.id);
    const desde = ids.indexOf(String(active.id));
    const hasta = ids.indexOf(String(over.id));
    if (desde < 0 || hasta < 0) return;
    const nuevo = arrayMove(ids, desde, hasta);
    const cambios = cambiosDeOrden(activos, nuevo);
    if (cambios.length === 0) return;
    guardandoOrden.current = true;
    setOrdenPendiente(nuevo);
    const resultados = await Promise.all(cambios.map(c => updateTipoClase(c.id, { orden: c.orden })));
    guardandoOrden.current = false;
    setOrdenPendiente(null);
    const fallo = resultados.find((r): r is { ok: false; error: string } => !r.ok);
    showToast(fallo ? `El orden no se ha guardado. ${fallo.error}` : 'Orden guardado: así lo verán tus alumnas');
  }, [activos, updateTipoClase, showToast]);

  const sensores = useSensors(
    // 5 px antes de arrastrar: sin esto, tocar el asa en el iPad ya lo movía.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Lo que oye quien mueve la lista con el teclado y un lector de pantalla,
  // en español y con el nombre de la clase (el de serie de dnd-kit dice ids).
  const nombreDe = (id: UniqueIdentifier) => enLista.find(t => t.id === id)?.nombre ?? 'El tipo de clase';
  const puestoDe = (id: UniqueIdentifier) => enLista.findIndex(t => t.id === id) + 1;
  // Al cogerlo, dnd-kit avisa enseguida de que está «sobre» sí mismo: ese primer
  // aviso se calla, o pisaría el «Has cogido…» antes de que se llegue a oír.
  const recienCogido = useRef(false);
  const anuncios: Announcements = {
    onDragStart: ({ active }) => {
      recienCogido.current = true;
      return `Has cogido ${nombreDe(active.id)}. Está en el puesto ${puestoDe(active.id)} de ${enLista.length}.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over) return undefined;
      if (over.id === active.id) {
        if (recienCogido.current) { recienCogido.current = false; return undefined; }
        return `${nombreDe(active.id)} vuelve a su puesto, el ${puestoDe(over.id)} de ${enLista.length}.`;
      }
      recienCogido.current = false;
      return `${nombreDe(active.id)} iría al puesto ${puestoDe(over.id)} de ${enLista.length}.`;
    },
    onDragEnd: ({ active, over }) => (over ? `${nombreDe(active.id)} queda en el puesto ${puestoDe(over.id)} de ${enLista.length}.` : `${nombreDe(active.id)} vuelve a su sitio.`),
    onDragCancel: ({ active }) => `Cancelado: ${nombreDe(active.id)} vuelve a su sitio.`,
  };

  // Lo que pasa al archivarlo, contado en el momento de pulsar con lo que el
  // panel tiene cargado (todas las clases y reservas del estudio).
  const abrirArchivar = useCallback((t: TipoClase) => {
    setArchivar({
      id: t.id,
      nombre: t.nombre,
      impacto: impactoDeArchivar({ tipoId: t.id, tipos: tiposClase, sesiones, reservas, planes: planesTarifa, ahora: Date.now() }),
    });
  }, [tiposClase, sesiones, reservas, planesTarifa]);

  const confirmarArchivar = useCallback(async () => {
    if (!archivar) return { ok: false as const, error: 'No hay nada que archivar.' };
    const res = await updateTipoClase(archivar.id, { archivadoEn: new Date().toISOString() });
    if (res.ok) showToast(`«${archivar.nombre}» archivado`);
    return res;
  }, [archivar, updateTipoClase, showToast]);

  const recuperar = useCallback(async (t: TipoClase) => {
    setRecuperando(t.id);
    const res = await updateTipoClase(t.id, { archivadoEn: null });
    setRecuperando(null);
    showToast(res.ok ? `«${t.nombre}» vuelve a estar entre tus tipos de clase` : res.error);
  }, [updateTipoClase, showToast]);

  const tipoABorrar = confirmDel ? tiposClase.find(t => t.id === confirmDel) ?? null : null;
  const nombreABorrar = tipoABorrar?.nombre ?? '';
  const clasesDelTipo = confirmDel ? sesiones.filter(se => se.tipoClaseId === confirmDel).length : 0;

  const handleDelete = useCallback(async () => {
    if (!confirmDel) return;
    const res = await deleteTipoClase(confirmDel);
    showToast(res.ok ? 'Tipo de clase eliminado' : res.error);
  }, [confirmDel, deleteTipoClase, showToast]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* "Nuevo tipo de clase", no "Nueva clase": el botón del calendario se
            llamaba igual y hace otra cosa (programar una sesión un día y a una
            hora). Con los dos nombres idénticos, quien buscaba dónde dar de alta
            "Reformer Iniciación" acababa en la agenda con tres desplegables
            vacíos, sin entender por qué. */}
        <div className="min-w-0">
          <p className="text-[13px] text-muted-foreground">
            {activos.length === 1 ? '1 tipo de clase configurado' : `${activos.length} tipos de clase configurados`}
          </p>
          {/* Hasta el primer arrastre, la alumna los ve en el orden de siempre
              (el de la base de datos), no en este: no se promete lo contrario. */}
          {activos.length > 1 && (
            <p className="text-[12.5px] text-muted-foreground text-pretty">
              {hayOrden
                ? 'En este orden los ve tu alumna al reservar. Arrástralos por el asa para cambiarlo.'
                : 'Arrástralos por el asa para decidir en qué orden los ve tu alumna al reservar.'}
            </p>
          )}
        </div>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={14} />
          Nuevo tipo de clase
        </button>
      </div>

      {activos.length === 0 && (
        <div className={cn(cardCls, 'p-10 text-center text-[13px] text-muted-foreground')}>
          {archivados.length > 0
            ? 'Todos tus tipos de clase están archivados. Recupera uno de abajo o crea uno nuevo para volver a programar clases.'
            : 'Aún no tienes tipos de clase. Créalos aquí (Reformer, Suelo, Embarazadas…) y luego los programarás en la agenda.'}
        </div>
      )}

      {enLista.length > 0 && (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCenter}
          modifiers={[soloVertical]}
          onDragEnd={e => void alSoltar(e)}
          accessibility={{
            announcements: anuncios,
            screenReaderInstructions: {
              draggable: 'Para mover este tipo de clase, pulsa Espacio o Intro. Súbelo o bájalo con las flechas y vuelve a pulsar Espacio o Intro para dejarlo. Escape lo deja donde estaba.',
            },
          }}
        >
          <SortableContext items={enLista.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <ul aria-label="Tipos de clase, en el orden en que los ve tu alumna" className={cn(cardCls, 'divide-y divide-border')}>
              {enLista.map(tc => (
                <FilaTipoClase
                  key={tc.id}
                  tc={tc}
                  estudio={estudio}
                  planes={dataLoaded ? planesTarifa : []}
                  conAsa={enLista.length > 1}
                  quieta={!!ordenPendiente}
                  onEditar={() => openEditar(tc)}
                  onDuplicar={() => openDuplicar(tc)}
                  onArchivar={() => abrirArchivar(tc)}
                  onEliminar={reglasDeDinero ? () => setConfirmDel(tc.id) : undefined}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <p role="status" aria-live="polite" className="sr-only">{ordenPendiente ? 'Guardando el orden…' : ''}</p>

      {archivados.length > 0 && (
        <section className="rounded-xl border border-dashed border-border">
          <button
            type="button"
            onClick={() => setVerArchivados(v => !v)}
            aria-expanded={verArchivados}
            aria-controls="tipos-archivados"
            className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/50"
          >
            <span className="text-pretty">
              <span className="font-medium text-foreground">Archivados ({archivados.length})</span>
              {' · no se programan clases nuevas suyas; su historial se conserva'}
            </span>
            <ChevronDown size={16} aria-hidden className={cn('shrink-0 transition-transform', verArchivados && 'rotate-180')} />
          </button>
          {verArchivados && (
            <ul id="tipos-archivados" className="divide-y divide-border border-t border-dashed border-border">
              {archivados.map(tc => (
                <FilaArchivado
                  key={tc.id}
                  tc={tc}
                  quedan={quedanPorTipo.get(tc.id) ?? { clases: 0, ultima: null }}
                  recuperando={recuperando === tc.id}
                  onRecuperar={() => void recuperar(tc)}
                  onEliminar={reglasDeDinero ? () => setConfirmDel(tc.id) : undefined}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <PanelTipoClase
        open={modal !== null}
        modo={modal === 'editar' ? 'editar' : 'nueva'}
        form={form}
        setForm={setForm}
        studio={studio}
        editando={editando}
        reglasDeDinero={reglasDeDinero}
        guardando={guardando}
        errorGuardar={errorGuardar}
        subiendoFoto={subiendoFoto}
        onSubirFoto={subirFotoDeClase}
        onCambiarFoto={guardarFotoDeClase}
        subiendoLogo={subiendoLogo}
        onSubirLogo={subirLogoDeClase}
        onCambiarLogo={guardarLogoDeClase}
        onGuardar={guardar}
        onCerrar={closeModal}
      />

      {/* Un tipo con clases no se puede borrar: `sesiones.tipo_clase_id` lo
          referencia (FK sin ON DELETE), también las pasadas. Se dice ANTES de
          pulsar, con las que hay cargadas; si hubiera más en el historial, el
          servidor lo rechaza igual y dice por qué (dbDeleteTipoClase). Y a uno
          activo se le ofrece lo que sí se puede hacer: archivarlo. */}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        titulo={clasesDelTipo > 0 ? `«${nombreABorrar}» tiene clases` : `¿Eliminar «${nombreABorrar}»?`}
        descripcion={clasesDelTipo > 0
          ? `Tiene ${clasesDelTipo === 1 ? '1 clase' : `${clasesDelTipo} clases`} en tu horario o en tu historial, y eliminarlo las dejaría sin tipo: por eso no se puede.${estaArchivado(tipoABorrar) ? ' Ya está archivado: no se programan clases nuevas suyas y su historial se conserva.' : ' Si ya no la das, archívalo: no se podrán programar clases nuevas suyas y su historial se conserva.'}`
          : 'No tiene clases en tu horario. Se eliminará y dejará de salir al programar clases.'}
        textoConfirmar={clasesDelTipo === 0 ? 'Eliminar' : estaArchivado(tipoABorrar) ? 'Entendido' : 'Archivar'}
        destructivo={clasesDelTipo === 0}
        onConfirm={clasesDelTipo === 0
          ? handleDelete
          : () => { const t = tipoABorrar; setConfirmDel(null); if (t && !estaArchivado(t)) abrirArchivar(t); }}
      />

      <DialogoArchivarTipo
        archivando={archivar}
        onArchivar={confirmarArchivar}
        onCerrar={() => setArchivar(null)}
      />
    </div>
  );
}
