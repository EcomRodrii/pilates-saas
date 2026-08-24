'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2, ChevronLeft, ChevronRight, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { SelectorChips } from '@/components/network/selector-chips';
import { SeccionExperienciaNetwork } from '@/components/network/seccion-experiencia';
import { SeccionReferenciasNetwork } from '@/components/network/seccion-referencias';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';
import { fetchMiPerfilNetwork, guardarPerfilNetwork, cambiarEstadoPerfilNetwork, fetchSolicitudesContactoNetwork } from '@/lib/api-client';
import { subirFotoPerfilNetwork, validarFotoPerfil } from '@/lib/portal-storage';
import { calcularCompletitudPerfil, type DetalleCompletitud } from '@/lib/network/completitud';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from '@/lib/network/badges';
import type { PerfilNetwork, ExperienciaNetwork, ReferenciaNetwork } from '@/lib/network/tipos';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  HORARIOS_NETWORK, HORARIO_LABEL,
  TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';
import { cn } from '@/lib/utils';

// Onboarding de instructora EN PASOS (brief §16) — antes era un único
// formulario largo, que "se sentía como un formulario dentro del dashboard",
// no como dar de alta un perfil profesional. Los pasos son exactamente las 7
// secciones que ya pesaba lib/network/completitud.ts (nunca dos fuentes de
// verdad de "qué cuenta como completo"), más contacto privado (sin peso,
// nunca contó para el % — es dato de gestión, no de perfil) y una vista
// previa/publicar al final.
//
// Cada "Siguiente" GUARDA de verdad (PUT /api/network/perfil con el formulario
// entero acumulado hasta ahora) antes de avanzar — así cerrar el navegador a
// mitad no pierde nada, y volver mañana continúa donde lo dejó (brief §5):
// se abre en el primer paso todavía incompleto, no siempre en el paso 1.

interface FormState {
  nombre: string;
  ciudad: string;
  zona: string;
  radioKm: string;
  descripcion: string;
  especialidades: PerfilNetwork['especialidades'];
  aniosExperiencia: string;
  tarifaRango: PerfilNetwork['tarifaRango'] | undefined;
  disponibilidadEstado: PerfilNetwork['disponibilidadEstado'];
  disponibilidadHorarios: PerfilNetwork['disponibilidadHorarios'];
  tipoTrabajo: PerfilNetwork['tipoTrabajo'];
  emailContacto: string;
  telefonoContacto: string;
}

function formVacio(nombreInicial: string): FormState {
  return {
    nombre: nombreInicial, ciudad: '', zona: '', radioKm: '', descripcion: '',
    especialidades: [], aniosExperiencia: '', tarifaRango: undefined,
    disponibilidadEstado: 'no_disponible', disponibilidadHorarios: [], tipoTrabajo: [],
    emailContacto: '', telefonoContacto: '',
  };
}

function formDesdePerfil(p: PerfilNetwork): FormState {
  return {
    nombre: p.nombre,
    ciudad: p.ciudad ?? '',
    zona: p.zona ?? '',
    radioKm: p.radioKm != null ? String(p.radioKm) : '',
    descripcion: p.descripcion ?? '',
    especialidades: p.especialidades,
    aniosExperiencia: p.aniosExperiencia != null ? String(p.aniosExperiencia) : '',
    tarifaRango: p.tarifaRango ?? undefined,
    disponibilidadEstado: p.disponibilidadEstado,
    disponibilidadHorarios: p.disponibilidadHorarios,
    tipoTrabajo: p.tipoTrabajo,
    emailContacto: p.emailContacto ?? '',
    telefonoContacto: p.telefonoContacto ?? '',
  };
}

function saludoDelMomento(): string {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

type ClavePaso = 'basicos' | 'especialidades' | 'experiencia' | 'trabajo' | 'disponibilidad' | 'tarifa' | 'contacto' | 'vista_previa';

// `clave` en `DetalleCompletitud` cuando el paso cuenta para el %; `null` si
// no pesa (contacto privado, o la vista previa final).
const PASOS: { id: ClavePaso; titulo: string; clave: keyof DetalleCompletitud | null }[] = [
  { id: 'basicos', titulo: 'Datos básicos', clave: 'datosBasicos' },
  { id: 'especialidades', titulo: 'Especialidades', clave: 'especialidades' },
  { id: 'experiencia', titulo: 'Experiencia', clave: 'experiencia' },
  { id: 'trabajo', titulo: 'Dónde trabajas', clave: 'preferencias' },
  { id: 'disponibilidad', titulo: 'Disponibilidad', clave: 'disponibilidad' },
  { id: 'tarifa', titulo: 'Precio', clave: 'tarifa' },
  { id: 'contacto', titulo: 'Contacto privado', clave: null },
  { id: 'vista_previa', titulo: 'Vista previa', clave: null },
];

export default function MiPerfilNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const nombreDefecto = (user?.user_metadata?.nombre as string | undefined) ?? '';

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [form, setForm] = useState<FormState>(formVacio(nombreDefecto));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [experiencias, setExperiencias] = useState<ExperienciaNetwork[]>([]);
  const tieneExperiencia = experiencias.length > 0;
  const [referencias, setReferencias] = useState<ReferenciaNetwork[]>([]);
  const [paso, setPaso] = useState(0);
  const [pasoInicialElegido, setPasoInicialElegido] = useState(false);
  // "Oportunidades" (brief §18): cuántos estudios han escrito y siguen sin
  // respuesta — mismo dato que ya pinta /network/solicitudes, aquí solo el
  // recuento, para no duplicar esa pantalla dentro del resumen.
  const [solicitudesPendientes, setSolicitudesPendientes] = useState<number | null>(null);

  // Rediseño 2026-08: mi-perfil deja de ser el sitio del alta inicial (eso
  // es /network/crear-perfil, el wizard de 12 pasos) — pasa a ser el panel
  // de edición post-publicación. Sin perfil todavía, no hay nada que
  // editar aquí: se manda al wizard en vez de enseñar un formulario vacío.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMiPerfilNetwork().then(p => {
      if (!vivo) return;
      if (!p) { router.replace('/network/crear-perfil'); return; }
      setPerfil(p); setForm(formDesdePerfil(p));
      setCargando(false);
    });
    fetchSolicitudesContactoNetwork().then(sols => {
      if (vivo) setSolicitudesPendientes(sols.filter(s => s.estado === 'pendiente').length);
    });
    return () => { vivo = false; };
  }, [user, router]);

  const { porcentaje, detalle } = calcularCompletitudPerfil(
    {
      nombre: form.nombre ?? '',
      ciudad: form.ciudad || null,
      fotoUrl: perfil?.fotoUrl ?? null,
      especialidades: form.especialidades ?? [],
      disponibilidadHorarios: form.disponibilidadHorarios ?? [],
      tarifaRango: form.tarifaRango ?? null,
      tipoTrabajo: form.tipoTrabajo ?? [],
    },
    tieneExperiencia,
  );

  // Continuar donde lo dejó (brief §5): al cargar, si el perfil ya existe y
  // no está publicado, aterriza en el primer paso incompleto — no siempre en
  // el 1. Publicado (solo ajustando algo) → directo a la vista previa. Solo
  // se decide UNA vez, cuando los datos ya cargaron (si no, saltaría de paso
  // bajo los dedos de quien está escribiendo).
  // Decide UNA vez en qué paso aterriza, en cuanto los datos (perfil/
  // completitud) ya cargaron; no es estado derivable en cada render, es el
  // punto de partida — de ahí el guard `pasoInicialElegido` y los disables.
  useEffect(() => {
    if (cargando || pasoInicialElegido) return;
    if (perfil?.estado === 'published' || perfil?.estado === 'en_revision') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPaso(PASOS.length - 1);
      setPasoInicialElegido(true);
      return;
    }
    const idx = PASOS.findIndex(p => p.clave && !detalle[p.clave]);
    setPaso(idx === -1 ? PASOS.length - 1 : idx);
    setPasoInicialElegido(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, pasoInicialElegido]);

  async function guardar(): Promise<boolean> {
    setError('');
    setGuardando(true);
    const res = await guardarPerfilNetwork({
      nombre: form.nombre,
      ciudad: form.ciudad || null,
      zona: form.zona || null,
      radioKm: form.radioKm.trim() === '' ? null : Number(form.radioKm),
      descripcion: form.descripcion || null,
      especialidades: form.especialidades,
      aniosExperiencia: form.aniosExperiencia.trim() === '' ? null : Number(form.aniosExperiencia),
      tarifaRango: form.tarifaRango ?? null,
      disponibilidadEstado: form.disponibilidadEstado,
      disponibilidadHorarios: form.disponibilidadHorarios,
      tipoTrabajo: form.tipoTrabajo,
      emailContacto: form.emailContacto || null,
      telefonoContacto: form.telefonoContacto || null,
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return false; }
    setPerfil(res.perfil);
    setForm(formDesdePerfil(res.perfil));
    return true;
  }

  async function siguiente() {
    if (!(await guardar())) return;
    setPaso(p => Math.min(p + 1, PASOS.length - 1));
  }

  async function cambiarEstado(estado: 'en_revision' | 'hidden') {
    setErrorEstado('');
    setCambiandoEstado(true);
    const res = await cambiarEstadoPerfilNetwork(estado);
    setCambiandoEstado(false);
    if (!res.ok) { setErrorEstado(res.error); return; }
    setPerfil(res.perfil);
    showToast(estado === 'en_revision' ? 'Enviado a revisión' : 'Perfil oculto');
  }

  async function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !perfil) return;
    const invalido = validarFotoPerfil(file);
    if (invalido) { setErrorFoto(invalido); return; }
    setErrorFoto('');
    setSubiendoFoto(true);
    const result = await subirFotoPerfilNetwork(perfil.id, file);
    setSubiendoFoto(false);
    if ('error' in result) { setErrorFoto(result.error); return; }
    const res = await guardarPerfilNetwork({ fotoUrl: result.url });
    if (!res.ok) { setErrorFoto(res.error); return; }
    setPerfil(res.perfil);
    showToast('Foto actualizada');
  }

  const badges = useMemo(() => ({
    emailVerificado: emailVerificado(user?.email_confirmed_at ?? null),
    experienciaVerificada: experienciaVerificada(experiencias.map(e => e.estadoVerificacion)),
    referenciaProfesional: referenciaProfesional(referencias.filter(r => r.estado === 'confirmada').length),
    identidadVerificada: identidadVerificada(perfil?.identidadVerificadaEn ?? null),
    activaRecientemente: activaRecientemente(perfil?.ultimoAccesoEn ?? null, new Date()),
  }), [user, experiencias, referencias, perfil]);

  if (cargandoSesion || !user || cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const idPaso = PASOS[paso].id;
  const esUltimoPaso = paso === PASOS.length - 1;

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Mi perfil en Network"
        description="Cómo te ven los estudios que buscan profesionales de Pilates y Yoga en Tentare Network."
      />

      {/* Progreso: barra por %, más los pasos como puntos clicables — saltar
          hacia atrás siempre está permitido (es su propio perfil), hacia
          delante no (evita publicar sin haber pasado por lo mínimo). */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-medium text-foreground">Tu perfil está al {porcentaje}%</p>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-3">
          <div
            className={cn('h-full rounded-full bg-brand transition-all', porcentaje === 100 && 'bg-success')}
            style={{ width: `${porcentaje}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PASOS.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => i <= paso && setPaso(i)}
              disabled={i > paso}
              aria-current={i === paso}
              className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                i === paso
                  ? 'bg-brand text-brand-foreground border-brand'
                  : i < paso
                    ? 'bg-muted text-foreground border-border hover:bg-muted/70 cursor-pointer'
                    : 'bg-transparent text-muted-foreground border-border/60 cursor-not-allowed',
              )}
            >
              {i + 1}. {p.titulo}
            </button>
          ))}
        </div>
      </div>

      {idPaso === 'basicos' && (
        <div className="space-y-5">
          <div className={`${cardCls} p-6`}>
            <div className="flex items-center gap-4 mb-1">
              <div className="relative shrink-0">
                <ProfileAvatar fotoUrl={perfil?.fotoUrl} nombre={form.nombre || 'Tu nombre'} size="xl" />
                {subiendoFoto && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <Loader2 size={18} className="text-white animate-spin" />
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!perfil}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center hover:bg-background transition-colors disabled:opacity-40"
                  aria-label="Subir foto"
                >
                  <Camera size={14} className="text-foreground" />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground">
                  {perfil
                    ? 'Sube una foto de tu cara — es lo primero que ve un estudio.'
                    : 'Guarda tus datos básicos primero para poder subir tu foto.'}
                </p>
                {errorFoto && <p className="text-[11px] text-destructive mt-1">{errorFoto}</p>}
              </div>
            </div>
          </div>

          <div className={`${cardCls} p-6 space-y-4`}>
            <h3 className="text-[14px] font-semibold text-foreground">Datos básicos</h3>
            <div>
              <p className={labelCls}>Nombre</p>
              <input className={inputCls} value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={labelCls}>Ciudad</p>
                <input className={inputCls} value={form.ciudad} onChange={e => setForm(f => ({ ...f, ciudad: e.target.value }))} placeholder="Barcelona" />
              </div>
              <div>
                <p className={labelCls}>Zona</p>
                <input className={inputCls} value={form.zona} onChange={e => setForm(f => ({ ...f, zona: e.target.value }))} placeholder="Gràcia" />
              </div>
            </div>
            <div>
              <p className={labelCls}>Radio aproximado (km)</p>
              <input
                type="number" min={0} className={inputCls}
                value={form.radioKm} onChange={e => setForm(f => ({ ...f, radioKm: e.target.value }))}
              />
            </div>
            <div>
              <p className={labelCls}>Descripción</p>
              <textarea
                className={`${inputCls} min-h-24 resize-y`}
                value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                placeholder="Cuéntale a un estudio quién eres y cómo trabajas."
              />
            </div>
          </div>
        </div>
      )}

      {idPaso === 'especialidades' && (
        <div className={`${cardCls} p-6 space-y-3`}>
          <h3 className="text-[14px] font-semibold text-foreground">Especialidades</h3>
          <p className="text-[12.5px] text-muted-foreground -mt-1">En qué disciplina y técnicas estás especializada.</p>
          <SelectorChips
            opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
            seleccion={form.especialidades ?? []}
            onChange={sel => setForm(f => ({ ...f, especialidades: sel }))}
          />
        </div>
      )}

      {idPaso === 'experiencia' && (
        <div className="space-y-5">
          <div className={`${cardCls} p-6 space-y-4`}>
            <h3 className="text-[14px] font-semibold text-foreground">Años de experiencia</h3>
            <input
              type="number" min={0} className={inputCls}
              value={form.aniosExperiencia} onChange={e => setForm(f => ({ ...f, aniosExperiencia: e.target.value }))}
            />
          </div>
          {perfil && <SeccionExperienciaNetwork onExperienciasChange={setExperiencias} />}
          {perfil && <SeccionReferenciasNetwork onReferenciasChange={setReferencias} />}
        </div>
      )}

      {idPaso === 'trabajo' && (
        <div className={`${cardCls} p-6 space-y-3`}>
          <h3 className="text-[14px] font-semibold text-foreground">Dónde trabajas</h3>
          <p className="text-[12.5px] text-muted-foreground -mt-1">Qué tipo de trabajo aceptas.</p>
          <SelectorChips
            opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
            seleccion={form.tipoTrabajo ?? []}
            onChange={sel => setForm(f => ({ ...f, tipoTrabajo: sel }))}
          />
        </div>
      )}

      {idPaso === 'disponibilidad' && (
        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="text-[14px] font-semibold text-foreground">Disponibilidad</h3>
          <div>
            <p className={labelCls}>Estado</p>
            <select
              className={inputCls}
              value={form.disponibilidadEstado}
              onChange={e => setForm(f => ({ ...f, disponibilidadEstado: e.target.value as FormState['disponibilidadEstado'] }))}
            >
              {DISPONIBILIDAD_ESTADOS_NETWORK.map(v => <option key={v} value={v}>{DISPONIBILIDAD_ESTADO_LABEL[v]}</option>)}
            </select>
          </div>
          <div>
            <p className={labelCls}>Horarios</p>
            <SelectorChips
              opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
              seleccion={form.disponibilidadHorarios ?? []}
              onChange={sel => setForm(f => ({ ...f, disponibilidadHorarios: sel }))}
            />
          </div>
        </div>
      )}

      {idPaso === 'tarifa' && (
        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="text-[14px] font-semibold text-foreground">Tarifa orientativa</h3>
          <select
            className={inputCls}
            value={form.tarifaRango ?? ''}
            onChange={e => setForm(f => ({ ...f, tarifaRango: (e.target.value || undefined) as FormState['tarifaRango'] }))}
          >
            <option value="">Sin especificar</option>
            {TARIFAS_RANGO_NETWORK.map(v => <option key={v} value={v}>{TARIFA_RANGO_LABEL[v]}</option>)}
          </select>
        </div>
      )}

      {idPaso === 'contacto' && (
        <div className={`${cardCls} p-6 space-y-4`}>
          <h3 className="text-[14px] font-semibold text-foreground">Contacto privado</h3>
          <p className="text-[12px] text-muted-foreground -mt-2">
            Nunca se muestra en tu perfil público. Solo se revela a un estudio si aceptas su solicitud de contacto.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={labelCls}>Email de contacto</p>
              <input type="email" className={inputCls} value={form.emailContacto} onChange={e => setForm(f => ({ ...f, emailContacto: e.target.value }))} />
            </div>
            <div>
              <p className={labelCls}>Teléfono de contacto</p>
              <input type="tel" className={inputCls} value={form.telefonoContacto} onChange={e => setForm(f => ({ ...f, telefonoContacto: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {idPaso === 'vista_previa' && (
        <div className="space-y-5">
          {perfil && (
            <div className={`${cardCls} p-6`}>
              <p className="text-[16px] font-semibold text-foreground mb-3">
                {saludoDelMomento()}, {form.nombre.split(' ')[0] || 'de nuevo'} 👋
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  href="/network/solicitudes"
                  className="rounded-xl border border-border p-3.5 hover:bg-muted/50 transition-colors"
                >
                  <p className="text-[20px] font-semibold text-foreground">
                    {solicitudesPendientes ?? <Loader2 size={16} className="animate-spin inline text-muted-foreground" />}
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    {solicitudesPendientes === 1 ? 'solicitud sin responder' : 'solicitudes sin responder'}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => setPaso(PASOS.findIndex(p => p.id === 'disponibilidad'))}
                  className="rounded-xl border border-border p-3.5 text-left hover:bg-muted/50 transition-colors"
                >
                  <p className="text-[13px] font-medium text-foreground">{DISPONIBILIDAD_ESTADO_LABEL[form.disponibilidadEstado]}</p>
                  <p className="text-[12px] text-muted-foreground">Actualizar disponibilidad</p>
                </button>
              </div>
            </div>
          )}

          {perfil && (
            <div className={`${cardCls} p-6`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mb-1.5"
                    style={{
                      backgroundColor: perfil.estado === 'published' ? '#EAF6EE' : perfil.estado === 'en_revision' ? '#FBF3DE' : '#F1F2EA',
                      color: perfil.estado === 'published' ? '#276749' : perfil.estado === 'en_revision' ? '#8A6A25' : '#5A6142',
                    }}
                  >
                    {perfil.estado === 'published' ? 'Publicado'
                      : perfil.estado === 'suspended' ? 'Suspendido'
                        : perfil.estado === 'en_revision' ? 'En revisión'
                          : 'Borrador'}
                  </span>
                  <p className="text-[13px] text-muted-foreground">
                    {perfil.estado === 'published'
                      ? 'Tu perfil es visible para los estudios que buscan en Tentare Network.'
                      : perfil.estado === 'suspended'
                        ? 'Tu perfil ha sido suspendido por moderación.'
                        : perfil.estado === 'en_revision'
                          ? 'El equipo de Tentare lo está revisando antes de publicarlo — normalmente en menos de 48 h.'
                          : 'Tu perfil todavía no es visible para ningún estudio.'}
                  </p>
                  {errorEstado && <p className="text-[12px] text-destructive mt-1.5">{errorEstado}</p>}
                </div>
                {(perfil.estado === 'draft' || perfil.estado === 'published') && (
                  <button
                    onClick={() => cambiarEstado(perfil.estado === 'published' ? 'hidden' : 'en_revision')}
                    disabled={cambiandoEstado}
                    className={cn(
                      'shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60',
                      perfil.estado === 'published'
                        ? 'bg-card border border-border text-foreground hover:bg-muted'
                        : 'bg-brand text-brand-foreground hover:brightness-95',
                    )}
                  >
                    {cambiandoEstado ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : perfil.estado === 'published' ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                    {perfil.estado === 'published' ? 'Ocultar perfil' : 'Enviar a revisión'}
                  </button>
                )}
                {perfil.estado === 'hidden' && (
                  <button
                    onClick={() => cambiarEstado('en_revision')}
                    disabled={cambiandoEstado}
                    className="shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-medium flex items-center gap-1.5 transition-colors disabled:opacity-60 bg-brand text-brand-foreground hover:brightness-95"
                  >
                    {cambiandoEstado ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                    Enviar a revisión
                  </button>
                )}
                {perfil.estado === 'suspended' && <ShieldAlert size={18} className="text-destructive shrink-0 mt-0.5" />}
              </div>
            </div>
          )}

          {perfil && (
            <div className={`${cardCls} p-6`}>
              <h3 className="text-[14px] font-semibold text-foreground mb-2">Así te ven los estudios</h3>
              <ListaBadgesNetwork badges={badges} />
              {!badges.emailVerificado && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Confirma tu email con el código de 6 dígitos que te enviamos al crear tu cuenta
                  para conseguir este badge.
                </p>
              )}
            </div>
          )}

          <div className={`${cardCls} p-6 space-y-3`}>
            <div className="flex items-center gap-3">
              <ProfileAvatar fotoUrl={perfil?.fotoUrl} nombre={form.nombre || 'Tu nombre'} size="lg" />
              <div>
                <p className="text-[14px] font-semibold text-foreground">{form.nombre || 'Sin nombre'}</p>
                <p className="text-[12.5px] text-muted-foreground">{form.ciudad || 'Sin ciudad'}{form.zona ? ` · ${form.zona}` : ''}</p>
              </div>
            </div>
            {form.especialidades.length > 0 && (
              <p className="text-[12.5px] text-foreground">{form.especialidades.map(e => ESPECIALIDAD_LABEL[e]).join(' · ')}</p>
            )}
            <p className="text-[12px] text-muted-foreground">
              {form.tarifaRango ? TARIFA_RANGO_LABEL[form.tarifaRango] : 'Tarifa sin especificar'}
              {' · '}
              {DISPONIBILIDAD_ESTADO_LABEL[form.disponibilidadEstado]}
            </p>
            {perfil?.slug && perfil.estado === 'published' && (
              <a href={`/network/instructoras/${perfil.slug}`} target="_blank" rel="noreferrer" className="text-[12px] text-brand font-medium inline-block">
                Ver mi perfil público →
              </a>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setPaso(p => Math.max(p - 1, 0))}
          disabled={paso === 0}
          className="px-3.5 py-2 rounded-lg text-[12.5px] font-medium text-foreground disabled:opacity-0 flex items-center gap-1 hover:bg-muted transition-colors"
        >
          <ChevronLeft size={14} /> Anterior
        </button>
        {!esUltimoPaso ? (
          <button
            onClick={siguiente}
            disabled={guardando || (idPaso === 'basicos' && !form.nombre.trim())}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12.5px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <>Siguiente <ChevronRight size={14} /></>}
          </button>
        ) : (
          <button
            onClick={async () => { if (await guardar()) showToast('Cambios guardados'); }}
            disabled={guardando}
            className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5 disabled:opacity-60"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </button>
        )}
      </div>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
