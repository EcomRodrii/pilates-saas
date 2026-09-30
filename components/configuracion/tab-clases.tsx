'use client';

import { useCallback, useMemo, useState } from 'react';
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
import {
  NIVEL_LABELS,
  camposParaGuardar,
  claseToForm,
  emptyClaseForm,
  plazasSiPropias,
  type ClaseForm,
} from '@/lib/configuracion/tipo-clase-form';
import type { PlanTarifa, TipoClase } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AlertTriangle, Copy, Pencil, Plus, Ticket, Trash2, Video } from 'lucide-react';

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
// La tarjeta de un tipo de clase.
//
// La estructura anterior repartía el peso a partes iguales entre el nombre, el
// nivel y la descripción, y luego soltaba hasta 9 chips seguidos: una clase con
// varias reglas propias empujaba a las demás de la rejilla al doble de alto y
// el nombre —lo único por lo que se busca una clase— quedaba enterrado.
//
// Ahora: la foto (que es lo que ve la alumna) ancla la tarjeta, el nombre manda,
// una sola línea de datos duros (nivel · duración · plazas), y las reglas
// propias se cortan a 3 con un "+N". Lo que se recorta no se pierde: está
// entero al abrir la clase.
// ─────────────────────────────────────────────────────────────────────────────
function TarjetaTipoClase({
  tc,
  estudio,
  planes,
  onEditar,
  onDuplicar,
  onEliminar,
}: {
  tc: TipoClase;
  /** Las reglas del estudio; `null` sin cargar (no se dice qué cambia). */
  estudio: ReglasReserva | null;
  planes: readonly PlanTarifa[];
  onEditar: () => void;
  onDuplicar: () => void;
  /** Sin esto no se enseña «Eliminar»: borrar un tipo es de la propietaria. */
  onEliminar?: () => void;
}) {
  const chips = estudio ? reglasPropias(tc, estudio) : [];
  const cubren = planesQueLaCubren(tc, planes);
  // Solo avisa si hace falta plan para reservarla: sin ese requisito, que ningún
  // plan la incluya no le impide nada a nadie.
  const exigePlan = estudio ? reglasEfectivasDeTipo(estudio, tc).reservaExigirPlan : false;
  const visibles = chips.slice(0, 3);
  const ocultos = chips.length - visibles.length;
  // Las plazas solo si esta clase fija las suyas: si las hereda de la sala, la
  // cifra depende de dónde se programe y la tarjeta no puede prometerla.
  const meta = [NIVEL_LABELS[tc.nivel], `${tc.duracionMinutos} min`];
  const plazas = plazasSiPropias(String(tc.aforoPorDefecto ?? ''));
  if (plazas) meta.push(plazas);

  return (
    <div className={cn(cardCls, 'flex flex-col overflow-hidden')}>
      <div className="flex items-start gap-3 p-4 pb-3">
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
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-foreground">
            <span className="truncate">{tc.nombre}</span>
            {tc.esOnline && (
              <Video size={12} className="shrink-0 text-muted-foreground" aria-label="Clase online" />
            )}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{meta.join(' · ')}</p>
          {tc.descripcion && (
            <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{tc.descripcion}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 px-4 pb-3">
        {cubren.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded bg-background px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
            <Ticket size={11} aria-hidden />Entra en: {enumerarCorto(cubren)}
          </span>
        ) : planes.length > 0 && exigePlan ? (
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

      <div className="mt-auto flex items-center gap-1 border-t border-background px-3 py-2">
        <button
          onClick={onEditar}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Pencil size={11} />
          Editar
        </button>
        <button
          onClick={onDuplicar}
          aria-label={`Duplicar ${tc.nombre}`}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Copy size={11} />
          Duplicar
        </button>
        {onEliminar && (
          <button
            onClick={onEliminar}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 size={11} />
            Eliminar
          </button>
        )}
      </div>
    </div>
  );
}

export function TabClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio, dataLoaded, tiposClase, planesTarifa, sesiones, addTipoClase, updateTipoClase, deleteTipoClase } = useStudio();
  const estudio = dataLoaded ? reglasGuardadas(studio) : null;
  // En orden alfabético: sin orden guardado, la base de datos los devolvía en el
  // que le venía bien, y cada carga podía cambiarlo.
  const ordenados = useMemo(() => [...tiposClase].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [tiposClase]);
  // La gerencia da de alta y edita tipos de clase, pero no borra ninguno ni toca
  // las tres reglas que acaban en dinero: un trigger las rechaza con 42501
  // (`tipos_clase_dinero_solo_propietaria`). La cerradura es esa, no esto.
  const reglasDeDinero = useRol() === 'PROPIETARIO';

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaseForm>(() => emptyClaseForm(colorSalaPorDefecto(0)));
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
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

  const nombreABorrar = confirmDel ? tiposClase.find(t => t.id === confirmDel)?.nombre ?? '' : '';
  const clasesDelTipo = confirmDel ? sesiones.filter(se => se.tipoClaseId === confirmDel).length : 0;

  const handleDelete = useCallback(async () => {
    if (!confirmDel) return;
    const res = await deleteTipoClase(confirmDel);
    showToast(res.ok ? 'Tipo de clase eliminado' : res.error);
  }, [confirmDel, deleteTipoClase, showToast]);

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        {/* "Nuevo tipo de clase", no "Nueva clase": el botón del calendario se
            llamaba igual y hace otra cosa (programar una sesión un día y a una
            hora). Con los dos nombres idénticos, quien buscaba dónde dar de alta
            "Reformer Iniciación" acababa en la agenda con tres desplegables
            vacíos, sin entender por qué. */}
        <p className="text-[13px] text-muted-foreground">
          {tiposClase.length === 1 ? '1 tipo de clase configurado' : `${tiposClase.length} tipos de clase configurados`}
        </p>
        <button className={btnPrimary} onClick={openNueva}>
          <Plus size={14} />
          Nuevo tipo de clase
        </button>
      </div>

      {tiposClase.length === 0 && (
        <div className={cn(cardCls, 'p-10 text-center text-[13px] text-muted-foreground')}>
          Aún no tienes tipos de clase. Créalos aquí (Reformer, Suelo, Embarazadas…) y luego los programarás en la agenda.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 @xl/config:grid-cols-2 @4xl/config:grid-cols-3">
        {ordenados.map(tc => (
          <TarjetaTipoClase
            key={tc.id}
            tc={tc}
            estudio={estudio}
            planes={dataLoaded ? planesTarifa : []}
            onEditar={() => openEditar(tc)}
            onDuplicar={() => openDuplicar(tc)}
            onEliminar={reglasDeDinero ? () => setConfirmDel(tc.id) : undefined}
          />
        ))}
      </div>

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
          servidor lo rechaza igual y dice por qué (dbDeleteTipoClase). */}
      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        titulo={clasesDelTipo > 0 ? `«${nombreABorrar}» tiene clases` : `¿Eliminar «${nombreABorrar}»?`}
        descripcion={clasesDelTipo > 0
          ? `Tiene ${clasesDelTipo === 1 ? '1 clase' : `${clasesDelTipo} clases`} en tu horario o en tu historial, y eliminarlo las dejaría sin tipo: por eso no se puede. Si ya no la das, quítala de tu horario; su historial se conserva.`
          : 'No tiene clases en tu horario. Se eliminará y dejará de salir al programar clases.'}
        textoConfirmar={clasesDelTipo > 0 ? 'Entendido' : 'Eliminar'}
        destructivo={clasesDelTipo === 0}
        onConfirm={clasesDelTipo > 0 ? () => setConfirmDel(null) : handleDelete}
      />
    </div>
  );
}
