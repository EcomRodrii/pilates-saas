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
//
// F0 del roadmap de Tentare Network 2.0: partido en un componente por paso
// (./pasos/) para no seguir creciendo un único fichero de ~950 líneas. Este
// fichero se queda solo con el estado de orquestación compartido, las
// funciones que llaman a la API y mutan `perfil`, el rail de progreso y el
// pie de navegación — cero cambio de comportamiento respecto a la versión
// anterior.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useAuth } from '@/lib/auth-context';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { recordarEmailOtpPendiente, leerEmailOtpPendiente, olvidarEmailOtpPendiente } from '@/lib/auth/otp-pendiente';
import {
  fetchMiPerfilNetwork, guardarPerfilNetwork, cambiarEstadoPerfilNetwork,
  fetchPerfilIdentidadNetwork, guardarPerfilIdentidadNetwork,
  fetchVerificacionIdentidadNetwork, enviarVerificacionIdentidadNetwork,
  fetchCertificacionesNetwork,
} from '@/lib/api-client';
import { subirFotoPerfilNetwork, validarFotoPerfil } from '@/lib/portal-storage';
import { subirDocumentoIdentidad, validarDocumentoIdentidad } from '@/lib/network/documentos-identidad';
import type { PerfilNetwork, VerificacionIdentidadNetwork, CertificacionNetwork } from '@/lib/network/tipos';
import { PASOS_ONBOARDING as PASOS, pasoIncompletoDe } from '@/lib/network/pasos-onboarding';
import { NW_TINTA, NW_MUTED, NW_MUTED_2, NW_BORDE, NW_SAGE, NW_PRODUCTO, NW_ARENA, NW_VERDE_OSCURO, NW_FONDO } from '@/components/network-v2/tokens';
import type { FormState, IdentidadForm } from './form-state';
import { formVacio, formDesdePerfil, identidadVacia, identidadDesdeApi } from './form-state';
import { PasoCuenta } from './pasos/paso-cuenta';
import { PasoIdentidad } from './pasos/paso-identidad';
import { PasoUbicacion } from './pasos/paso-ubicacion';
import { PasoExperiencia } from './pasos/paso-experiencia';
import { PasoEspecialidades } from './pasos/paso-especialidades';
import { PasoFormacion } from './pasos/paso-formacion';
import { PasoComoTrabajar } from './pasos/paso-como-trabajar';
import { PasoDisponibilidad } from './pasos/paso-disponibilidad';
import { PasoTarifa } from './pasos/paso-tarifa';
import { PasoPerfil } from './pasos/paso-perfil';
import { PasoRevisar } from './pasos/paso-revisar';
import { PasoPublicar } from './pasos/paso-publicar';

// Mismo par editorial que /network (app/network/page.tsx): serif ROMANA
// (nunca cursiva, ver el comentario de tokens.ts) para el titular de cada
// paso, sans para todo lo funcional. Antes el wizard entero — landing,
// perfil público y este onboarding de 12 pasos, la superficie con MÁS
// tiempo de permanencia de las tres — solo usaba Jakarta Sans, la marca
// más plana de las cuatro dimensiones señaladas por el fundador.
const FUENTE_DISPLAY = { fontFamily: 'var(--font-display), Georgia, serif', fontStyle: 'normal' as const };

export default function CrearPerfilNetworkPage() {
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

  // Vuelve a /network/acceso — el punto de retorno propio de Network (ver
  // lib/db/supabase.ts, RUTAS_RETORNO_AUTH_STAFF), no a /login. Ese efecto
  // resuelve la cuenta con `producto=network` y, si es un alta nueva sin
  // perfil todavía, manda de vuelta aquí mismo a seguir el asistente.
  async function conectarConGoogle() {
    setErrorCuenta('');
    setConectandoGoogle(true);
    const { error } = await signInWithGoogle('/network/acceso');
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
  // Anverso/reverso del documento de identidad: dos dropzones, dos subidas
  // independientes — el DNI/NIE necesita las dos caras, el Pasaporte solo
  // el anverso (sin reverso). El POST de verificación no se dispara hasta
  // que el conjunto que exige `identidad.tipoDocumento` está completo (ver
  // intentarEnviarVerificacion), nunca tras la primera cara sola.
  const [docAnverso, setDocAnverso] = useState<string | null>(null);
  const [docReverso, setDocReverso] = useState<string | null>(null);
  const fileInputDocAnverso = useRef<HTMLInputElement>(null);
  const fileInputDocReverso = useRef<HTMLInputElement>(null);
  const [subiendoAnverso, setSubiendoAnverso] = useState(false);
  const [subiendoReverso, setSubiendoReverso] = useState(false);
  const [errorDocAnverso, setErrorDocAnverso] = useState('');
  const [errorDocReverso, setErrorDocReverso] = useState('');
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

  function limpiarOtp() {
    olvidarEmailOtpPendiente();
    setEmailOtp(null);
    setErrorCuenta('');
    setInfoCuenta('');
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

  // Envía la verificación solo cuando el conjunto de caras que exige el
  // tipo de documento elegido está completo — Pasaporte no tiene reverso,
  // DNI/NIE sí. Se llama tanto tras cada subida como al cambiar de tipo de
  // documento (elegir Pasaporte después de subir el anverso no debe dejar
  // el envío colgado esperando un reverso que ya no hace falta).
  async function intentarEnviarVerificacion(anverso: string | null, reverso: string | null) {
    if (!anverso) return;
    const necesitaReverso = identidad.tipoDocumento !== 'Pasaporte';
    if (necesitaReverso && !reverso) return;
    const res = await enviarVerificacionIdentidadNetwork(anverso, reverso);
    if (!res.ok) { setErrorDocAnverso(res.error); return; }
    setVerificacion(res.verificacion);
  }

  async function subirDocIdentidad(cara: 'anverso' | 'reverso', file: File) {
    if (!user) return;
    const invalido = validarDocumentoIdentidad(file);
    const setSubiendo = cara === 'anverso' ? setSubiendoAnverso : setSubiendoReverso;
    const setErrorCara = cara === 'anverso' ? setErrorDocAnverso : setErrorDocReverso;
    const setPath = cara === 'anverso' ? setDocAnverso : setDocReverso;
    if (invalido) { setErrorCara(invalido); return; }
    setErrorCara(''); setSubiendo(true);
    const subida = await subirDocumentoIdentidad(user.id, `identidad-${cara}`, file);
    setSubiendo(false);
    if ('error' in subida) { setErrorCara(subida.error); return; }
    setPath(subida.path);
    await intentarEnviarVerificacion(
      cara === 'anverso' ? subida.path : docAnverso,
      cara === 'reverso' ? subida.path : docReverso,
    );
  }

  async function publicarPerfil() {
    setPublicando(true);
    const res = await cambiarEstadoPerfilNetwork('en_revision');
    setPublicando(false);
    if (!res.ok) { setError(res.error); return; }
    setPerfil(res.perfil);
  }

  if (cargandoSesion || cargando) return null;

  // ── Paso 01 sin sesión (cuenta, código OTP y Google) ───────────────────
  if (!user) {
    return (
      <PasoCuenta
        emailOtp={emailOtp}
        nombreCuenta={nombreCuenta} setNombreCuenta={setNombreCuenta}
        emailCuenta={emailCuenta} setEmailCuenta={setEmailCuenta}
        passwordCuenta={passwordCuenta} setPasswordCuenta={setPasswordCuenta}
        errorCuenta={errorCuenta} infoCuenta={infoCuenta} cuentaExistente={cuentaExistente}
        creandoCuenta={creandoCuenta}
        conectandoGoogle={conectandoGoogle} conectarConGoogle={conectarConGoogle}
        captcha={captcha}
        crearCuenta={crearCuenta}
        verificarOtpSignup={verificarOtpSignup}
        pedirToken={pedirToken}
        reenviarConfirmacion={reenviarConfirmacion}
        onCambiarEmail={limpiarOtp}
        onVerificado={() => olvidarEmailOtpPendiente()}
      />
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
    <div className="min-h-dvh flex flex-col lg:flex-row" style={{ background: NW_FONDO }}>
      {/* Rail izquierdo */}
      <aside className="lg:w-[300px] shrink-0 p-8 lg:min-h-dvh" style={{ background: NW_SAGE }}>
        <Link href="/network" className="inline-flex mb-8"><LogoTentare formato="horizontal" tinta="tinta" producto="network" titulo="Tentare Network" alto={22} decorativo /></Link>
        <h2 className="text-[22px]" style={{ ...FUENTE_DISPLAY, color: NW_TINTA }}>Crea tu perfil</h2>
        <div className="mt-4 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.6)' }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((paso / (PASOS.length - 1)) * 100)}%`, background: `linear-gradient(90deg, ${NW_PRODUCTO}, ${NW_ARENA})` }} />
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
                      background: hecho ? NW_PRODUCTO : actual ? NW_ARENA : 'transparent',
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
            <Check size={14} style={{ color: NW_PRODUCTO }} /> Guardado automáticamente
          </span>
          <Link href="/network/mi-perfil" className="text-[12.5px] font-semibold" style={{ color: NW_MUTED }}>Guardar y salir</Link>
        </div>

        <main className="flex-1 max-w-[700px] w-full mx-auto px-8 py-10">
          <p
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-bold uppercase tracking-wide mb-3"
            style={{ background: `color-mix(in srgb, ${NW_ARENA} 38%, white)`, color: NW_VERDE_OSCURO }}
          >
            Paso {String(pasoActual.n).padStart(2, '0')} de 12
          </p>
          <h1 className="text-[30px] sm:text-[36px] font-extrabold mb-6 leading-[1.05]" style={{ color: NW_TINTA }}>
            {pasoActual.titulo.split(' ').map((palabra, i, arr) => i === arr.length - 1
              ? <span key={i} style={{ ...FUENTE_DISPLAY, color: NW_PRODUCTO, fontWeight: 400 }}>{palabra}</span>
              : `${palabra} `)}
          </h1>

          {error && <p className="text-[13px] text-destructive bg-destructive/10 rounded-lg px-3 py-2 mb-4">{error}</p>}

          {paso === 1 && (
            <PasoIdentidad
              identidad={identidad} setIdentidad={setIdentidad}
              verificacion={verificacion}
              docAnverso={docAnverso} docReverso={docReverso}
              subiendoAnverso={subiendoAnverso} errorDocAnverso={errorDocAnverso} fileInputDocAnverso={fileInputDocAnverso}
              subiendoReverso={subiendoReverso} errorDocReverso={errorDocReverso} fileInputDocReverso={fileInputDocReverso}
              subirDocIdentidad={subirDocIdentidad}
              intentarEnviarVerificacion={intentarEnviarVerificacion}
            />
          )}

          {paso === 2 && <PasoUbicacion form={form} setForm={setForm} />}

          {paso === 3 && <PasoExperiencia form={form} setForm={setForm} />}

          {paso === 4 && <PasoEspecialidades form={form} setForm={setForm} guardar={guardar} />}

          {paso === 5 && (
            <PasoFormacion certificaciones={certificaciones} setCertificaciones={setCertificaciones} userId={user.id} />
          )}

          {paso === 6 && <PasoComoTrabajar form={form} setForm={setForm} />}

          {paso === 7 && <PasoDisponibilidad form={form} setForm={setForm} />}

          {paso === 8 && <PasoTarifa form={form} setForm={setForm} />}

          {paso === 9 && (
            <PasoPerfil perfil={perfil} form={form} setForm={setForm} fileInputFoto={fileInputFoto} subiendoFoto={subiendoFoto} subirFoto={subirFoto} />
          )}

          {paso === 10 && perfil && (
            <PasoRevisar perfil={perfil} form={form} verificacion={verificacion} onEditar={setPaso} />
          )}

          {paso === 11 && perfil && (
            <PasoPublicar perfil={perfil} publicando={publicando} onPublicar={publicarPerfil} />
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
