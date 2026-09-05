'use client';

import { useCallback, useState } from 'react';
import { btnPrimary, cardCls } from '@/app/(dashboard)/configuracion/page';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PanelTipoClase } from '@/components/configuracion/panel-tipo-clase';
import { eliminarFotoClase, subirFotoClase, eliminarLogoClase, subirLogoClase } from '@/lib/portal-storage';
import { colorSalaPorDefecto } from '@/components/configuracion/tab-salas';
import { useStudio } from '@/lib/studio-context';
import { imagenDeClase } from '@/lib/imagenes-por-defecto';
import {
  NIVEL_LABELS,
  claseToForm,
  emptyClaseForm,
  formACampos,
  plazasSiPropias,
  type ClaseForm,
} from '@/lib/configuracion/tipo-clase-form';
import type { TipoClase } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { Pencil, Plus, Trash2, Video } from 'lucide-react';

// P2 (auditoría "Veredicto de Marta"): la card solo enseñaba la ventana de
// cancelación de las 8 reglas configurables — con 3-5 tipos de clase, tocaba
// reabrir cada modal para ver qué se había fijado en cada uno. Un chip por
// regla ACTIVA (null = hereda del estudio, no se enseña aquí: la card es solo
// para lo que este tipo de clase SOBRESCRIBE).
function overridesDeTipoClase(tc: TipoClase): string[] {
  const chips: string[] = [];
  if (tc.ventanaCancelacionHoras != null) chips.push(`Cancela ${tc.ventanaCancelacionHoras}h antes`);
  if (tc.reservaExigirPlan != null) chips.push(tc.reservaExigirPlan ? 'Exige plan/bono' : 'No exige plan/bono');
  if (tc.reservaVentanaMinimaMinutos != null) chips.push(`Reserva hasta ${tc.reservaVentanaMinimaMinutos} min antes`);
  if (tc.reservaAntelacionMaximaDias != null) chips.push(`Se abre ${tc.reservaAntelacionMaximaDias}d antes`);
  if (tc.permiteListaEspera != null) chips.push(tc.permiteListaEspera ? 'Con lista de espera' : 'Sin lista de espera');
  if (tc.requiereAprobacion) chips.push('Aprobación manual');
  if (tc.listaEsperaPlazoAceptacionMinutos != null) chips.push(`Plazo espera: ${tc.listaEsperaPlazoAceptacionMinutos} min`);
  if (tc.minimoAsistentesPorClase != null) chips.push(`Mín. ${tc.minimoAsistentesPorClase} asistentes`);
  if (tc.penalizacionImporteEur != null) chips.push(`Penalización ${formatEuro(tc.penalizacionImporteEur)}`);
  return chips;
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
  onEditar,
  onEliminar,
}: {
  tc: TipoClase;
  onEditar: () => void;
  onEliminar: () => void;
}) {
  const chips = overridesDeTipoClase(tc);
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
          {/* eslint-disable-next-line @next/next/no-img-element -- respaldo local ya optimizado, sin pasar por next/image */}
          <img
            src={imagenDeClase(tc)}
            alt=""
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

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-3">
          {visibles.map(chip => (
            <span key={chip} className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {chip}
            </span>
          ))}
          {ocultos > 0 && (
            <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{ocultos} regla{ocultos === 1 ? '' : 's'} propia{ocultos === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-background px-3 py-2">
        <button
          onClick={onEditar}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <Pencil size={11} />
          Editar
        </button>
        <button
          onClick={onEliminar}
          className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={11} />
          Eliminar
        </button>
      </div>
    </div>
  );
}

export function TabClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio, tiposClase, addTipoClase, updateTipoClase, deleteTipoClase } = useStudio();

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

  const openEditar = useCallback((t: TipoClase) => {
    setForm(claseToForm(t));
    setEditId(t.id);
    setErrorGuardar(null);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => { setModal(null); setErrorGuardar(null); }, []);

  const guardar = useCallback(async () => {
    const fields = formACampos(form);
    if (modal === 'nueva') {
      // Esperamos a la base de datos antes de decir que está creado.
      setGuardando(true);
      setErrorGuardar(null);
      // Las dos imágenes nacen vacías: sus campos ni siquiera se enseñan al
      // crear, porque para subirlas a Storage hace falta el id de la clase.
      const res = await addTipoClase({ ...fields, fotoUrl: null, logoUrl: null });
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      showToast(`"${fields.nombre}" ya está guardado`);
    } else if (editId) {
      setGuardando(true);
      setErrorGuardar(null);
      const res = await updateTipoClase(editId, fields);
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      showToast('Tipo de clase actualizado');
    }
    setModal(null);
  }, [modal, editId, form, addTipoClase, updateTipoClase, showToast]);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiposClase.map(tc => (
          <TarjetaTipoClase
            key={tc.id}
            tc={tc}
            onEditar={() => openEditar(tc)}
            onEliminar={() => setConfirmDel(tc.id)}
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

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        titulo="¿Eliminar tipo de clase?"
        descripcion="Se eliminará este tipo de clase. Las sesiones existentes no se verán afectadas."
        textoConfirmar="Eliminar"
        destructivo
        onConfirm={handleDelete}
      />
    </div>
  );
}
