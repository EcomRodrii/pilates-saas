'use client';

// Onboarding de Tentare Network — wizard de 12 pasos (2a-2d del rediseño),
// con verificación de identidad y certificaciones por documento. Sustituye
// al alta de /network/unirse (que se queda viva sin enlazar) como sitio
// real donde una instructora crea su cuenta Y su perfil — antes eran dos
// pasos separados (signup en unirse, formulario en mi-perfil); aquí el
// paso 01 ES el signup.
//
// /network/mi-perfil deja de ser el sitio del alta inicial (rediseño
// 2026-08): se re-propone como panel de edición post-publicación, y
// redirige aquí si todavía no hay perfil creado.
//
// Reutiliza sin reescribir: signUp (paso 01, mismo flujo que ya usaba
// SeccionRegistro.tsx), PUT /api/network/perfil (pasos 03/04/05/07/08/09/10,
// mismos campos que ya editaba el wizard de 8 pasos), PATCH .../estado
// (paso 12, publicar), SeccionExperienciaNetwork (paso 04) y
// subirFotoPerfilNetwork (paso 10). Solo los pasos 02 (identidad) y 06
// (formación) son de verdad nuevos — necesitan el modelo de documentos que
// no existía antes de esta fase.
import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Check, Loader2, Camera, Upload, X, Clock3, ShieldCheck, Lock, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { OtpVerificacion } from '@/components/auth/otp-verificacion';
import { recordarEmailOtpPendiente, leerEmailOtpPendiente, olvidarEmailOtpPendiente } from '@/lib/auth/otp-pendiente';
import { GoogleIcon } from '@/components/auth/google-icon';
import { SelectorChips } from '@/components/network/selector-chips';
import { SeccionExperienciaNetwork } from '@/components/network/seccion-experiencia';
import {
  fetchMiPerfilNetwork, guardarPerfilNetwork, cambiarEstadoPerfilNetwork,
  fetchPerfilIdentidadNetwork, guardarPerfilIdentidadNetwork,
  fetchVerificacionIdentidadNetwork, enviarVerificacionIdentidadNetwork,
  fetchCertificacionesNetwork, crearCertificacionNetwork, eliminarCertificacionNetwork,
} from '@/lib/api-client';
import { subirFotoPerfilNetwork, validarFotoPerfil } from '@/lib/portal-storage';
import { subirDocumentoIdentidad, validarDocumentoIdentidad } from '@/lib/network/documentos-identidad';
import {
  ESPECIALIDADES_NETWORK, ESPECIALIDAD_LABEL,
  HORARIOS_NETWORK, HORARIO_LABEL,
  TIPOS_TRABAJO_NETWORK, TIPO_TRABAJO_LABEL,
  TARIFAS_RANGO_NETWORK, TARIFA_RANGO_LABEL,
  DISPONIBILIDAD_ESTADOS_NETWORK, DISPONIBILIDAD_ESTADO_LABEL,
} from '@/lib/network/catalogo';
import type { PerfilNetwork, PerfilIdentidadNetwork, VerificacionIdentidadNetwork, CertificacionNetwork } from '@/lib/network/tipos';
import { PASOS_ONBOARDING as PASOS, pasoIncompletoDe } from '@/lib/network/pasos-onboarding';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAGE, NW_PRODUCTO, NW_ESTADO } from '@/components/network-v2/tokens';

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl text-[14px] outline-none';
const inputStyle = { border: `1px solid ${NW_BORDE}`, color: NW_TINTA };
const labelCls = 'block text-[13px] font-semibold mb-1.5';

interface FormState {
  ciudad: string; zona: string; radioKm: string;
  especialidades: PerfilNetwork['especialidades'];
  aniosExperiencia: string;
  tarifaRango: PerfilNetwork['tarifaRango'] | undefined;
  disponibilidadEstado: PerfilNetwork['disponibilidadEstado'];
  disponibilidadHorarios: PerfilNetwork['disponibilidadHorarios'];
  tipoTrabajo: PerfilNetwork['tipoTrabajo'];
  descripcion: string;
  idiomasTexto: string;
  instagram: string; linkedin: string; web: string;
}

function formVacio(): FormState {
  return {
    ciudad: '', zona: '', radioKm: '', especialidades: [], aniosExperiencia: '',
    tarifaRango: undefined, disponibilidadEstado: 'no_disponible', disponibilidadHorarios: [], tipoTrabajo: [],
    descripcion: '', idiomasTexto: '', instagram: '', linkedin: '', web: '',
  };
}

function formDesdePerfil(p: PerfilNetwork): FormState {
  return {
    ciudad: p.ciudad ?? '', zona: p.zona ?? '', radioKm: p.radioKm != null ? String(p.radioKm) : '',
    especialidades: p.especialidades, aniosExperiencia: p.aniosExperiencia != null ? String(p.aniosExperiencia) : '',
    tarifaRango: p.tarifaRango ?? undefined, disponibilidadEstado: p.disponibilidadEstado,
    disponibilidadHorarios: p.disponibilidadHorarios, tipoTrabajo: p.tipoTrabajo,
    descripcion: p.descripcion ?? '', idiomasTexto: p.idiomas.join(', '),
    instagram: p.instagram ?? '', linkedin: p.linkedin ?? '', web: p.web ?? '',
  };
}

interface IdentidadForm {
  apellido1: string; apellido2: string; fechaNacimiento: string; paisResidencia: string;
  tipoDocumento: 'DNI' | 'NIE' | 'Pasaporte' | ''; numeroDocumento: string;
  direccionCp: string; direccionCiudad: string; direccionProvincia: string; direccionPais: string;
}

function identidadVacia(): IdentidadForm {
  return {
    apellido1: '', apellido2: '', fechaNacimiento: '', paisResidencia: '',
    tipoDocumento: '', numeroDocumento: '', direccionCp: '', direccionCiudad: '', direccionProvincia: '', direccionPais: '',
  };
}

function identidadDesdeApi(i: PerfilIdentidadNetwork): IdentidadForm {
  return {
    apellido1: i.apellido1 ?? '', apellido2: i.apellido2 ?? '', fechaNacimiento: i.fechaNacimiento ?? '',
    paisResidencia: i.paisResidencia ?? '', tipoDocumento: i.tipoDocumento ?? '', numeroDocumento: i.numeroDocumento ?? '',
    direccionCp: i.direccionCp ?? '', direccionCiudad: i.direccionCiudad ?? '', direccionProvincia: i.direccionProvincia ?? '',
    direccionPais: i.direccionPais ?? '',
  };
}

export default function CrearPerfilNetworkPage() {
  const uid = useId();
  const { user, loading: cargandoSesion, signUp, signInWithGoogle, verificarOtpSignup, reenviarConfirmacion } = useAuth();

  // ── Paso 01: cuenta (sin sesión todavía) ──────────────────────────────
  const [nombreCuenta, setNombreCuenta] = useState('');
  const [emailCuenta, setEmailCuenta] = useState('');
  const [passwordCuenta, setPasswordCuenta] = useState('');
  const [errorCuenta, setErrorCuenta] = useState('');
  const [infoCuenta, setInfoCuenta] = useState('');
  // Distingue el caso "ya existe cuenta" para poder pintar /network/acceso
  // como un <Link> real en vez de la ruta escrita a mano en texto plano —
  // hallazgo de la auditoría UX: la misma pantalla ya tiene un Link
  // idéntico dos líneas más abajo, esto solo evita duplicarlo como texto.
  const [cuentaExistente, setCuentaExistente] = useState(false);
  const [creandoCuenta, setCreandoCuenta] = useState(false);
  const [conectandoGoogle, setConectandoGoogle] = useState(false);
  const { widget: captcha, pedirToken } = useCaptcha();
  // Alta recién creada, esperando el código de 6 dígitos — mismo patrón que
  // app/login/page.tsx (única fuente de este componente, OtpVerificacion).
  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  useEffect(() => {
    const pendiente = leerEmailOtpPendiente();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pendiente) setEmailOtp(pendiente);
  }, []);

  // Igual que en /network/acceso: vuelve siempre a /login (redirectPath por
  // defecto de signInWithGoogle), así que el error de vuelta de Google se ve
  // ahí — aquí solo se captura el rechazo síncrono previo al redirect.
  async function conectarConGoogle() {
    setErrorCuenta('');
    setConectandoGoogle(true);
    const { error } = await signInWithGoogle();
    if (error) { setErrorCuenta(error); setConectandoGoogle(false); }
  }

  const [paso, setPaso] = useState(0);
  const [pasoInicialElegido, setPasoInicialElegido] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [perfil, setPerfil] = useState<PerfilNetwork | null>(null);
  const [form, setForm] = useState<FormState>(formVacio());
  const [identidad, setIdentidad] = useState<IdentidadForm>(identidadVacia());
  const [verificacion, setVerificacion] = useState<VerificacionIdentidadNetwork | null>(null);
  const [certificaciones, setCertificaciones] = useState<CertificacionNetwork[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const fileInputFoto = useRef<HTMLInputElement>(null);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const fileInputDoc = useRef<HTMLInputElement>(null);
  const [subiendoDoc, setSubiendoDoc] = useState(false);
  const [errorDoc, setErrorDoc] = useState('');
  const [publicando, setPublicando] = useState(false);

  // Carga inicial: si ya hay perfil (volviendo a medio hacer), rellena todo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!user) { setCargando(false); return; }
    let vivo = true;
    Promise.all([
      fetchMiPerfilNetwork(), fetchPerfilIdentidadNetwork(), fetchVerificacionIdentidadNetwork(), fetchCertificacionesNetwork(),
    ]).then(([p, ident, veri, certs]) => {
      if (!vivo) return;
      if (p) { setPerfil(p); setForm(formDesdePerfil(p)); }
      if (ident) setIdentidad(identidadDesdeApi(ident));
      setVerificacion(veri);
      setCertificaciones(certs);
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [user]);

  // Reanudación (2f simplificada, dentro del propio wizard): aterriza en el
  // primer paso incompleto, publicado → última. Se decide UNA vez.
  //
  // pasoIncompletoDe(null) devuelve 0 ("Tu cuenta") porque para el flujo de
  // email/password ese valor nunca se usa tal cual — crearCuenta() salta a
  // mano a setPaso(1) justo después de crear la cuenta. Pero quien llega
  // aquí YA CON SESIÓN sin haber pasado por crearCuenta() (alta con Google,
  // que vuelve de /login con user ya puesto) sí podía quedarse en paso 0 —
  // y el cuerpo autenticado del wizard no tiene ningún bloque para
  // paso === 0 (todos empiezan en 1), así que se veía "Paso 1 de 12" en
  // blanco. Con sesión activa el paso "Tu cuenta" ya está hecho por
  // definición, así que el mínimo real aquí es 1.
  useEffect(() => {
    if (cargando || pasoInicialElegido || !user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaso(Math.max(1, pasoIncompletoDe(perfil)));
    setPasoInicialElegido(true);
  }, [cargando, pasoInicialElegido, user, perfil]);

  async function crearCuenta(e: React.FormEvent) {
    e.preventDefault();
    setErrorCuenta(''); setInfoCuenta(''); setCuentaExistente(false); setCreandoCuenta(true);
    const token = await pedirToken();
    if (token === null) { setCreandoCuenta(false); setErrorCuenta(ERROR_CAPTCHA); return; }
    const { error, needsConfirmation, yaRegistrado } = await signUp(
      emailCuenta, passwordCuenta, { nombre: nombreCuenta.trim() }, token || undefined, '/network/crear-perfil',
    );
    if (error) { setErrorCuenta(error); setCreandoCuenta(false); return; }
    if (yaRegistrado) {
      setInfoCuenta('Ya existe una cuenta con ese email. Tu progreso te espera ahí.');
      setCuentaExistente(true);
      setCreandoCuenta(false);
      return;
    }
    if (needsConfirmation) {
      recordarEmailOtpPendiente(emailCuenta.trim());
      setEmailOtp(emailCuenta.trim());
      setCreandoCuenta(false);
      return;
    }
    setCreandoCuenta(false);
    setPaso(1);
  }

  async function guardar(cambios: Partial<FormState> = {}): Promise<boolean> {
    setError(''); setGuardando(true);
    const f = { ...form, ...cambios };
    const res = await guardarPerfilNetwork({
      ...(perfil ? {} : { nombre: nombreCuenta.trim() || user?.user_metadata?.nombre || 'Instructora' }),
      ciudad: f.ciudad || null, zona: f.zona || null, radioKm: f.radioKm ? Number(f.radioKm) : null,
      especialidades: f.especialidades, aniosExperiencia: f.aniosExperiencia ? Number(f.aniosExperiencia) : null,
      tarifaRango: f.tarifaRango ?? null, disponibilidadEstado: f.disponibilidadEstado,
      disponibilidadHorarios: f.disponibilidadHorarios, tipoTrabajo: f.tipoTrabajo,
      descripcion: f.descripcion || null,
      idiomas: f.idiomasTexto.split(',').map(v => v.trim()).filter(Boolean),
      instagram: f.instagram || null, linkedin: f.linkedin || null, web: f.web || null,
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return false; }
    setPerfil(res.perfil);
    return true;
  }

  async function guardarIdentidad(): Promise<boolean> {
    setError(''); setGuardando(true);
    const res = await guardarPerfilIdentidadNetwork({
      apellido1: identidad.apellido1 || null, apellido2: identidad.apellido2 || null,
      fechaNacimiento: identidad.fechaNacimiento || null, paisResidencia: identidad.paisResidencia || null,
      tipoDocumento: identidad.tipoDocumento || null, numeroDocumento: identidad.numeroDocumento || null,
      direccionCp: identidad.direccionCp || null, direccionCiudad: identidad.direccionCiudad || null,
      direccionProvincia: identidad.direccionProvincia || null, direccionPais: identidad.direccionPais || null,
    });
    setGuardando(false);
    if (!res.ok) { setError(res.error); return false; }
    return true;
  }

  async function siguiente() {
    if (paso === 1) { const ok = await guardarIdentidad(); if (!ok) return; }
    else if (paso !== 5 && paso !== 10 && paso !== 11) { const ok = await guardar(); if (!ok) return; }
    setPaso(p => Math.min(p + 1, PASOS.length - 1));
  }

  async function subirFoto(file: File) {
    if (!perfil) return;
    const invalido = validarFotoPerfil(file);
    if (invalido) { setError(invalido); return; }
    setSubiendoFoto(true);
    const res = await subirFotoPerfilNetwork(perfil.id, file);
    setSubiendoFoto(false);
    if ('error' in res) { setError(res.error); return; }
    const guardado = await guardarPerfilNetwork({ fotoUrl: res.url });
    if (guardado.ok) setPerfil(guardado.perfil);
  }

  async function subirDocIdentidad(file: File) {
    if (!user) return;
    const invalido = validarDocumentoIdentidad(file);
    if (invalido) { setErrorDoc(invalido); return; }
    setErrorDoc(''); setSubiendoDoc(true);
    const subida = await subirDocumentoIdentidad(user.id, 'identidad', file);
    if ('error' in subida) { setErrorDoc(subida.error); setSubiendoDoc(false); return; }
    const res = await enviarVerificacionIdentidadNetwork(subida.path);
    setSubiendoDoc(false);
    if (!res.ok) { setErrorDoc(res.error); return; }
    setVerificacion(res.verificacion);
  }

  if (cargandoSesion || cargando) return null;

  // ── Paso 01 sin sesión, alta creada: verificar código ─────────────────
  if (emailOtp && !user) {
    return (
      <ShellCentrado>
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>
        <OtpVerificacion
          email={emailOtp}
          onVerificar={codigo => verificarOtpSignup(emailOtp, codigo)}
          onReenviar={async () => {
            const token = await pedirToken();
            if (token === null) return { error: ERROR_CAPTCHA };
            return reenviarConfirmacion(emailOtp, token || undefined);
          }}
          onCambiarEmail={() => { olvidarEmailOtpPendiente(); setEmailOtp(null); setErrorCuenta(''); setInfoCuenta(''); }}
          onVerificado={() => olvidarEmailOtpPendiente()}
        />
      </ShellCentrado>
    );
  }

  // ── Paso 01 sin sesión: pantalla de alta ──────────────────────────────
  if (!user) {
    return (
      <ShellCentrado>
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={24} decorativo /></Link>
        {/* Antes solo había texto "Paso 1 de 12" — el resto del wizard (pasos
            2-12) sí tiene barra+lista completa en su rail; el primer contacto
            de la usuaria con el producto era, de todo el flujo, el que MENOS
            orientación daba (hallazgo de la auditoría UX). */}
        <div className="mb-1.5 h-1.5 rounded-full overflow-hidden" style={{ background: NW_BORDE }}>
          <div className="h-full rounded-full" style={{ width: `${Math.round((1 / PASOS.length) * 100)}%`, background: NW_PRODUCTO }} />
        </div>
        <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: NW_PRODUCTO }}>Paso 1 de 12</p>
        <h1 className="text-[30px] font-extrabold" style={{ color: NW_TINTA }}>
          Tu <span style={{ color: NW_PRODUCTO }}>cuenta</span>
        </h1>
        <p className="mt-2 text-[14px] mb-6" style={{ color: NW_MUTED }}>Crea tu cuenta gratis. Es el primer paso para publicar tu perfil.</p>

        <button
          type="button"
          disabled={conectandoGoogle}
          onClick={() => void conectarConGoogle()}
          className="w-full max-w-sm flex items-center justify-center gap-2.5 py-2.5 rounded-xl text-[13.5px] font-semibold hover:bg-black/[.02] transition-colors disabled:opacity-60 mb-4"
          style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}
        >
          <GoogleIcon />
          {conectandoGoogle ? 'Conectando…' : 'Continuar con Google'}
        </button>
        <div className="flex items-center gap-3 mb-4 max-w-sm">
          <div className="h-px flex-1" style={{ background: NW_BORDE }} />
          <span className="text-[11px] font-medium" style={{ color: NW_MUTED_2 }}>o</span>
          <div className="h-px flex-1" style={{ background: NW_BORDE }} />
        </div>

        <form onSubmit={crearCuenta} className="space-y-4 max-w-sm">
          <div>
            <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-n`}>Tu nombre</label>
            <input id={`${uid}-n`} required value={nombreCuenta} onChange={e => setNombreCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="Ana García" />
          </div>
          <div>
            <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-e`}>Email</label>
            <input id={`${uid}-e`} type="email" required value={emailCuenta} onChange={e => setEmailCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="tu@email.com" />
          </div>
          <div>
            <label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-p`}>Contraseña</label>
            <input id={`${uid}-p`} type="password" required minLength={6} value={passwordCuenta} onChange={e => setPasswordCuenta(e.target.value)} className={inputCls} style={inputStyle} placeholder="••••••••" />
          </div>
          {errorCuenta && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2">{errorCuenta}</p>}
          {infoCuenta && (
            <p className="text-[13px] rounded-lg px-3 py-2" style={{ background: NW_SAGE, color: NW_TINTA }}>
              {infoCuenta}{cuentaExistente && (
                <> <Link href="/network/acceso" className="font-semibold underline" style={{ color: NW_TINTA }}>Inicia sesión</Link>.</>
              )}
            </p>
          )}
          {captcha}
          <button type="submit" disabled={creandoCuenta} className="w-full py-3 rounded-full text-[14px] font-bold text-white disabled:opacity-60" style={{ background: NW_PRODUCTO }}>
            {creandoCuenta ? 'Un momento…' : 'Continuar'}
          </button>
        </form>
        <p className="text-center text-[12px] mt-5" style={{ color: NW_MUTED_2 }}>
          ¿Ya tienes cuenta? <Link href="/network/acceso" className="font-semibold underline" style={{ color: NW_TINTA }}>Inicia sesión</Link>
        </p>
      </ShellCentrado>
    );
  }

  // ⚠️ Antes esto era `i < paso` — "he pasado por aquí", no "este paso
  // tiene datos reales". Como ningún campo entre el 2 y el 9 era
  // obligatorio para avanzar, se podía pulsar Continuar sin tocar nada y
  // el rail pintaba ✓ igual. Ahora cada paso comprueba SU dato real —
  // mismo criterio que ya arregló pasoIncompletoDe en lib/network/
  // pasos-onboarding.ts para la reanudación. Formación (índice 5) es la
  // única excepción a propósito: es opcional ("Lo haré más tarde"), así
  // que no se le exige dato para no contradecir esa salida. Revisar/
  // Publicar (10-11) son pantallas de navegación, no de datos — se quedan
  // con el criterio anterior.
  function pasoEstaHecho(i: number): boolean {
    switch (i) {
      case 0: return true; // "Tu cuenta": ya creada si se llegó hasta aquí
      case 1: return verificacion != null;
      case 2: return form.ciudad.trim() !== '';
      case 3: return form.aniosExperiencia.trim() !== '';
      case 4: return form.especialidades.length > 0;
      case 5: return certificaciones.length > 0;
      case 6: return form.tipoTrabajo.length > 0;
      case 7: return form.disponibilidadHorarios.length > 0;
      case 8: return Boolean(form.tarifaRango);
      case 9: return form.idiomasTexto.trim() !== '' || form.descripcion.trim() !== '';
      default: return i < paso;
    }
  }

  const pasoActual = PASOS[paso];

  return (
    <div className="min-h-dvh flex flex-col lg:flex-row" style={{ background: '#FAF9F5' }}>
      {/* Rail izquierdo */}
      <aside className="lg:w-[300px] shrink-0 p-8 lg:min-h-dvh" style={{ background: NW_SAGE }}>
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={22} decorativo /></Link>
        <h2 className="text-[19px] font-extrabold" style={{ color: NW_TINTA }}>Crea tu perfil</h2>
        <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.6)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((paso / (PASOS.length - 1)) * 100)}%`, background: NW_PRODUCTO }} />
        </div>
        <p className="mt-2 text-[12px] font-semibold" style={{ color: NW_MUTED }}>
          {Math.round((paso / (PASOS.length - 1)) * 100)}% · te faltan {PASOS.length - 1 - paso} pasos
        </p>
        <ol className="mt-6 space-y-0.5">
          {PASOS.map((p, i) => {
            const hecho = pasoEstaHecho(i);
            const actual = i === paso;
            return (
              <li key={p.n}>
                <button
                  type="button" disabled={i > paso} onClick={() => setPaso(i)}
                  className="w-full flex items-center gap-2.5 py-2 text-left disabled:cursor-not-allowed"
                >
                  <span
                    className="shrink-0 flex items-center justify-center rounded-full text-[11px] font-bold"
                    style={{
                      width: 22, height: 22,
                      background: hecho ? NW_PRODUCTO : actual ? '#fff' : 'transparent',
                      border: actual ? `2px solid ${NW_PRODUCTO}` : hecho ? 'none' : `1.5px solid ${NW_MUTED_2}`,
                      color: hecho ? '#fff' : NW_TINTA,
                    }}
                  >
                    {hecho ? <Check size={12} /> : p.n}
                  </span>
                  <span className="text-[13px] font-semibold" style={{ color: actual ? NW_TINTA : NW_MUTED }}>{p.titulo}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Contenido */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between px-8 py-4" style={{ borderBottom: `1px solid ${NW_BORDE}` }}>
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: NW_MUTED }}>
            <Check size={13} style={{ color: NW_PRODUCTO }} /> Guardado automáticamente
          </span>
          <Link href="/network/mi-perfil" className="text-[12.5px] font-semibold" style={{ color: NW_MUTED }}>Guardar y salir</Link>
        </div>

        <main className="flex-1 max-w-[700px] w-full mx-auto px-8 py-10">
          <p className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: NW_PRODUCTO }}>Paso {String(pasoActual.n).padStart(2, '0')} de 12</p>
          <h1 className="text-[30px] sm:text-[34px] font-extrabold mb-6" style={{ color: NW_TINTA }}>
            {pasoActual.titulo.split(' ').map((palabra, i, arr) => i === arr.length - 1
              ? <span key={i} style={{ color: NW_PRODUCTO }}>{palabra}</span>
              : `${palabra} `)}
          </h1>

          {error && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">{error}</p>}

          {paso === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-2.5 p-4 rounded-xl" style={{ background: NW_SAGE }}>
                <Lock size={16} className="mt-0.5 shrink-0" style={{ color: NW_TINTA }} />
                <p className="text-[13px]" style={{ color: NW_TINTA }}>
                  <strong>Esta información es privada.</strong> La usamos únicamente para verificar tu identidad. No aparecerá en tu perfil público.
                </p>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-apellido1`}>Primer apellido</label>
                  <input id={`${uid}-apellido1`} value={identidad.apellido1} onChange={e => setIdentidad(v => ({ ...v, apellido1: e.target.value }))} className={inputCls} style={inputStyle} /></div>
                <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-apellido2`}>Segundo apellido (opcional)</label>
                  <input id={`${uid}-apellido2`} value={identidad.apellido2} onChange={e => setIdentidad(v => ({ ...v, apellido2: e.target.value }))} className={inputCls} style={inputStyle} /></div>
                <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-nacimiento`}>Fecha de nacimiento</label>
                  <input id={`${uid}-nacimiento`} type="date" value={identidad.fechaNacimiento} onChange={e => setIdentidad(v => ({ ...v, fechaNacimiento: e.target.value }))} className={inputCls} style={inputStyle} /></div>
                <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-pais`}>País de residencia</label>
                  <input id={`${uid}-pais`} value={identidad.paisResidencia} onChange={e => setIdentidad(v => ({ ...v, paisResidencia: e.target.value }))} className={inputCls} style={inputStyle} placeholder="España" /></div>
              </div>
              <div>
                <label className={labelCls} style={{ color: NW_TINTA }}>Documento</label>
                <div className="flex gap-2 mb-2">
                  {(['DNI', 'NIE', 'Pasaporte'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setIdentidad(v => ({ ...v, tipoDocumento: t }))}
                      className="px-4 py-2 rounded-full text-[13px] font-semibold"
                      style={{ background: identidad.tipoDocumento === t ? NW_TINTA : '#fff', color: identidad.tipoDocumento === t ? '#fff' : NW_TINTA, border: `1px solid ${NW_BORDE}` }}>
                      {t}
                    </button>
                  ))}
                </div>
                <input value={identidad.numeroDocumento} onChange={e => setIdentidad(v => ({ ...v, numeroDocumento: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Número de documento" />
              </div>
              <DropzoneDocumento
                etiqueta="Subir documento · PDF o foto · las dos caras"
                subiendo={subiendoDoc} error={errorDoc} inputRef={fileInputDoc}
                onArchivo={subirDocIdentidad}
              />
              {verificacion && <EstadoDocumento estado={verificacion.estado} motivo={verificacion.motivoRechazo} />}
              <div>
                <p className={labelCls} style={{ color: NW_TINTA }} id={`${uid}-direccion`}>Dirección — privada, nunca se muestra</p>
                <div className="grid sm:grid-cols-3 gap-3" role="group" aria-labelledby={`${uid}-direccion`}>
                  <input aria-label="Código postal" value={identidad.direccionCp} onChange={e => setIdentidad(v => ({ ...v, direccionCp: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Código postal" />
                  <input aria-label="Ciudad" value={identidad.direccionCiudad} onChange={e => setIdentidad(v => ({ ...v, direccionCiudad: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Ciudad" />
                  <input aria-label="Provincia" value={identidad.direccionProvincia} onChange={e => setIdentidad(v => ({ ...v, direccionProvincia: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Provincia" />
                </div>
              </div>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-4">
              <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-ciudad`}>Ciudad</label>
                <input id={`${uid}-ciudad`} value={form.ciudad} onChange={e => setForm(v => ({ ...v, ciudad: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Barcelona" /></div>
              <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-zona`}>Zona / barrio (opcional)</label>
                <input id={`${uid}-zona`} value={form.zona} onChange={e => setForm(v => ({ ...v, zona: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Gràcia" /></div>
              <div>
                <label className={labelCls} style={{ color: NW_TINTA }}>Radio de desplazamiento</label>
                <div className="flex gap-2">
                  {['5', '10', '25', '50'].map(km => (
                    <button key={km} type="button" onClick={() => setForm(v => ({ ...v, radioKm: km }))}
                      className="px-4 py-2 rounded-full text-[13px] font-semibold"
                      style={{ background: form.radioKm === km ? NW_TINTA : '#fff', color: form.radioKm === km ? '#fff' : NW_TINTA, border: `1px solid ${NW_BORDE}` }}>
                      {km} km
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-anios`}>Años de experiencia</label>
                <input id={`${uid}-anios`} type="number" min={0} value={form.aniosExperiencia} onChange={e => setForm(v => ({ ...v, aniosExperiencia: e.target.value }))} className={inputCls} style={inputStyle} /></div>
              <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-recorrido`}>Cuéntanos tu recorrido (opcional)</label>
                <textarea id={`${uid}-recorrido`} value={form.descripcion} onChange={e => setForm(v => ({ ...v, descripcion: e.target.value }))} rows={4} className={inputCls} style={inputStyle} /></div>
              <SeccionExperienciaNetwork onExperienciasChange={() => {}} tokensNetworkV2 />
            </div>
          )}

          {paso === 4 && (
            <SelectorChips
              opciones={ESPECIALIDADES_NETWORK.map(v => ({ valor: v, etiqueta: ESPECIALIDAD_LABEL[v] }))}
              seleccion={form.especialidades}
              onChange={sel => { setForm(v => ({ ...v, especialidades: sel })); guardar({ especialidades: sel }); }}
            />
          )}

          {paso === 5 && (
            <PasoFormacion certificaciones={certificaciones} setCertificaciones={setCertificaciones} userId={user.id} />
          )}

          {paso === 6 && (
            <div className="space-y-4">
              <p className={labelCls} style={{ color: NW_TINTA }}>Modalidad y tipo de oportunidades</p>
              <SelectorChips
                opciones={TIPOS_TRABAJO_NETWORK.map(v => ({ valor: v, etiqueta: TIPO_TRABAJO_LABEL[v] }))}
                seleccion={form.tipoTrabajo}
                onChange={sel => setForm(v => ({ ...v, tipoTrabajo: sel }))}
              />
            </div>
          )}

          {paso === 7 && (
            <div className="space-y-4">
              <div>
                <p className={labelCls} style={{ color: NW_TINTA }}>Estado</p>
                <SelectorChips
                  unico
                  opciones={DISPONIBILIDAD_ESTADOS_NETWORK.map(v => ({ valor: v, etiqueta: DISPONIBILIDAD_ESTADO_LABEL[v] }))}
                  seleccion={[form.disponibilidadEstado]}
                  onChange={sel => setForm(v => ({ ...v, disponibilidadEstado: sel[0] ?? v.disponibilidadEstado }))}
                />
              </div>
              <div>
                <p className={labelCls} style={{ color: NW_TINTA }}>Horarios</p>
                <SelectorChips
                  opciones={HORARIOS_NETWORK.map(v => ({ valor: v, etiqueta: HORARIO_LABEL[v] }))}
                  seleccion={form.disponibilidadHorarios}
                  onChange={sel => setForm(v => ({ ...v, disponibilidadHorarios: sel }))}
                />
              </div>
            </div>
          )}

          {paso === 8 && (
            <SelectorChips
              unico
              opciones={TARIFAS_RANGO_NETWORK.map(v => ({ valor: v, etiqueta: TARIFA_RANGO_LABEL[v] }))}
              seleccion={form.tarifaRango ? [form.tarifaRango] : []}
              onChange={sel => setForm(v => ({ ...v, tarifaRango: sel[0] }))}
            />
          )}

          {paso === 9 && (
            <div className="space-y-5">
              <div className="flex items-center gap-4">
                <div className="relative">
                  {perfil?.fotoUrl
                    // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora
                    ? <img src={perfil.fotoUrl} alt={perfil.nombre} width={80} height={80} className="w-20 h-20 rounded-full object-cover" />
                    : <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: NW_SAGE }}><Camera size={22} color={NW_MUTED} /></div>}
                </div>
                <div>
                  <input ref={fileInputFoto} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) subirFoto(f); }} />
                  <button type="button" disabled={subiendoFoto || !perfil} onClick={() => fileInputFoto.current?.click()} className="px-4 py-2 rounded-full text-[13px] font-semibold" style={{ border: `1px solid ${NW_BORDE}`, color: NW_TINTA }}>
                    {subiendoFoto ? 'Subiendo…' : 'Subir foto'}
                  </button>
                  <p className="text-[12px] mt-1.5" style={{ color: NW_MUTED_2 }}>Una foto real, de cara. Recomendado: cuadrada, buena luz.</p>
                </div>
              </div>
              <div><label className={labelCls} style={{ color: NW_TINTA }} htmlFor={`${uid}-idiomas`}>Idiomas (separados por coma)</label>
                <input id={`${uid}-idiomas`} value={form.idiomasTexto} onChange={e => setForm(v => ({ ...v, idiomasTexto: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Español (nativo), Inglés (avanzado)" /></div>
              <div className="grid sm:grid-cols-3 gap-3">
                <input aria-label="Instagram" value={form.instagram} onChange={e => setForm(v => ({ ...v, instagram: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Instagram (opcional)" />
                <input aria-label="LinkedIn" value={form.linkedin} onChange={e => setForm(v => ({ ...v, linkedin: e.target.value }))} className={inputCls} style={inputStyle} placeholder="LinkedIn (opcional)" />
                <input aria-label="Web" value={form.web} onChange={e => setForm(v => ({ ...v, web: e.target.value }))} className={inputCls} style={inputStyle} placeholder="Web (opcional)" />
              </div>
            </div>
          )}

          {paso === 10 && perfil && (
            <PasoRevisar perfil={perfil} form={form} verificacion={verificacion} onEditar={setPaso} />
          )}

          {paso === 11 && perfil && (perfil.estado === 'en_revision' || perfil.estado === 'published') ? (
            <div className="text-center py-8">
              <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>
                {perfil.estado === 'published' ? 'Tu perfil ya está publicado.' : 'Tu perfil está en revisión.'}
              </p>
              {perfil.estado === 'en_revision' && (
                <p className="mt-2 text-[14px] max-w-sm mx-auto" style={{ color: NW_MUTED }}>
                  El equipo de Tentare lo revisa antes de que aparezca en la network — normalmente en menos de 48 h.
                </p>
              )}
              <Link
                href="/network/mi-perfil"
                className="inline-block mt-6 px-8 py-3.5 rounded-full text-[15px] font-bold text-white"
                style={{ background: NW_PRODUCTO }}
              >
                Ir a mi perfil
              </Link>
            </div>
          ) : paso === 11 && perfil && (
            <div className="text-center py-8">
              <p className="text-[20px] font-extrabold" style={{ color: NW_TINTA }}>Tu perfil está listo.</p>
              <p className="mt-2 text-[14px] max-w-sm mx-auto" style={{ color: NW_MUTED }}>
                Lo revisa el equipo de Tentare antes de publicarlo — así evitamos perfiles falsos o spam en la network.
              </p>
              <button
                type="button" disabled={publicando}
                onClick={async () => {
                  setPublicando(true);
                  const res = await cambiarEstadoPerfilNetwork('en_revision');
                  setPublicando(false);
                  if (!res.ok) { setError(res.error); return; }
                  setPerfil(res.perfil);
                }}
                className="mt-6 px-8 py-3.5 rounded-full text-[15px] font-bold text-white disabled:opacity-60"
                style={{ background: NW_PRODUCTO }}
              >
                {publicando ? 'Enviando…' : 'Enviar a revisión'}
              </button>
            </div>
          )}

          {paso !== 11 && (
            <div className="flex items-center justify-between mt-10 pt-6" style={{ borderTop: `1px solid ${NW_BORDE}` }}>
              <button type="button" disabled={paso === 0} onClick={() => setPaso(p => Math.max(0, p - 1))} className="flex items-center gap-1 text-[13.5px] font-semibold disabled:opacity-0" style={{ color: NW_TINTA }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <div className="flex items-center gap-3">
                {/* Formación/Cómo quieres trabajar/Disponibilidad/Tarifa: ninguno bloquea
                    PATCH /api/network/perfil/estado (solo exige nombre+ciudad+especialidades)
                    — antes solo Formación ofrecía esta salida honesta, dejando el resto
                    "rellena o adivina que puedes saltarlo" sin decirlo (hallazgo de la
                    auditoría UX). */}
                {[5, 6, 7, 8].includes(paso) && (
                  <button type="button" onClick={() => setPaso(p => p + 1)} className="text-[13px] font-semibold" style={{ color: NW_MUTED }}>Lo haré más tarde</button>
                )}
                <button
                  type="button" disabled={guardando} onClick={siguiente}
                  className="flex items-center gap-1.5 px-8 py-3.5 rounded-full text-[14px] font-bold text-white disabled:opacity-60"
                  style={{ background: NW_PRODUCTO }}
                >
                  {guardando ? <Loader2 size={15} className="animate-spin" /> : null}
                  Continuar <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Split-screen en escritorio (lg+): antes era una columna de 384px centrada
// en toda la pantalla, con ~60% de aire vacío a los lados y sin ninguna
// imagen ni contexto de marca — la pantalla con MENOS orientación de todo
// el wizard justo en el primer contacto de la usuaria (hallazgo de la
// auditoría UX). Reutiliza /disciplinas/pilates.jpg — la misma foto real
// que ya usa SeccionHeroNetwork/SeccionCtaFinal para Network, no una
// encargada de nuevo (mismo criterio de marca: el producto se distingue
// por su color, no rehaciendo el material). En móvil/tablet, columna
// centrada como antes — el panel de foto se oculta, no se apila encima.
function ShellCentrado({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:flex" style={{ background: '#FAF9F5' }}>
      <div className="flex items-center justify-center px-6 py-16 lg:flex-1 lg:py-24">
        <div className="max-w-sm w-full">{children}</div>
      </div>
      <div className="hidden lg:block lg:flex-1 relative">
        <Image src="/disciplinas/pilates.jpg" alt="" fill sizes="50vw" style={{ objectFit: 'cover' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(26,26,26,.05), rgba(26,26,26,.35))' }} />
        <div className="absolute bottom-10 left-10 right-10">
          <p className="text-[22px] font-extrabold leading-tight text-white">
            La red profesional de instructoras de Pilates y Yoga.
          </p>
          <p className="mt-2 text-[14px] text-white/85">
            Publica tu perfil una vez. Los estudios te contactan a ti.
          </p>
        </div>
      </div>
    </div>
  );
}

function DropzoneDocumento({
  etiqueta, subiendo, error, inputRef, onArchivo,
}: {
  etiqueta: string; subiendo: boolean; error: string; inputRef: React.RefObject<HTMLInputElement | null>; onArchivo: (f: File) => void;
}) {
  return (
    <div>
      <input ref={inputRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onArchivo(f); }} />
      <button
        type="button" disabled={subiendo} onClick={() => inputRef.current?.click()}
        className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-xl text-[13px] font-semibold disabled:opacity-60"
        style={{ border: `1.5px dashed ${NW_BORDE}`, color: NW_MUTED }}
      >
        {subiendo ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
        {subiendo ? 'Subiendo…' : etiqueta}
      </button>
      {error && <p className="text-[12.5px] text-destructive mt-1.5">{error}</p>}
    </div>
  );
}

function EstadoDocumento({ estado, motivo }: { estado: VerificacionIdentidadNetwork['estado']; motivo: string | null }) {
  if (estado === 'verificado') return <EstadoPill estilo="verificada" texto="Verificada" />;
  if (estado === 'rechazado') {
    return (
      <div className="p-3 rounded-xl" style={{ background: NW_ESTADO.rechazada.fondo }}>
        <div className="flex items-center gap-1.5"><X size={13} style={{ color: NW_ESTADO.rechazada.color }} /><span className="text-[12.5px] font-bold" style={{ color: NW_ESTADO.rechazada.color }}>Rechazada</span></div>
        {motivo && <p className="text-[12px] mt-1" style={{ color: NW_ESTADO.rechazada.color }}>{motivo}</p>}
      </div>
    );
  }
  return <EstadoPill estilo="pendiente" texto={estado === 'en_revision' ? 'En revisión' : 'Pendiente de verificación'} />;
}

function EstadoPill({ estilo, texto }: { estilo: 'verificada' | 'pendiente' | 'rechazada'; texto: string }) {
  const c = NW_ESTADO[estilo];
  const Icono = estilo === 'verificada' ? ShieldCheck : Clock3;
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: c.fondo, color: c.color }}>
      <Icono size={13} /> {texto}
    </span>
  );
}

function PasoFormacion({
  certificaciones, setCertificaciones, userId,
}: {
  certificaciones: CertificacionNetwork[]; setCertificaciones: (c: CertificacionNetwork[]) => void; userId: string;
}) {
  const [abierto, setAbierto] = useState(certificaciones.length === 0);
  const [nombre, setNombre] = useState('');
  const [institucion, setInstitucion] = useState('');
  const [anio, setAnio] = useState('');
  const [duracion, setDuracion] = useState('');
  const [errorLocal, setErrorLocal] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function subir(file: File) {
    if (!nombre.trim() || !institucion.trim()) { setErrorLocal('Indica nombre e institución antes de subir el documento.'); return; }
    const invalido = validarDocumentoIdentidad(file);
    if (invalido) { setErrorLocal(invalido); return; }
    setErrorLocal(''); setSubiendo(true);
    const subida = await subirDocumentoIdentidad(userId, `certificacion-${Date.now()}`, file);
    if ('error' in subida) { setErrorLocal(subida.error); setSubiendo(false); return; }
    const res = await crearCertificacionNetwork({ nombre: nombre.trim(), institucion: institucion.trim(), anio: anio ? Number(anio) : null, duracion: duracion || null, documentoPath: subida.path });
    setSubiendo(false);
    if (!res.ok) { setErrorLocal(res.error); return; }
    setCertificaciones([res.certificacion, ...certificaciones]);
    setNombre(''); setInstitucion(''); setAnio(''); setDuracion(''); setAbierto(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px]" style={{ color: NW_MUTED }}>
        Publica tu formación con el certificado — una certificación no se marca verificada solo por subirla.
      </p>

      {certificaciones.map(c => (
        <div key={c.id} className="p-4 rounded-xl" style={{ border: `1px solid ${NW_BORDE}` }}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-bold" style={{ color: NW_TINTA }}>{c.nombre}</p>
              <p className="text-[12.5px]" style={{ color: NW_MUTED_2 }}>{c.institucion}{c.anio ? ` · ${c.anio}` : ''}</p>
            </div>
            <EstadoDocumento estado={c.estado} motivo={c.motivoRechazo} />
          </div>
          {c.estado === 'rechazado' && (
            <button type="button" onClick={async () => { await eliminarCertificacionNetwork(c.id); setCertificaciones(certificaciones.filter(x => x.id !== c.id)); setAbierto(true); }} className="mt-2 text-[12.5px] font-semibold underline" style={{ color: NW_TINTA }}>
              Volver a subir
            </button>
          )}
        </div>
      ))}

      {abierto ? (
        <div className="p-4 rounded-xl space-y-3" style={{ border: `1.5px dashed ${NW_BORDE}` }}>
          <div className="grid sm:grid-cols-2 gap-3">
            <input value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} style={inputStyle} placeholder="Nombre de la certificación" />
            <input value={institucion} onChange={e => setInstitucion(e.target.value)} className={inputCls} style={inputStyle} placeholder="Institución" />
            <input value={anio} onChange={e => setAnio(e.target.value)} className={inputCls} style={inputStyle} placeholder="Año" />
            <input value={duracion} onChange={e => setDuracion(e.target.value)} className={inputCls} style={inputStyle} placeholder="Duración (opcional)" />
          </div>
          {errorLocal && <p className="text-[12.5px] text-destructive">{errorLocal}</p>}
          <DropzoneDocumento etiqueta="Subir certificado" subiendo={subiendo} error="" inputRef={fileRef} onArchivo={subir} />
        </div>
      ) : (
        <button type="button" onClick={() => setAbierto(true)} className="text-[13.5px] font-semibold" style={{ color: NW_PRODUCTO }}>+ Añadir otra formación</button>
      )}
    </div>
  );
}

function PasoRevisar({
  perfil, form, verificacion, onEditar,
}: {
  perfil: PerfilNetwork; form: FormState; verificacion: VerificacionIdentidadNetwork | null; onEditar: (paso: number) => void;
}) {
  return (
    <div className="text-center">
      <p className="text-[20px] font-extrabold mb-1" style={{ color: NW_TINTA }}>
        Así verán tu perfil <em style={{ color: NW_PRODUCTO }}>los estudios</em>
      </p>
      <p className="text-[13px] mb-6" style={{ color: NW_MUTED }}>Tus datos privados —documento, dirección, teléfono— no aparecen.</p>

      <div className="text-left rounded-2xl p-6 mb-6" style={{ border: `1px solid ${NW_BORDE}`, background: '#fff' }}>
        <div className="flex items-center gap-3">
          {perfil.fotoUrl
            // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora
            ? <img src={perfil.fotoUrl} alt={perfil.nombre} width={56} height={56} className="w-14 h-14 rounded-full object-cover" />
            : <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: NW_SAGE }}><Camera size={18} color={NW_MUTED} /></div>}
          <div>
            <p className="text-[15px] font-extrabold" style={{ color: NW_TINTA }}>{perfil.nombre}</p>
            <p className="text-[13px] font-bold" style={{ color: NW_PRODUCTO }}>Instructora de Pilates</p>
          </div>
        </div>
        <p className="text-[12.5px] mt-3" style={{ color: NW_MUTED_2 }}>{form.ciudad || 'Ciudad'} · {form.aniosExperiencia || '0'} años · {DISPONIBILIDAD_ESTADO_LABEL[form.disponibilidadEstado]}</p>
        {form.especialidades.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {form.especialidades.map(e => <span key={e} className="px-2.5 py-1 rounded-full text-[11.5px] font-semibold" style={{ background: NW_SAGE, color: NW_TINTA }}>{ESPECIALIDAD_LABEL[e]}</span>)}
          </div>
        )}
        <p className="text-[13px] font-bold mt-3" style={{ color: NW_TINTA }}>{form.tarifaRango ? `Desde ${TARIFA_RANGO_LABEL[form.tarifaRango]}` : 'Tarifa a consultar'}</p>
      </div>

      <div className="text-left space-y-1.5 mb-6">
        <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: NW_MUTED }}><Check size={13} style={{ color: NW_PRODUCTO }} /> Email verificado</p>
        <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: NW_MUTED }}>
          {verificacion?.estado === 'verificado'
            ? <><Check size={13} style={{ color: NW_PRODUCTO }} /> Identidad verificada</>
            : <><Clock3 size={13} style={{ color: NW_ESTADO.pendiente.color }} /> Identidad {verificacion ? 'en revisión' : 'pendiente'}</>}
        </p>
      </div>

      <button type="button" onClick={() => onEditar(0)} className="text-[13px] font-semibold underline" style={{ color: NW_TINTA }}>Editar algo</button>
    </div>
  );
}
