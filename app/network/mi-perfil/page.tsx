'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Toast, useToast } from '@/components/ui/toast';
import { ProfileAvatar } from '@/components/ui/profile-avatar';
import { SelectorChips } from '@/components/network/selector-chips';
import { BarraCompletitud } from '@/components/network/barra-completitud';
import { TarjetaEstadoPublicacion } from '@/components/network/tarjeta-estado';
import { SeccionExperienciaNetwork } from '@/components/network/seccion-experiencia';
import { ListaBadgesNetwork } from '@/components/network/lista-badges';
import { useAuth } from '@/lib/auth-context';
import { fetchMiPerfilNetwork, guardarPerfilNetwork, cambiarEstadoPerfilNetwork } from '@/lib/api-client';
import { subirFotoPerfilNetwork, validarFotoPerfil } from '@/lib/portal-storage';
import { calcularCompletitudPerfil } from '@/lib/network/completitud';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from '@/lib/network/badges';
import type { PerfilNetwork, ExperienciaNetwork } from '@/lib/network/tipos';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  HORARIOS_NETWORK, HORARIO_LABEL,
  TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import { inputCls, labelCls, cardCls } from '@/app/(dashboard)/configuracion/page';

// Formulario controlado: todo texto vive como `string` (nunca `null`), a
// diferencia de `CambiosPerfilNetwork`/`PerfilNetwork` — se traduce a
// `null`/número al guardar (ver `guardar()` más abajo).
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

export default function MiPerfilNetworkPage() {
  const { message: toastMsg, show: showToast, dismiss: dismissToast } = useToast();
  const router = useRouter();
  const { user, loading: cargandoSesion } = useAuth();
  const nombreDefecto = (user?.user_metadata?.nombre as string | undefined) ?? '';

  // Página fuera de app/(dashboard) a propósito (ver app/network/layout.tsx)
  // — sin DashboardShell no hay ningún guard de sesión heredado, así que
  // cada página aquí pone el suyo.
  useEffect(() => {
    if (!cargandoSesion && !user) router.replace('/network/unirse');
  }, [cargandoSesion, user, router]);

  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [form, setForm] = useState<FormState>(formVacio(nombreDefecto));
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState('');
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [experiencias, setExperiencias] = useState<ExperienciaNetwork[]>([]);
  const tieneExperiencia = experiencias.length > 0;

  useEffect(() => {
    let vivo = true;
    fetchMiPerfilNetwork().then(p => {
      if (!vivo) return;
      if (p) { setPerfil(p); setForm(formDesdePerfil(p)); }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, []);

  const { porcentaje } = calcularCompletitudPerfil(
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

  async function guardar() {
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
    if (!res.ok) { setError(res.error); return; }
    setPerfil(res.perfil);
    setForm(formDesdePerfil(res.perfil));
    setGuardado(true);
    showToast('Perfil guardado');
    setTimeout(() => setGuardado(false), 2000);
  }

  async function cambiarEstado(estado: 'published' | 'hidden') {
    setErrorEstado('');
    setCambiandoEstado(true);
    const res = await cambiarEstadoPerfilNetwork(estado);
    setCambiandoEstado(false);
    if (!res.ok) { setErrorEstado(res.error); return; }
    setPerfil(res.perfil);
    showToast(estado === 'published' ? 'Perfil publicado' : 'Perfil oculto');
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

  if (cargandoSesion || !user || cargando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Mi perfil en Network"
        description="Cómo te ven los estudios que buscan profesionales de Pilates en Tentare Network."
      />

      {perfil && (
        <div className={`${cardCls} p-6`}>
          <TarjetaEstadoPublicacion
            perfil={perfil}
            cambiando={cambiandoEstado}
            error={errorEstado}
            onPublicar={() => cambiarEstado('published')}
            onOcultar={() => cambiarEstado('hidden')}
          />
        </div>
      )}

      <div className={`${cardCls} p-6`}>
        <BarraCompletitud porcentaje={porcentaje} />
      </div>

      {perfil && (
        <div className={`${cardCls} p-6`}>
          <h3 className="text-[14px] font-semibold text-foreground mb-2">Así te ven los estudios</h3>
          <ListaBadgesNetwork
            badges={{
              emailVerificado: emailVerificado(user?.email_confirmed_at ?? null),
              experienciaVerificada: experienciaVerificada(experiencias.map(e => e.estadoVerificacion)),
              // La solicitud/confirmación de una referencia profesional es un
              // flujo que todavía no se ha construido (fuera de esta fase) —
              // 0 a propósito, no un descuido.
              referenciaProfesional: referenciaProfesional(0),
              identidadVerificada: identidadVerificada(perfil.identidadVerificadaEn),
              activaRecientemente: activaRecientemente(perfil.ultimoAccesoEn, new Date()),
            }}
          />
          {!emailVerificado(user?.email_confirmed_at ?? null) && (
            <p className="text-[11px] text-muted-foreground mt-2">
              Confirma tu email desde el enlace que te enviamos al crear tu cuenta para conseguir este badge.
            </p>
          )}
        </div>
      )}

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
              <Camera size={13} className="text-foreground" />
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

      <div className={`${cardCls} p-6 space-y-3`}>
        <h3 className="text-[14px] font-semibold text-foreground">Especialidades</h3>
        <SelectorChips
          opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
          seleccion={form.especialidades ?? []}
          onChange={sel => setForm(f => ({ ...f, especialidades: sel }))}
        />
      </div>

      {perfil && <SeccionExperienciaNetwork onExperienciasChange={setExperiencias} />}

      <div className={`${cardCls} p-6 space-y-4`}>
        <h3 className="text-[14px] font-semibold text-foreground">Años de experiencia y tarifa</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={labelCls}>Años de experiencia</p>
            <input
              type="number" min={0} className={inputCls}
              value={form.aniosExperiencia} onChange={e => setForm(f => ({ ...f, aniosExperiencia: e.target.value }))}
            />
          </div>
          <div>
            <p className={labelCls}>Tarifa orientativa</p>
            <select
              className={inputCls}
              value={form.tarifaRango ?? ''}
              onChange={e => setForm(f => ({ ...f, tarifaRango: (e.target.value || undefined) as FormState['tarifaRango'] }))}
            >
              <option value="">Sin especificar</option>
              {TARIFAS_RANGO_NETWORK.map(v => <option key={v} value={v}>{TARIFA_RANGO_LABEL[v]}</option>)}
            </select>
          </div>
        </div>
      </div>

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

      <div className={`${cardCls} p-6 space-y-3`}>
        <h3 className="text-[14px] font-semibold text-foreground">Tipo de trabajo</h3>
        <SelectorChips
          opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
          seleccion={form.tipoTrabajo ?? []}
          onChange={sel => setForm(f => ({ ...f, tipoTrabajo: sel }))}
        />
      </div>

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

      {error && <p className="text-[12px] text-destructive">{error}</p>}

      <button
        onClick={guardar}
        disabled={guardando || !form.nombre?.trim()}
        className="px-4 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium hover:brightness-95 transition-colors flex items-center gap-1.5 disabled:opacity-60"
      >
        {guardado && <Check size={13} />}
        {guardando ? 'Guardando…' : guardado ? 'Guardado' : 'Guardar perfil'}
      </button>

      {toastMsg && <Toast message={toastMsg} onDismiss={dismissToast} />}
    </div>
  );
}
