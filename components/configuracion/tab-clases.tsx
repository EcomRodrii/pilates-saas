'use client';

import { useCallback, useState } from 'react';
import { ColorInput, ColorSwatch, ConfirmDialog, Field, NivelBadge, Toggle, btnPrimary, btnSecondary, cardCls, inputCls } from '@/app/(dashboard)/configuracion/page';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InfoTip } from '@/components/ui/tooltip';
import { eliminarFotoClase, subirFotoClase } from '@/lib/portal-storage';
import { colorSalaPorDefecto } from '@/components/configuracion/tab-salas';
import { useStudio } from '@/lib/studio-context';
import { OBJETIVOS, resolverObjetivos } from '@/lib/reservar/objetivos';
import type { TipoClase } from '@/lib/types';
import { cn, formatEuro } from '@/lib/utils';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { imagenDeClase } from '@/lib/imagenes-por-defecto';
import { CampoImagen } from '@/components/ui/campo-imagen';
import { ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL, type EspecialidadNetwork } from '@/lib/network/catalogo.ts';

// "Hereda" = usa el ajuste general del estudio (Configuración → Estudio →
// Reservas y cancelaciones). Un checkbox no puede representar tres estados
// (hereda/sí/no), así que estas reglas van en un <select> de 3 opciones.
type TriEstado = 'hereda' | 'si' | 'no';
const triABool = (v: TriEstado): boolean | null => (v === 'hereda' ? null : v === 'si');
const boolATri = (v: boolean | null | undefined): TriEstado => (v == null ? 'hereda' : v ? 'si' : 'no');

type ClaseForm = {
  nombre: string;
  color: string;
  duracionMinutos: string;
  nivel: TipoClase['nivel'];
  objetivos: string[];
  descripcion: string;
  // Vacío = hereda la ventana del estudio (comportamiento de siempre).
  ventanaCancelacionHoras: string;
  // Fase 1 de reglas por tipo de clase (migr 20260730152516): mismo patrón de
  // override que ventanaCancelacionHoras.
  reservaExigirPlan: TriEstado;
  reservaVentanaMinimaMinutos: string;
  reservaAntelacionMaximaDias: string;
  permiteListaEspera: TriEstado;
  // Fase 2a (migr 20260730192445): mismo patrón de override.
  requiereAprobacion: TriEstado;
  // Fase 2b (migr 20260731130000): override NUMÉRICO — vacío = null = hereda,
  // mismo patrón que reservaVentanaMinimaMinutos/reservaAntelacionMaximaDias
  // (no tri-estado, que es solo para booleanos).
  listaEsperaPlazoAceptacionMinutos: string;
  // Fase 2c (migr 20260731140000): mismo patrón, vacío = null = hereda.
  minimoAsistentesPorClase: string;
  // Fase 3 (migr 20260730225253): mismo patrón, vacío = null = hereda.
  penalizacionImporteEur: string;
  // Fase 11 de Network↔Sustituciones (migr 20260818010302): '' = sin mapear,
  // no null directo — mismo criterio que el resto de selects opcionales de
  // este formulario (ventanaCancelacionHoras usa '' para lo mismo).
  especialidadNetwork: EspecialidadNetwork | '';
  // Zoom (migr 20260820150000): por tipo de clase, no por sesión suelta.
  esOnline: boolean;
};

const emptyClaseForm = (color: string): ClaseForm => ({
  nombre: '',
  color,
  duracionMinutos: '60',
  nivel: 'TODOS',
  objetivos: [],
  descripcion: '',
  ventanaCancelacionHoras: '',
  reservaExigirPlan: 'hereda',
  reservaVentanaMinimaMinutos: '',
  reservaAntelacionMaximaDias: '',
  permiteListaEspera: 'hereda',
  requiereAprobacion: 'hereda',
  listaEsperaPlazoAceptacionMinutos: '',
  minimoAsistentesPorClase: '',
  penalizacionImporteEur: '',
  especialidadNetwork: '',
  esOnline: false,
});

function claseToForm(t: TipoClase): ClaseForm {
  return {
    nombre: t.nombre,
    color: t.color,
    duracionMinutos: String(t.duracionMinutos),
    nivel: t.nivel,
    objetivos: resolverObjetivos(t.objetivos),
    descripcion: t.descripcion ?? '',
    ventanaCancelacionHoras: t.ventanaCancelacionHoras != null ? String(t.ventanaCancelacionHoras) : '',
    reservaExigirPlan: boolATri(t.reservaExigirPlan),
    reservaVentanaMinimaMinutos: t.reservaVentanaMinimaMinutos != null ? String(t.reservaVentanaMinimaMinutos) : '',
    reservaAntelacionMaximaDias: t.reservaAntelacionMaximaDias != null ? String(t.reservaAntelacionMaximaDias) : '',
    permiteListaEspera: boolATri(t.permiteListaEspera),
    requiereAprobacion: boolATri(t.requiereAprobacion),
    listaEsperaPlazoAceptacionMinutos: t.listaEsperaPlazoAceptacionMinutos != null ? String(t.listaEsperaPlazoAceptacionMinutos) : '',
    minimoAsistentesPorClase: t.minimoAsistentesPorClase != null ? String(t.minimoAsistentesPorClase) : '',
    penalizacionImporteEur: t.penalizacionImporteEur != null ? String(t.penalizacionImporteEur) : '',
    especialidadNetwork: t.especialidadNetwork ?? '',
    esOnline: t.esOnline,
  };
}

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

const NIVEL_LABELS: Record<TipoClase['nivel'], string> = {
  TODOS: 'Todos los niveles',
  PRINCIPIANTE: 'Principiante',
  MEDIO: 'Medio',
  AVANZADO: 'Avanzado',
};

export function TabClases({ showToast }: { showToast: (m: string) => void }) {
  const { studio, tiposClase, addTipoClase, updateTipoClase, deleteTipoClase } = useStudio();
  const zoomConectado = !!studio?.zoomEmail;

  const [modal, setModal] = useState<'nueva' | 'editar' | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ClaseForm>(() => emptyClaseForm(colorSalaPorDefecto(0)));
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const editando = editId ? tiposClase.find(t => t.id === editId) ?? null : null;

  // Subir y guardar van separados: `CampoImagen` ofrece dos vías —archivo o
  // enlace pegado— y solo la primera pasa por Storage.
  async function subirFotoDeClase(file: File) {
    if (!editId) return { error: 'Guarda la clase antes de ponerle foto.' };
    if (!file.type.startsWith('image/')) return { error: 'Elige un archivo de imagen' };
    if (file.size > 5 * 1024 * 1024) return { error: 'La imagen no puede superar 5 MB' };
    setSubiendoFoto(true);
    const result = await subirFotoClase(editId, file);
    setSubiendoFoto(false);
    return result;
  }

  async function guardarFotoDeClase(url: string | null) {
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
  }

  const openNueva = useCallback(() => {
    setForm(emptyClaseForm(colorSalaPorDefecto(tiposClase.length)));
    setEditId(null);
    setErrorGuardar(null);
    setModal('nueva');
  }, [tiposClase.length]);

  const openEditar = useCallback((t: TipoClase) => {
    setForm(claseToForm(t));
    setEditId(t.id);
    setModal('editar');
  }, []);

  const closeModal = useCallback(() => { setModal(null); setErrorGuardar(null); }, []);

  const guardar = useCallback(async () => {
    const fields = {
      nombre: form.nombre.trim(),
      color: form.color,
      duracionMinutos: parseInt(form.duracionMinutos, 10) || 60,
      nivel: form.nivel,
      objetivos: form.objetivos,
      descripcion: form.descripcion.trim() || null,
      ventanaCancelacionHoras: form.ventanaCancelacionHoras.trim() === '' ? null : Math.max(0, parseInt(form.ventanaCancelacionHoras, 10) || 0),
      reservaExigirPlan: triABool(form.reservaExigirPlan),
      reservaVentanaMinimaMinutos: form.reservaVentanaMinimaMinutos.trim() === '' ? null : Math.max(0, parseInt(form.reservaVentanaMinimaMinutos, 10) || 0),
      reservaAntelacionMaximaDias: form.reservaAntelacionMaximaDias.trim() === '' ? null : Math.max(0, parseInt(form.reservaAntelacionMaximaDias, 10) || 0),
      permiteListaEspera: triABool(form.permiteListaEspera),
      requiereAprobacion: triABool(form.requiereAprobacion),
      listaEsperaPlazoAceptacionMinutos: form.listaEsperaPlazoAceptacionMinutos.trim() === '' ? null : Math.max(0, parseInt(form.listaEsperaPlazoAceptacionMinutos, 10) || 0),
      minimoAsistentesPorClase: form.minimoAsistentesPorClase.trim() === '' ? null : Math.max(0, parseInt(form.minimoAsistentesPorClase, 10) || 0),
      penalizacionImporteEur: form.penalizacionImporteEur.trim() === '' ? null : Math.max(0, Number(form.penalizacionImporteEur) || 0),
      especialidadNetwork: form.especialidadNetwork === '' ? null : form.especialidadNetwork,
      esOnline: form.esOnline,
    };
    if (modal === 'nueva') {
      // Esperamos a la base de datos antes de decir que está creado.
      setGuardando(true);
      setErrorGuardar(null);
      const res = await addTipoClase({ ...fields, fotoUrl: null });
      setGuardando(false);
      if (!res.ok) { setErrorGuardar(res.error); return; }
      showToast(`"${fields.nombre}" ya está guardado`);
    } else if (editId) {
      const res = await updateTipoClase(editId, fields);
      showToast(res.ok ? 'Tipo de clase actualizado' : res.error);
    }
    setModal(null);
  }, [modal, editId, form, addTipoClase, updateTipoClase, showToast]);

  const handleDelete = useCallback(async () => {
    if (!confirmDel) return;
    const res = await deleteTipoClase(confirmDel);
    showToast(res.ok ? 'Tipo de clase eliminado' : res.error);
  }, [confirmDel, deleteTipoClase, showToast]);

  // Los dos campos van en unidades distintas (min vs días) y ambos son
  // overrides opcionales ("hereda" si están vacíos, #867): solo se comparan
  // cuando ESTE tipo de clase fija los dos explícitamente.
  const minMinReserva = form.reservaVentanaMinimaMinutos.trim() === '' ? null : parseInt(form.reservaVentanaMinimaMinutos, 10) || 0;
  const maxDiasReserva = form.reservaAntelacionMaximaDias.trim() === '' ? null : parseInt(form.reservaAntelacionMaximaDias, 10) || 0;
  const ventanaImposible = minMinReserva != null && maxDiasReserva != null && minMinReserva > maxDiasReserva * 24 * 60;

  const canGuardar = form.nombre.trim() && form.duracionMinutos && !ventanaImposible;

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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiposClase.map(tc => (
          <div key={tc.id} className={cn(cardCls, 'p-4 flex flex-col gap-3')}>
            {/* Color + nombre */}
            <div className="flex items-center gap-3">
              <ColorSwatch color={tc.color} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{tc.nombre}</p>
                <p className="text-[11px] text-muted-foreground">{tc.duracionMinutos} min</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <NivelBadge nivel={tc.nivel} />
              {tc.descripcion && (
                <p className="text-[11px] text-muted-foreground truncate ml-2 flex-1 text-right">
                  {tc.descripcion}
                </p>
              )}
            </div>
            {overridesDeTipoClase(tc).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {overridesDeTipoClase(tc).map(chip => (
                  <span
                    key={chip}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-background text-muted-foreground"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {/* Actions */}
            <div className="flex items-center gap-1 pt-1 border-t border-background">
              <button
                onClick={() => openEditar(tc)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
              >
                <Pencil size={11} />
                Editar
              </button>
              <button
                onClick={() => setConfirmDel(tc.id)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors ml-auto"
              >
                <Trash2 size={11} />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      <Dialog open={modal !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-foreground">
              {modal === 'nueva' ? 'Nuevo tipo de clase' : 'Editar tipo de clase'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Field
              label="Nombre"
              description="Como se llama la clase en tu horario. La verá la clienta al reservar."
            >
              <input
                className={inputCls}
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Reformer Avanzado"
              />
            </Field>
            {/* La foto se sube una vez creada la clase (necesita su id). En vez
                de enseñar un campo que no se puede usar al crear, la sección de
                foto solo aparece al editar (P4). */}
            {editId && (
            <Field
              label="Foto de la clase"
              description="Se usa en todas partes donde aparece esta clase: portal de tus alumnas y sesión guiada. La suben una vez y vale para todas sus sesiones. Mientras no pongas la tuya se usa una foto de Tentare, elegida por el nombre de la clase. Lo ideal es 1600 × 900 px."
            >
                {/* La miniatura enseña la foto POR DEFECTO cuando no hay
                    ninguna subida — es lo que ven sus alumnas. El
                    `ColorSwatch` de antes daba a entender que la clase salía
                    solo con su color, y ya no es así.
                    El respaldo se recalcula con el NOMBRE del formulario, no
                    con el guardado: al renombrar «Clase abierta» a «Yoga
                    suave» la foto por defecto cambia mientras escribe. */}
                <CampoImagen
                  etiqueta={`foto de ${form.nombre || 'la clase'}`}
                  valor={editando?.fotoUrl}
                  respaldo={imagenDeClase({ nombre: form.nombre })}
                  onSubir={subirFotoDeClase}
                  onCambiar={guardarFotoDeClase}
                  ocupado={subiendoFoto}
                  clasePreview="w-16 h-16"
                  textoSubir="Subir foto"
                  textoCambiar="Cambiar foto"
                />
            </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field
              label="Duración (min)"
              description="Cuánto dura por defecto. Al crear una clase en la agenda se puede ajustar."
            >
                <input
                  className={inputCls}
                  type="number"
                  min={15}
                  step={5}
                  value={form.duracionMinutos}
                  onChange={e => setForm(f => ({ ...f, duracionMinutos: e.target.value }))}
                />
              </Field>
              <Field
              label="Nivel"
              description="Orienta a la clienta sobre si le encaja. No impide reservar."
            >
                <select
                  className={inputCls}
                  value={form.nivel}
                  onChange={e => setForm(f => ({ ...f, nivel: e.target.value as TipoClase['nivel'] }))}
                >
                  {(Object.keys(NIVEL_LABELS) as TipoClase['nivel'][]).map(n => (
                    <option key={n} value={n}>{NIVEL_LABELS[n]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field
              label="Especialidad en Tentare Network"
              description="Para sugerir sustitutas de Network cuando falte instructora en esta clase. Sin elegir una, esta clase no sugiere a nadie de fuera del equipo."
            >
              <select
                className={inputCls}
                value={form.especialidadNetwork}
                onChange={e => setForm(f => ({ ...f, especialidadNetwork: e.target.value as ClaseForm['especialidadNetwork'] }))}
              >
                <option value="">Sin mapear (no sugiere Network)</option>
                {ESPECIALIDADES_NETWORK.map(e => (
                  <option key={e} value={e}>{ESPECIALIDAD_LABEL[e]}</option>
                ))}
              </select>
            </Field>
            <Field
              label="¿Para qué sirve esta clase?"
              description="Lo usa el asistente de tu página pública para recomendarla. Si no marcas ninguno, la clase se ofrece para todos los objetivos."
            >
              <div className="flex flex-wrap gap-2">
                {OBJETIVOS.map(o => {
                  const activo = form.objetivos.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      title={o.ayuda}
                      aria-pressed={activo}
                      onClick={() => setForm(f => ({
                        ...f,
                        objetivos: activo ? f.objetivos.filter(x => x !== o.id) : [...f.objetivos, o.id],
                      }))}
                      className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium border ${
                        activo
                          ? 'border-transparent bg-brand text-brand-foreground'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field
              label="Clase online (Zoom)"
              description={
                zoomConectado
                  ? 'Cada sesión de este tipo de clase tendrá su propio enlace de Zoom, generado automáticamente.'
                  : 'Conecta tu cuenta de Zoom en Configuración → Integraciones para poder activar esto.'
              }
            >
              <div className="flex items-center gap-2.5">
                <Toggle
                  on={form.esOnline}
                  onChange={v => zoomConectado && setForm(f => ({ ...f, esOnline: v }))}
                />
                {!zoomConectado && !form.esOnline && (
                  <span className="text-[12px] text-muted-foreground">No disponible sin Zoom conectado</span>
                )}
              </div>
            </Field>
            <Field
              label="Ventana de cancelación (horas, opcional)"
              description="Antelación mínima para cancelar sin perder la sesión. Vacío = usa la ventana general del estudio."
            >
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="Ventana del estudio"
                value={form.ventanaCancelacionHoras}
                onChange={e => setForm(f => ({ ...f, ventanaCancelacionHoras: e.target.value }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Antelación mínima para reservar (min)"
                description="Vacío = usa el ajuste general del estudio."
              >
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  placeholder="Ajuste del estudio"
                  value={form.reservaVentanaMinimaMinutos}
                  onChange={e => setForm(f => ({ ...f, reservaVentanaMinimaMinutos: e.target.value }))}
                />
              </Field>
              <Field
                label="Antelación máxima para reservar (días)"
                description="Vacío = usa el ajuste general del estudio."
              >
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  placeholder="Ajuste del estudio"
                  value={form.reservaAntelacionMaximaDias}
                  onChange={e => setForm(f => ({ ...f, reservaAntelacionMaximaDias: e.target.value }))}
                />
              </Field>
            </div>
            {ventanaImposible && (
              <p role="alert" className="text-[12px] text-destructive">
                La antelación mínima ({form.reservaVentanaMinimaMinutos} min) es mayor que la máxima
                ({form.reservaAntelacionMaximaDias} días) — nunca habría un momento válido para reservar esta clase.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Exigir plan/bono activo"
                description="Vacío = usa el ajuste general del estudio."
              >
                <select
                  className={inputCls}
                  value={form.reservaExigirPlan}
                  onChange={e => setForm(f => ({ ...f, reservaExigirPlan: e.target.value as TriEstado }))}
                >
                  <option value="hereda">Usar el ajuste del estudio</option>
                  <option value="si">Sí, exigir</option>
                  <option value="no">No exigir</option>
                </select>
              </Field>
              <Field
                label="Permitir lista de espera"
                description="Vacío = usa el ajuste general del estudio."
              >
                <select
                  className={inputCls}
                  value={form.permiteListaEspera}
                  onChange={e => setForm(f => ({ ...f, permiteListaEspera: e.target.value as TriEstado }))}
                >
                  <option value="hereda">Usar el ajuste del estudio</option>
                  <option value="si">Sí, permitir</option>
                  <option value="no">No permitir</option>
                </select>
              </Field>
            </div>
            <Field
              label="Requiere aprobación manual"
              description="La reserva no se confirma sola: queda pendiente hasta que la apruebes o la rechaces desde el calendario. Vacío = usa el ajuste general del estudio."
            >
              <select
                className={inputCls}
                value={form.requiereAprobacion}
                onChange={e => setForm(f => ({ ...f, requiereAprobacion: e.target.value as TriEstado }))}
              >
                <option value="hereda">Usar el ajuste del estudio</option>
                <option value="si">Sí, requerir aprobación</option>
                <option value="no">No requerir</option>
              </select>
            </Field>
            <Field
              label="Plazo para aceptar una plaza liberada (minutos)"
              description="Con un plazo, la socia debe aceptar antes de que caduque o se ofrece a la siguiente. Vacío = usa el ajuste general del estudio."
            >
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="Ajuste del estudio"
                value={form.listaEsperaPlazoAceptacionMinutos}
                onChange={e => setForm(f => ({ ...f, listaEsperaPlazoAceptacionMinutos: e.target.value }))}
              />
            </Field>
            <Field
              label="Mínimo de asistentes para mantener la clase"
              description="Si a 2h del inicio no se alcanza, se cancela automáticamente y se devuelve el bono. Vacío = usa el ajuste general del estudio."
            >
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="Ajuste del estudio"
                value={form.minimoAsistentesPorClase}
                onChange={e => setForm(f => ({ ...f, minimoAsistentesPorClase: e.target.value }))}
              />
            </Field>
            <Field
              label="Penalización por cancelación tardía o no-show (€)"
              description="Vacío = usa el ajuste general del estudio."
              hint={
                <InfoTip label="Qué implica poner un importe aquí">
                  Se cobra a la tarjeta guardada de la socia, si tiene una. Aquí solo
                  cambias el IMPORTE para este tipo de clase: a qué motivos se aplica
                  (tardía, no-show, o ambos) y si el cobro es automático o espera tu
                  aprobación se decide en Configuración → Estudio → Reservas y
                  cancelaciones, y afecta también a esta clase.
                </InfoTip>
              }
            >
              <input
                className={inputCls}
                type="number"
                min={0}
                step="0.01"
                placeholder="Ajuste del estudio"
                value={form.penalizacionImporteEur}
                onChange={e => setForm(f => ({ ...f, penalizacionImporteEur: e.target.value }))}
              />
            </Field>
            <Field
              label="Color"
              description="Sirve para distinguir este tipo de clase de un vistazo en la agenda."
            >
              <ColorInput
                value={form.color}
                onChange={v => setForm(f => ({ ...f, color: v }))}
              />
            </Field>
            <Field
              label="Descripción (opcional)"
              description="Qué se trabaja y para quién es. Aparece en la página de reservas."
            >
              <textarea
                className={cn(inputCls, 'resize-none h-16')}
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Breve descripción de la clase..."
              />
            </Field>
          </div>
          {errorGuardar && (
            <p role="alert" className="mt-3 text-[13px] text-destructive">
              No se ha guardado. {errorGuardar}
            </p>
          )}
          <div className="flex gap-2 mt-4">
            <button className={cn(btnSecondary, 'flex-1 justify-center')} onClick={closeModal} disabled={guardando}>
              Cancelar
            </button>
            <button
              className={cn(btnPrimary, 'flex-1 justify-center')}
              onClick={guardar}
              disabled={!canGuardar || guardando}
            >
              {guardando ? 'Guardando…' : modal === 'nueva' ? 'Crear tipo de clase' : 'Guardar cambios'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDel}
        onOpenChange={open => !open && setConfirmDel(null)}
        title="¿Eliminar tipo de clase?"
        description="Se eliminará este tipo de clase. Las sesiones existentes no se verán afectadas."
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: SALAS
// ─────────────────────────────────────────────────────────────────────────────
