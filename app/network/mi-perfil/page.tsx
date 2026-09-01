'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2, Eye, EyeOff, ShieldAlert, Star } from 'lucide-react';
import { Toast, useToast } from '@/components/ui/toast';
import { SelectorChips } from '@/components/network/selector-chips';
import { SeccionExperienciaNetwork } from '@/components/network/seccion-experiencia';
import { SeccionReferenciasNetwork } from '@/components/network/seccion-referencias';
import { SeccionPortfolioNetwork } from '@/components/network/seccion-portfolio';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { useAuth } from '@/lib/auth-context';
import { fetchMiPerfilNetwork, guardarPerfilNetwork, cambiarEstadoPerfilNetwork } from '@/lib/api-client';
import { subirFotoPerfilNetwork, validarFotoPerfil } from '@/lib/portal-storage';
import { fetchMisEstudios, type SedeSeleccionable } from '@/lib/supabase-data';
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
import { usePerfilNetwork } from '@/lib/network/perfil-network-context';
import {
  NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAND, NW_PRODUCTO, NW_VERDE_OSCURO, NW_ESTADO, NW_ESTRELLA,
} from '@/components/network-v2/tokens';
import { cn } from '@/lib/utils';

// Rediseño 2026-09 (Fase 2 del mockup del fundador) — pasa de wizard de 8
// pasos a pantalla de edición directa con preview en vivo al lado, mismo
// principio que ya aplicó Fase 1 (Inicio): un solo scroll, sin "Siguiente/
// Anterior". Los datos y el guardado incremental NO cambian — sigue siendo
// PUT /api/network/perfil con el formulario acumulado; lo que cambia es que
// ahora todo el formulario vive en una sola pantalla en vez de repartido en
// pasos con navegación propia.
//
// Experiencia/Referencias/Portfolio se REUTILIZAN tal cual
// (SeccionExperienciaNetwork/SeccionReferenciasNetwork/SeccionPortfolioNetwork)
// — cada una ya gestiona su propio guardado independiente del formulario
// principal (son tablas aparte), así que no hace falta ningún cambio ahí,
// solo reflow. SeccionExperienciaNetwork ya tenía un modo `tokensNetworkV2`
// pensado exactamente para esto; Referencias/Portfolio se quedan con su
// `cardCls` de panel — auditoría de sistema de diseño 2026-08-18 ya dejó
// constancia de que --brand/--foreground/--border de Studio coinciden con
// NW_PRODUCTO/NW_TINTA/NW_BORDE por ahora, así que no desentonan; darles su
// propio modo v2 es tarea de otra fase si hace falta.
//
// `idiomas` gana editor aquí — existía en el modelo y en el wizard de alta
// (`/network/crear-perfil`) pero nunca tuvo UI de edición POSTERIOR en
// mi-perfil (auditoría antes de tocar nada). Mismo patrón de texto separado
// por comas que ya usa el wizard (`idiomasTexto`), no un selector nuevo.

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
  mostrarEstudiosActuales: boolean;
  idiomasTexto: string;
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
    mostrarEstudiosActuales: p.mostrarEstudiosActuales,
    idiomasTexto: p.idiomas.join(', '),
  };
}

function TituloSeccion({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[13px] font-extrabold uppercase tracking-[.06em] mb-3" style={{ color: NW_MUTED_2 }}>{children}</h2>;
}

const campoLabel = 'text-[11px] font-bold uppercase tracking-wide mb-1.5 block';
function campoInputStyle(): React.CSSProperties {
  return { border: `1px solid ${NW_BORDE}`, color: NW_TINTA, background: '#fff' };
}
const campoCls = 'w-full px-3.5 py-2.5 rounded-xl text-[13.5px] outline-none focus:ring-2 focus:ring-offset-0';

export default function MiPerfilNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const { refetch: refetchShell } = usePerfilNetwork();

  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [experiencias, setExperiencias] = useState<ExperienciaNetwork[]>([]);
  const [referencias, setReferencias] = useState<ReferenciaNetwork[]>([]);
  const [sedesActuales, setSedesActuales] = useState<SedeSeleccionable[]>([]);
  const [cargandoSedes, setCargandoSedes] = useState(true);

  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/acceso');
  }, [cargandoSesion, user, router]);

  // Sin perfil todavía, no hay nada que editar aquí: se manda al wizard de
  // alta (/network/crear-perfil) en vez de enseñar un formulario vacío.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    fetchMiPerfilNetwork().then(p => {
      if (!vivo) return;
      if (!p) { router.replace('/network/crear-perfil'); return; }
      setPerfil(p); setForm(formDesdePerfil(p));
      setCargando(false);
    });
    fetchMisEstudios().then(sedes => {
      if (vivo) { setSedesActuales(sedes); setCargandoSedes(false); }
    });
    return () => { vivo = false; };
  }, [user, router]);

  const badges = useMemo(() => ({
    emailVerificado: emailVerificado(user?.email_confirmed_at ?? null),
    experienciaVerificada: experienciaVerificada(experiencias.map(e => e.estadoVerificacion)),
    referenciaProfesional: referenciaProfesional(referencias.filter(r => r.estado === 'confirmada').length),
    identidadVerificada: identidadVerificada(perfil?.identidadVerificadaEn ?? null),
    activaRecientemente: activaRecientemente(perfil?.ultimoAccesoEn ?? null, new Date()),
  }), [user, experiencias, referencias, perfil]);

  if (cargandoSesion || !user || cargando || !form || !perfil) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin" style={{ color: NW_MUTED }} />
      </div>
    );
  }

  async function guardar() {
    setError('');
    setGuardando(true);
    const f = form!;
    const res = await guardarPerfilNetwork({
      nombre: f.nombre,
      ciudad: f.ciudad || null,
      zona: f.zona || null,
      radioKm: f.radioKm.trim() === '' ? null : Number(f.radioKm),
      descripcion: f.descripcion || null,
      especialidades: f.especialidades,
      aniosExperiencia: f.aniosExperiencia.trim() === '' ? null : Number(f.aniosExperiencia),
      tarifaRango: f.tarifaRango ?? null,
      disponibilidadEstado: f.disponibilidadEstado,
      disponibilidadHorarios: f.disponibilidadHorarios,
      tipoTrabajo: f.tipoTrabajo,
      emailContacto: f.emailContacto || null,
      telefonoContacto: f.telefonoContacto || null,
      mostrarEstudiosActuales: f.mostrarEstudiosActuales,
      idiomas: f.idiomasTexto.split(',').map(v => v.trim()).filter(Boolean),
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return; }
    setPerfil(res.perfil);
    setForm(formDesdePerfil(res.perfil));
    refetchShell();
    showToast('Cambios guardados');
  }

  async function cambiarEstado(estado: 'en_revision' | 'hidden') {
    setErrorEstado('');
    setCambiandoEstado(true);
    const res = await cambiarEstadoPerfilNetwork(estado);
    setCambiandoEstado(false);
    if (!res.ok) { setErrorEstado(res.error); return; }
    setPerfil(res.perfil);
    refetchShell();
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
    refetchShell();
    showToast('Foto actualizada');
  }

  const estadoLabel = perfil.estado === 'published' ? 'Publicado'
    : perfil.estado === 'suspended' ? 'Suspendido'
      : perfil.estado === 'en_revision' ? 'En revisión' : 'Borrador';
  const estadoEstilo = perfil.estado === 'published'
    ? { background: NW_ESTADO.verificada.fondo, color: NW_ESTADO.verificada.color }
    : perfil.estado === 'en_revision'
      ? { background: NW_ESTADO.pendiente.fondo, color: NW_ESTADO.pendiente.color }
      : { background: NW_SAND, color: NW_MUTED_2 };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-extrabold" style={{ color: NW_TINTA }}>Mi perfil</h1>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={estadoEstilo}>{estadoLabel}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        <div className="space-y-6">
          {/* Identidad */}
          <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <div className="flex items-center gap-4 mb-5">
              <div className="relative shrink-0">
                {perfil.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora
                  <img src={perfil.fotoUrl} alt={form.nombre} className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-extrabold text-white" style={{ background: NW_PRODUCTO }}>
                    {form.nombre.trim().charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                {subiendoFoto && (
                  <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                    <Loader2 size={16} className="text-white animate-spin" />
                  </div>
                )}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white flex items-center justify-center hover:opacity-80 transition-opacity"
                  style={{ border: `1px solid ${NW_BORDE}` }}
                  aria-label="Cambiar foto"
                >
                  <Camera size={12} style={{ color: NW_TINTA }} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
              </div>
              <div>
                <p className="text-[16px] font-extrabold" style={{ color: NW_TINTA }}>{form.nombre || 'Tu nombre'}</p>
                <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>
                  {form.ciudad || 'Sin ciudad'} · en Network desde {new Date(perfil.creadoEn).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                </p>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[12px] font-bold mt-1" style={{ color: NW_PRODUCTO }}>
                  Cambiar foto
                </button>
                {errorFoto && <p className="text-[11px] mt-1" style={{ color: '#A04A3C' }}>{errorFoto}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <div>
                <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Nombre</label>
                <input className={campoCls} style={campoInputStyle()} value={form.nombre} onChange={e => setForm(f => f && { ...f, nombre: e.target.value })} />
              </div>
              <div>
                <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Ciudad</label>
                <input className={campoCls} style={campoInputStyle()} value={form.ciudad} onChange={e => setForm(f => f && { ...f, ciudad: e.target.value })} placeholder="Barcelona" />
              </div>
            </div>

            <div>
              <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Bio</label>
              <textarea
                className={cn(campoCls, 'min-h-28 resize-y')} style={campoInputStyle()}
                value={form.descripcion} onChange={e => setForm(f => f && { ...f, descripcion: e.target.value })}
                placeholder="Cuéntale a un estudio quién eres y cómo trabajas."
              />
            </div>
          </div>

          {/* Especialidades */}
          <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <TituloSeccion>Especialidades</TituloSeccion>
            <SelectorChips
              v2
              opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
              seleccion={form.especialidades}
              onChange={sel => setForm(f => f && { ...f, especialidades: sel })}
            />
          </div>

          {/* Tarifa + idiomas */}
          <div className="rounded-2xl p-6 grid sm:grid-cols-2 gap-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <div>
              <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Tarifa orientativa</label>
              <select
                className={campoCls} style={campoInputStyle()}
                value={form.tarifaRango ?? ''}
                onChange={e => setForm(f => f && { ...f, tarifaRango: (e.target.value || undefined) as FormState['tarifaRango'] })}
              >
                <option value="">Sin especificar</option>
                {TARIFAS_RANGO_NETWORK.map(v => <option key={v} value={v}>{TARIFA_RANGO_LABEL[v]}</option>)}
              </select>
            </div>
            <div>
              <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Idiomas</label>
              <input
                className={campoCls} style={campoInputStyle()}
                value={form.idiomasTexto} onChange={e => setForm(f => f && { ...f, idiomasTexto: e.target.value })}
                placeholder="Español, Catalán, Inglés"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={guardar}
              disabled={guardando || !form.nombre.trim()}
              className="px-5 py-2.5 rounded-full text-[13.5px] font-bold text-white flex items-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-90"
              style={{ background: NW_PRODUCTO }}
            >
              {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {error && <p className="text-[12px]" style={{ color: '#A04A3C' }}>{error}</p>}
          </div>

          {/* Experiencia (reutiliza el CRUD ya existente, guardado propio) */}
          <SeccionExperienciaNetwork onExperienciasChange={setExperiencias} tokensNetworkV2 />
          <SeccionReferenciasNetwork onReferenciasChange={setReferencias} />
          {user && <SeccionPortfolioNetwork authUserId={user.id} />}

          {/* Dónde trabajas */}
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <div>
              <TituloSeccion>Dónde trabajas</TituloSeccion>
              <p className="text-[12.5px] mb-3" style={{ color: NW_MUTED }}>Qué tipo de trabajo aceptas.</p>
              <SelectorChips
                v2
                opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
                seleccion={form.tipoTrabajo}
                onChange={sel => setForm(f => f && { ...f, tipoTrabajo: sel })}
              />
            </div>
            <div className="pt-4" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[13.5px] font-bold" style={{ color: NW_TINTA }}>Actualmente en Tentare</p>
                  <p className="text-[12px] mt-0.5" style={{ color: NW_MUTED }}>
                    Muestra en tu perfil público las sedes donde trabajas hoy. Apagado por defecto.
                  </p>
                </div>
                <button
                  type="button" role="switch" aria-checked={form.mostrarEstudiosActuales}
                  onClick={() => setForm(f => f && { ...f, mostrarEstudiosActuales: !f.mostrarEstudiosActuales })}
                  className="shrink-0 w-10 h-6 rounded-full transition-colors relative"
                  style={{ background: form.mostrarEstudiosActuales ? NW_PRODUCTO : NW_SAND }}
                >
                  <span
                    className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform"
                    style={{ transform: form.mostrarEstudiosActuales ? 'translateX(16px)' : 'none' }}
                  />
                </button>
              </div>
              {form.mostrarEstudiosActuales && (
                <div className="mt-3">
                  {cargandoSedes ? (
                    <Loader2 size={14} className="animate-spin" style={{ color: NW_MUTED }} />
                  ) : sedesActuales.length === 0 ? (
                    <p className="text-[12px]" style={{ color: NW_MUTED }}>Hoy no trabajas en ninguna sede de Tentare.</p>
                  ) : (
                    <ul className="space-y-1">
                      {sedesActuales.map(s => (
                        <li key={s.id} className="text-[12.5px]" style={{ color: NW_TINTA }}>{s.nombre}{s.ciudad ? ` · ${s.ciudad}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Disponibilidad — las 4 franjas reales del catálogo
              (mananas/tardes/noches/fines_semana), no un calendario L-D
              inventado: el modelo no guarda disponibilidad por día concreto. */}
          <div className="rounded-2xl p-6 space-y-4" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <TituloSeccion>Disponibilidad</TituloSeccion>
            <div>
              <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Estado</label>
              <select
                className={campoCls} style={campoInputStyle()}
                value={form.disponibilidadEstado}
                onChange={e => setForm(f => f && { ...f, disponibilidadEstado: e.target.value as FormState['disponibilidadEstado'] })}
              >
                {DISPONIBILIDAD_ESTADOS_NETWORK.map(v => <option key={v} value={v}>{DISPONIBILIDAD_ESTADO_LABEL[v]}</option>)}
              </select>
            </div>
            <div>
              <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Horarios</label>
              <SelectorChips
                v2
                opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
                seleccion={form.disponibilidadHorarios}
                onChange={sel => setForm(f => f && { ...f, disponibilidadHorarios: sel })}
              />
            </div>
          </div>

          {/* Contacto privado */}
          <div className="rounded-2xl p-6 space-y-3" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <div>
              <TituloSeccion>Contacto privado</TituloSeccion>
              <p className="text-[12px] -mt-2 mb-3" style={{ color: NW_MUTED }}>
                Nunca se muestra en tu perfil público. Solo se revela a un estudio si aceptas su solicitud de contacto.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Email de contacto</label>
                <input type="email" className={campoCls} style={campoInputStyle()} value={form.emailContacto} onChange={e => setForm(f => f && { ...f, emailContacto: e.target.value })} />
              </div>
              <div>
                <label className={campoLabel} style={{ color: NW_MUTED_2 }}>Teléfono de contacto</label>
                <input type="tel" className={campoCls} style={campoInputStyle()} value={form.telefonoContacto} onChange={e => setForm(f => f && { ...f, telefonoContacto: e.target.value })} />
              </div>
            </div>
          </div>

          {/* Estado de publicación */}
          <div className="rounded-2xl p-6" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold mb-1.5" style={estadoEstilo}>{estadoLabel}</span>
                <p className="text-[13px]" style={{ color: NW_MUTED }}>
                  {perfil.estado === 'published'
                    ? 'Tu perfil es visible para los estudios que buscan en Tentare Network.'
                    : perfil.estado === 'suspended'
                      ? 'Tu perfil ha sido suspendido por moderación.'
                      : perfil.estado === 'en_revision'
                        ? 'El equipo de Tentare lo está revisando antes de publicarlo — normalmente en menos de 48 h.'
                        : 'Tu perfil todavía no es visible para ningún estudio.'}
                </p>
                {errorEstado && <p className="text-[12px] mt-1.5" style={{ color: '#A04A3C' }}>{errorEstado}</p>}
              </div>
              {(perfil.estado === 'draft' || perfil.estado === 'published') && (
                <button
                  onClick={() => cambiarEstado(perfil.estado === 'published' ? 'hidden' : 'en_revision')}
                  disabled={cambiandoEstado}
                  className="shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-60 transition-opacity hover:opacity-90"
                  style={perfil.estado === 'published'
                    ? { background: '#fff', border: `1px solid ${NW_BORDE}`, color: NW_TINTA }
                    : { background: NW_PRODUCTO, color: '#fff' }}
                >
                  {cambiandoEstado ? <Loader2 size={14} className="animate-spin" /> : perfil.estado === 'published' ? <EyeOff size={14} /> : <Eye size={14} />}
                  {perfil.estado === 'published' ? 'Ocultar perfil' : 'Enviar a revisión'}
                </button>
              )}
              {perfil.estado === 'hidden' && (
                <button
                  onClick={() => cambiarEstado('en_revision')}
                  disabled={cambiandoEstado}
                  className="shrink-0 px-3.5 py-2 rounded-lg text-[12px] font-bold flex items-center gap-1.5 disabled:opacity-60 text-white"
                  style={{ background: NW_PRODUCTO }}
                >
                  {cambiandoEstado ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                  Enviar a revisión
                </button>
              )}
              {perfil.estado === 'suspended' && <ShieldAlert size={18} style={{ color: '#A04A3C' }} className="shrink-0 mt-0.5" />}
            </div>
          </div>
        </div>

        {/* Preview en vivo */}
        <div className="space-y-4 lg:sticky lg:top-6 self-start">
          <div className="rounded-2xl p-5" style={{ background: NW_VERDE_OSCURO }}>
            <p className="text-[10.5px] font-bold uppercase tracking-wide mb-3" style={{ color: 'rgba(255,255,255,.5)' }}>Así te ven los estudios</p>
            <div className="flex items-center gap-3 mb-3">
              {perfil.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño, foto subida por la instructora
                <img src={perfil.fotoUrl} alt={form.nombre} className="w-11 h-11 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-extrabold shrink-0" style={{ background: 'rgba(255,255,255,.12)', color: '#fff' }}>
                  {form.nombre.trim().charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[14px] font-extrabold text-white truncate">{form.nombre || 'Sin nombre'}</p>
                <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,.6)' }}>{form.ciudad || 'Sin ciudad'}{form.zona ? ` · ${form.zona}` : ''}</p>
              </div>
            </div>
            {form.especialidades.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {form.especialidades.map(e => (
                  <span key={e} className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'rgba(255,255,255,.1)', color: '#fff' }}>
                    {ESPECIALIDAD_LABEL[e]}
                  </span>
                ))}
              </div>
            )}
            {form.descripcion && (
              <p className="text-[12.5px] leading-snug line-clamp-3 mb-3" style={{ color: 'rgba(255,255,255,.75)' }}>{form.descripcion}</p>
            )}
            <div className="flex items-center justify-between pt-3" style={{ borderTop: '1px solid rgba(255,255,255,.12)' }}>
              <p className="text-[12.5px] font-bold text-white">
                {form.tarifaRango ? TARIFA_RANGO_LABEL[form.tarifaRango] : 'Tarifa a consultar'}
              </p>
              <p className="text-[11.5px] flex items-center gap-1" style={{ color: 'rgba(255,255,255,.6)' }}>
                <Star size={11} style={{ color: NW_ESTRELLA }} fill={NW_ESTRELLA} />
                {DISPONIBILIDAD_ESTADO_LABEL[form.disponibilidadEstado]}
              </p>
            </div>
          </div>

          {(badges.emailVerificado || badges.experienciaVerificada || badges.referenciaProfesional || badges.identidadVerificada || badges.activaRecientemente) && (
            <div className="rounded-2xl p-5" style={{ background: '#fff', border: `1px solid ${NW_BORDE}` }}>
              <p className="text-[11px] font-bold uppercase tracking-wide mb-2.5" style={{ color: NW_MUTED_2 }}>Confianza</p>
              <ListaBadgesNetwork badges={badges} />
            </div>
          )}

          {perfil.slug && perfil.estado === 'published' && (
            <a
              href={`/network/instructoras/${perfil.slug}`} target="_blank" rel="noreferrer"
              className="block text-center px-4 py-2.5 rounded-full text-[13px] font-bold transition-opacity hover:opacity-80"
              style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
            >
              Ver mi perfil público →
            </a>
          )}
        </div>
      </div>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
