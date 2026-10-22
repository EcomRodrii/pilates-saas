'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Eye, EyeOff, Info, Loader2, Mail, MessageCircle, RotateCcw } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/db/supabase';
import { dbCreateStudio, setCurrentStudioId } from '@/lib/supabase-data';
import { asociarEstudio, capturarEvento, identificar, vincularEstudio } from '@/lib/posthog-cliente';
import { registrarAltaCompletada } from '@/lib/meta-pixel-cliente';
import { CLAVE_ORIGEN_ALTA } from '@/lib/landing/medicion';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { OtpVerificacion } from '@/components/auth/otp-verificacion';
import { recordarEmailOtpPendiente, leerEmailOtpPendiente, olvidarEmailOtpPendiente } from '@/lib/auth/otp-pendiente';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { authHeader } from '@/lib/api-client';
import { GRATIS_CON_LIMITES } from '@/lib/landing/founding-gratis';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { VERSION_TEXTOS_LEGALES } from '@/lib/legal-info';
import { SOPORTE_WHATSAPP } from '@/lib/soporte';
import { enlaceWhatsApp } from '@/lib/decision/mensajes-socia';
import { avisarProgresoAlta } from '@/lib/alta/progreso-cliente';
import { cn } from '@/lib/utils';
import { useEscalaIphone } from '@/components/ui/marco-iphone';
import { AppDeMuestra } from '@/components/alta-nueva/app-de-muestra';
import {
  errorDeCampo,
  guardarBorradorAltaNueva,
  leerBorradorAltaNueva,
  mensajeDeErrorAlta,
  metadataDelAlta,
  olvidarBorradorAltaNueva,
  primerCampoConError,
  reglasContrasena,
  slugPrevisto,
  sugerirEmail,
  MAX_NOMBRE,
  type CampoRegistro,
  type DatosRegistro,
} from '@/lib/alta/registro';

// ─────────────────────────────────────────────────────────────────────────────
// El alta nueva: registro en una pantalla y el código en el asunto (PR-2 del
// alta nueva, maqueta aprobada por el fundador el 21-oct-2026, «01 · Registro»
// y «02 · Verificación»). Detrás de ALTA_NUEVA_REGISTRO (page.tsx): el alta de
// siempre (alta-estudio.tsx) sigue intacta para quien no la vea.
//
// Lo que cambia frente al alta de siempre: tres campos en una pantalla (nombre
// del estudio, email, contraseña), validados campo a campo (al salir de cada
// uno y, desde ahí, mientras se escribe), «¿Querías decir…?» para las erratas
// del dominio, la dirección de su página mientras escribe el nombre, la línea
// legal (que se guarda: `condiciones_version`) y la pantalla de éxito «… ya
// existe». Sin nombre de persona ni ciudad (pasan al paso 3, PR-3), sin
// «¿Cómo conociste Tentare?» (la atribución sale del enlace de llegada) y sin
// plan que elegir.
//
// Lo que NO cambia, y se reutiliza tal cual (ver la cabecera de
// alta-estudio.tsx, que explica cada porqué):
//   · el estudio viaja en `pending_studio` porque sin confirmar el email no hay
//     sesión con la que escribir en `studios`;
//   · el botón entra en «Creando tu estudio…» ANTES de pedir el token del
//     captcha invisible (tarda segundos) y no se puede pulsar dos veces;
//   · el correo lleva un CÓDIGO, y se escribe en el mismo `<OtpVerificacion>`
//     que /login y Network;
//   · el borrador se guarda sin la contraseña (con su propia clave);
//   · si el estudio no se monta tras verificar, «Reintentar ahora» repite
//     `dbCreateStudio` (idempotente) sin pedir otro código;
//   · quien llega con la sesión abierta y sin estudio (entró con Google) no
//     crea otra cuenta: solo escribe el nombre.
// ─────────────────────────────────────────────────────────────────────────────

type Fase = 'formulario' | 'codigo' | 'listo';
type Version = 'v2' | 'v2_prueba';

/**
 * La línea de la ruta: los cinco pasos del alta (`false` = opcional), los mismos
 * que la bienvenida del panel (`LINEA_DE_PASOS`, lib/alta/bienvenida-nueva.ts).
 * La primera clase ya no es un paso del alta (fundador, 21-oct): es la primera
 * tarea de «Pon en marcha tu estudio», justo después.
 */
const PASOS_RUTA: readonly (readonly [string, string, boolean])[] = [
  ['01', 'Cuenta', true],
  ['02', 'Código', true],
  ['03', 'Tu estudio', true],
  ['04', 'Tus datos', false],
  ['05', 'Tu marca', false],
];

/** Lo que viene después del código (la pantalla de éxito). */
const RUTA_SIGUIENTE: readonly { que: string; cuanto: string; opcional?: boolean }[] = [
  { que: 'Dónde está y cuándo abre', cuanto: '≈ 3 min' },
  { que: 'Tus datos y tu marca', cuanto: 'opcional', opcional: true },
  { que: 'Después, en tu panel: tu primera clase, con su precio', cuanto: '≈ 5 min' },
];

const ERROR_RED = 'No hemos podido crear tu estudio. Revisa tu conexión e inténtalo otra vez.';

export function AltaNueva({ version, foundingGratis }: { version: Version; foundingGratis: boolean }) {
  const uid = useId();
  const { signUp, verificarOtpSignup, reenviarConfirmacion, session, user, loading: cargandoSesion, signOut } = useAuth();
  const { widget: captcha, pedirToken } = useCaptcha();

  const [datos, setDatos] = useState<DatosRegistro>({ nombre: '', email: '', contrasena: '' });
  const [tocado, setTocado] = useState<Record<CampoRegistro, boolean>>({ nombre: false, email: false, contrasena: false });
  const [verContrasena, setVerContrasena] = useState(false);
  const [fase, setFase] = useState<Fase>('formulario');
  const [enviando, setEnviando] = useState(false);
  const [montando, setMontando] = useState(false);
  const [error, setError] = useState('');
  const [emailOtp, setEmailOtp] = useState<string | null>(null);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const [sesionSinEstudio, setSesionSinEstudio] = useState(false);
  const [estudioCreado, setEstudioCreado] = useState<string | null>(null);
  const cuentaNuevaAqui = useRef(false);
  const yaMontado = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const refNombre = useRef<HTMLInputElement>(null);
  const refEmail = useRef<HTMLInputElement>(null);
  const refContrasena = useRef<HTMLInputElement>(null);
  const refs: Record<CampoRegistro, React.RefObject<HTMLInputElement | null>> = {
    nombre: refNombre, email: refEmail, contrasena: refContrasena,
  };
  const conSesion = sesionSinEstudio && !!session;

  const id = (campo: string) => `${uid}-${campo}`;
  const errores: Record<CampoRegistro, string> = {
    nombre: errorDeCampo('nombre', datos),
    email: errorDeCampo('email', datos),
    contrasena: errorDeCampo('contrasena', datos),
  };
  // La errata del dominio, desde que sale del campo: mientras se teclea
  // «@gmail.co» todavía no es una errata.
  const sugerencia = tocado.email ? sugerirEmail(datos.email) : null;
  const reglas = reglasContrasena(datos.contrasena, datos.nombre);
  const slug = slugPrevisto(datos.nombre);
  const nombreVisible = datos.nombre.trim() || 'Tu estudio';
  const whatsapp = enlaceWhatsApp(SOPORTE_WHATSAPP, 'Hola, estoy creando mi estudio en Tentare y tengo una duda:') ?? undefined;
  const lineaPlan = foundingGratis
    ? `${GRATIS_CON_LIMITES} · Sin tarjeta · Sin permanencia`
    : `${TRIAL_DIAS} días gratis · Sin tarjeta de crédito · Sin permanencia`;

  // ── Recuperar lo que dejó a medias ───────────────────────────────────────
  // En un efecto y no en el `useState`: localStorage no existe en el servidor y
  // el primer render de cliente tiene que coincidir con el HTML (hidratación).
  useEffect(() => {
    const otpPendiente = leerEmailOtpPendiente();
    const guardado = leerBorradorAltaNueva();
    if (!guardado && !otpPendiente) return;
    if (guardado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDatos((d) => ({ ...d, nombre: guardado.nombre, email: guardado.email }));
    }
    // La cuenta YA está creada y el código YA se mandó: se vuelve a él, no al
    // formulario (registrarse otra vez acabaría en «ya hay una cuenta»).
    if (otpPendiente) {
      setEmailOtp(otpPendiente);
      setFase('codigo');
      return;
    }
    setBorradorRecuperado(true);
  }, []);

  // El embudo en PostHog (el de la base de datos lo apunta el trigger de
  // auth.users con `version`): una vez, con el botón de la web que la trajo.
  const iniciada = useRef(false);
  useEffect(() => {
    if (iniciada.current) return;
    iniciada.current = true;
    capturarEvento('alta_estudio_iniciada', { desde: leerLlegada() ?? 'directo', version });
  }, [version]);

  // ¿Llega con la sesión abierta? Con estudio, a su panel; sin él, solo falta el
  // nombre. La misma pregunta que hace /login, con el mismo contexto.
  const usuarioId = session?.user?.id ?? null;
  useEffect(() => {
    if (cargandoSesion || !usuarioId || cuentaNuevaAqui.current || fase !== 'formulario') return;
    let cancelado = false;
    void (async () => {
      const r = await fetch('/api/auth/destino-post-login?producto=software', { headers: await authHeader() })
        .then((x) => (x.ok ? x.json() : null))
        .catch(() => null);
      if (cancelado || cuentaNuevaAqui.current) return;
      if (r?.tipo === 'entra') { window.location.href = r.destino ?? '/dashboard'; return; }
      // Sin respuesta, el alta de siempre: peor es montar un estudio sobre una
      // cuenta que quizá ya tiene uno.
      if (!r) return;
      setSesionSinEstudio(true);
      capturarEvento('alta_estudio_con_sesion');
      // Sin signUp no hay trigger que apunte la versión: se dice aquí.
      avisarProgresoAlta('inicio', undefined, { version });
    })();
    return () => { cancelado = true; };
  }, [cargandoSesion, usuarioId, fase, version]);

  // Guarda a medida que escribe (sin la contraseña). `yaMontado` evita pisar lo
  // recuperado con el primer render vacío.
  useEffect(() => {
    if (!yaMontado.current) { yaMontado.current = true; return; }
    if (fase === 'formulario') guardarBorradorAltaNueva({ nombre: datos.nombre, email: datos.email });
  }, [datos.nombre, datos.email, fase]);

  // Al cambiar de pantalla el foco va al titular: si no, se queda en un botón
  // que ya no existe y el cambio no se anuncia.
  useEffect(() => {
    if (fase !== 'formulario') tituloRef.current?.focus();
  }, [fase]);

  function cambiar(campo: CampoRegistro, valor: string) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  // Al salir del campo se valida; desde ahí, mientras escribe (los errores se
  // calculan en cada render y se enseñan si el campo ya se tocó).
  function salir(campo: CampoRegistro) {
    setTocado((t) => (t[campo] ? t : { ...t, [campo]: true }));
  }

  // ── Montar el estudio con la sesión ya abierta ───────────────────────────
  // Lo llaman los tres caminos: el directo (proyecto sin confirmación), el de
  // después del código y el de la sesión abierta. Si falla no se pierde nada:
  // `pending_studio` sigue en la metadata y «Reintentar ahora» lo repite.
  async function montarEstudio() {
    if (montando) return;
    setMontando(true);
    setError('');
    try {
      // `getSession()` y no `getUser()`: la sesión la acaba de emitir nuestro
      // propio servidor; un viaje más solo añade dónde colgarse (alta-estudio.tsx).
      const { data: { session: sesion } } = await supabase.auth.getSession();
      const cuenta = sesion?.user ?? null;
      if (!cuenta) {
        setError('Tu cuenta está verificada, pero no hemos podido abrir la sesión. Pulsa «Reintentar ahora».');
        return;
      }
      // Manda el nombre de la metadata (`pending_studio`), que es con el que lo
      // montaría /login si esto no llegara a terminar: el id del estudio sale de
      // (propietaria + nombre), así los dos caminos dan el MISMO estudio.
      const pendiente = cuenta.user_metadata?.pending_studio as { nombre?: unknown } | undefined;
      const nombre = (typeof pendiente?.nombre === 'string' && pendiente.nombre.trim()) || datos.nombre.trim();
      if (!nombre) {
        setError('Escribe el nombre de tu estudio para montarlo.');
        return;
      }
      const estudio = await dbCreateStudio({ nombre, plan: 'BASE', ownerAuthUserId: cuenta.id });
      if (!estudio) {
        avisarProgresoAlta('error_estudio');
        setError(conSesion
          ? 'No hemos podido montar el estudio todavía. Vuelve a pulsar el botón para intentarlo otra vez.'
          : 'Tu cuenta está creada, pero no hemos podido montar el estudio todavía. Pulsa «Reintentar ahora».');
        return;
      }
      setCurrentStudioId(estudio.id);
      olvidarBorradorAltaNueva();
      olvidarEmailOtpPendiente();
      vincularEstudio(estudio.id);
      asociarEstudio(estudio.id);
      capturarEvento('alta_estudio_creada', { plan: 'BASE', version });
      registrarAltaCompletada('BASE');
      setEstudioCreado(nombre);
      setFase('listo');
      // «Tu cuenta está activa» (correo 2). Sin esperar: el servidor decide si
      // toca (una vez, estudio recién creado, alta nueva) y si no sale, el alta
      // sigue igual.
      pedirCorreoCuentaActiva();
    } finally {
      setMontando(false);
    }
  }

  async function crear(e?: React.FormEvent) {
    e?.preventDefault();
    if (enviando || montando) return;
    // Pulsar valida todo lo que falte, y el foco va al primero con algo que arreglar.
    setTocado({ nombre: true, email: true, contrasena: true });
    const primero: CampoRegistro | null = conSesion ? (errores.nombre ? 'nombre' : null) : primerCampoConError(datos);
    if (primero) {
      refs[primero].current?.focus();
      return;
    }
    setError('');

    if (conSesion) {
      setEnviando(true);
      try {
        // Pulsar «Crear mi estudio» bajo la línea legal es aceptar los textos.
        avisarProgresoAlta('plan', datos.nombre, { version, condiciones: VERSION_TEXTOS_LEGALES });
        await montarEstudio();
      } catch {
        setError(ERROR_RED);
      } finally {
        setEnviando(false);
      }
      return;
    }

    cuentaNuevaAqui.current = true;
    // ANTES de pedir el token: Turnstile tarda segundos y el botón no puede
    // quedarse inerte (bug real de #843).
    setEnviando(true);
    try {
      const token = await pedirToken();
      if (token === null) { setError(ERROR_CAPTCHA); return; }

      const emailUsado = datos.email.trim();
      const { error: errorAlta, needsConfirmation, yaRegistrado, userId } = await signUp(
        emailUsado,
        datos.contrasena,
        { ...metadataDelAlta({ nombre: datos.nombre, version, llegada: leerLlegada(), condicionesVersion: VERSION_TEXTOS_LEGALES }) },
        token ?? undefined,
      );
      if (yaRegistrado) {
        // gotrue contesta 200 con un usuario fantasma y NO manda nada: decir
        // «revisa tu correo» sería mentir.
        setError('Ya hay una cuenta con este email. Inicia sesión y podrás seguir desde donde lo dejaste.');
        return;
      }
      if (errorAlta) { setError(mensajeDeErrorAlta(errorAlta)); return; }
      if (userId) {
        identificar(userId);
        capturarEvento('alta_estudio_cuenta_creada');
      }
      if (needsConfirmation) {
        recordarEmailOtpPendiente(emailUsado);
        setEmailOtp(emailUsado);
        setFase('codigo');
        return;
      }
      // Confirmación de email desactivada en el proyecto: ya hay sesión.
      await montarEstudio();
    } catch {
      setError(ERROR_RED);
    } finally {
      setEnviando(false);
    }
  }

  // ── Pantallas ────────────────────────────────────────────────────────────

  if (fase === 'listo') {
    return (
      <Marco whatsapp={whatsapp}>
        <Columna>
          <LineaDePasos actual={3} />
          <IconoGrande ok><Check className="h-[22px] w-[22px]" aria-hidden="true" /></IconoGrande>
          {!conSesion && <p className="t-label mt-[18px] text-t-tertiary">Código correcto</p>}
          <h1 ref={tituloRef} tabIndex={-1} className={cn(TITULO, conSesion && 'mt-[18px]')}>{estudioCreado ?? nombreVisible} ya existe</h1>
          <p className={SUBTITULO}>
            Hemos creado tu estudio y tu página de reservas. Ahora, lo esencial: dos pantallas con casi todo puesto y,
            después, tu primera clase.
          </p>
          <ul className="relative mt-5 grid">
            {RUTA_SIGUIENTE.map((r, i) => (
              <li key={r.que} className="relative flex items-baseline justify-between gap-3 py-2.5 pl-6 text-[14px]">
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute left-0 top-[15px] h-[9px] w-[9px] rounded-full',
                    r.opcional ? 'bg-t-canvas shadow-[inset_0_0_0_1.5px_var(--t-text-tertiary)]' : 'bg-t-primary',
                  )}
                />
                {i < RUTA_SIGUIENTE.length - 1 && (
                  <span aria-hidden="true" className="absolute bottom-[-14px] left-[4px] top-[26px] border-l-[1.5px] border-dashed border-[color:var(--t-text-disabled)]" />
                )}
                <b className="font-semibold">{r.que}</b>
                <span className="font-t-mono text-[12px] text-t-tertiary">{r.cuanto}</span>
              </li>
            ))}
          </ul>
          <div className="mt-[22px] flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {/* Hasta que llegue la bienvenida nueva (PR-3), las dos van al panel,
                que enseña la bienvenida de siempre. */}
            <a href="/dashboard" className={BOTON_PRINCIPAL}>
              Configurar mi estudio <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a href="/dashboard" className={ENLACE}>Prefiero ir a mi panel</a>
          </div>
        </Columna>
      </Marco>
    );
  }

  if (fase === 'codigo' && emailOtp) {
    return (
      <Marco whatsapp={whatsapp}>
        <Columna>
          <LineaDePasos actual={2} />
          <IconoGrande><Mail className="h-[22px] w-[22px]" aria-hidden="true" /></IconoGrande>
          <p className="t-label mt-[18px] text-t-tertiary">Paso 2 de 5 · menos de 1 minuto</p>
          <h1 ref={tituloRef} tabIndex={-1} className={TITULO}>Revisa tu correo</h1>
          <p className={SUBTITULO}>
            Te hemos enviado un código de 6 cifras a <b className="font-semibold text-t-primary [overflow-wrap:anywhere]">{emailOtp}</b>.
            Escríbelo aquí y abrimos <b className="font-semibold text-t-primary">{nombreVisible}</b>.
          </p>
          <div className="mt-6">
            {/* El MISMO componente que /login y Network: el código, el reenvío
                con su cuenta atrás real, el cambio de email y el bloqueo. Aquí
                sin su titular (lo dice esta pantalla) y comprobándose solo al
                escribir la sexta cifra. */}
            <OtpVerificacion
              email={emailOtp}
              onVerificar={(codigo) => verificarOtpSignup(emailOtp, codigo)}
              onReenviar={async () => {
                const token = await pedirToken();
                if (token === null) return { error: ERROR_CAPTCHA };
                return reenviarConfirmacion(emailOtp, token || undefined);
              }}
              // Volver al formulario con todo lo escrito (el borrador sigue).
              onCambiarEmail={() => {
                olvidarEmailOtpPendiente();
                setEmailOtp(null);
                setError('');
                setFase('formulario');
              }}
              onVerificado={() => {
                capturarEvento('alta_estudio_email_confirmado');
                void montarEstudio();
              }}
              sinTarjeta
              sinCabecera
              verificarAlCompletar
            />
          </div>
          <div aria-live="polite">
            {error && (
              <div className="mt-4">
                <p className="rounded-[12px] bg-t-error-bg px-3.5 py-2.5 text-[13px] font-medium text-t-error">{error}</p>
                {/* El email ya está verificado: reintentar es repetir
                    `dbCreateStudio` (idempotente), nunca pedir otro código. */}
                <button type="button" onClick={() => void montarEstudio()} disabled={montando} className={cn(BOTON_PRINCIPAL, 'mt-2.5 w-full')}>
                  {montando
                    ? <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Reintentando…</>
                    : <><RotateCcw className="h-[15px] w-[15px]" aria-hidden="true" /> Reintentar ahora</>}
                </button>
              </div>
            )}
          </div>
          <div className="mt-[22px] flex items-start gap-2.5 rounded-[14px] bg-t-raised px-3.5 py-3 text-[13.5px] leading-5 text-t-secondary shadow-t-card">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-t-info" aria-hidden="true" />
            <p>¿No lo ves? Mira en Promociones o en Spam. El código caduca en 10 minutos y en el iPhone puede salirte encima del teclado.</p>
          </div>
          {captcha}
        </Columna>
      </Marco>
    );
  }

  // ── El formulario ────────────────────────────────────────────────────────
  // Los avisos de cada campo viven en contenedores `aria-live` que están SIEMPRE
  // (vacíos no miden nada): uno que aparece de la nada, o con `display: none`
  // mientras está vacío, no lo anuncia un lector de pantalla. Por eso el
  // espacio va en lo de dentro y no con `gap`, que lo dejaría también vacío.
  const mostrarError = (c: CampoRegistro) => tocado[c] && errores[c] !== '';
  const bien = (c: CampoRegistro) => tocado[c] && errores[c] === '';

  return (
    <Marco whatsapp={whatsapp}>
      <main className="grid flex-1 gap-6 px-[18px] pb-7 pt-1 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:pb-9 lg:pt-3">
        <div className="min-w-0 lg:pt-2">
          <LineaDePasos actual={1} />
          <p className="t-label mt-5 text-t-tertiary sm:mt-7">Paso 1 de 5 · unos 2 minutos</p>
          <h1 className={TITULO}>Crea tu estudio en Tentare</h1>
          <p className={SUBTITULO}>Crea tu cuenta y, en unos 10 minutos, tendrás tu primera clase abierta a reservas.</p>

          {conSesion && (
            <p className="mt-4 rounded-[12px] bg-t-info-bg px-3.5 py-2.5 text-[13px] leading-[19px] text-t-primary">
              Ya tienes cuenta{user?.email ? <> como <strong className="[overflow-wrap:anywhere]">{user.email}</strong></> : null}: solo falta montar tu estudio.{' '}
              <button
                type="button"
                onClick={() => void signOut().then(() => setSesionSinEstudio(false))}
                className={cn(ENLACE, 'text-[13px]')}
              >
                No soy yo
              </button>
            </p>
          )}
          {borradorRecuperado && !conSesion && (
            <p className="mt-4 flex items-start gap-2 rounded-[12px] bg-t-info-bg px-3.5 py-2.5 text-[13px] leading-[19px] text-t-primary">
              <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-t-info" aria-hidden="true" />
              Hemos recuperado lo que habías dejado a medias.
            </p>
          )}

          <form noValidate onSubmit={(e) => void crear(e)} className="mt-6">
            {/* ── Nombre del estudio ── */}
            <div className="min-w-0">
              <label htmlFor={id('nombre')} className={ETIQUETA}>Nombre de tu estudio</label>
              <div className="relative">
                <input
                  ref={refNombre}
                  id={id('nombre')}
                  value={datos.nombre}
                  onChange={(e) => cambiar('nombre', e.target.value)}
                  onBlur={() => salir('nombre')}
                  autoComplete="organization"
                  placeholder="Ej. Estudio Alba Pilates"
                  maxLength={MAX_NOMBRE}
                  aria-invalid={mostrarError('nombre')}
                  aria-describedby={`${id('nombre')}-a ${id('nombre')}-e`}
                  className={INPUT}
                />
                <IconoBien visible={bien('nombre')} />
              </div>
              <p id={`${id('nombre')}-a`} className={cn(AYUDA, 'mt-1.5')}>
                {/* La misma dirección que enseña el iPhone de al lado: la de la app de sus alumnas. */}
                La app de tus alumnas:{' '}
                <span className="font-t-mono text-[12.5px] text-t-secondary [overflow-wrap:anywhere]" data-testid="direccion-prevista">
                  tentare.app/portal/{slug}
                </span>
                {/* La base sale de `slugify`, pero `dbCreateStudio` le pone «-2»,
                    «-3»… si ya es de otro estudio: no se promete la exacta. */}
                <span className="block">Si otro estudio ya la tiene, le añadimos un número al final.</span>
              </p>
              <ErrorCampo id={`${id('nombre')}-e`} texto={mostrarError('nombre') ? errores.nombre : ''} />
            </div>

            {!conSesion && (
              <>
                {/* ── Email ── */}
                <div className="mt-[18px] min-w-0">
                  <label htmlFor={id('email')} className={ETIQUETA}>Tu email</label>
                  <div className="relative">
                    <input
                      ref={refEmail}
                      id={id('email')}
                      type="email"
                      inputMode="email"
                      spellCheck={false}
                      autoCapitalize="none"
                      value={datos.email}
                      onChange={(e) => cambiar('email', e.target.value)}
                      onBlur={() => salir('email')}
                      autoComplete="email"
                      placeholder="tu@email.com"
                      aria-invalid={mostrarError('email')}
                      aria-describedby={`${id('email')}-a ${id('email')}-s ${id('email')}-e`}
                      className={INPUT}
                    />
                    <IconoBien visible={bien('email') && !sugerencia} />
                  </div>
                  <p id={`${id('email')}-a`} className={cn(AYUDA, 'mt-1.5')}>Te mandaremos un código para comprobar que es tuyo.</p>
                  {/* Solo SUGIERE: el email no se cambia sin que ella lo pida. */}
                  <div id={`${id('email')}-s`} aria-live="polite">
                    {sugerencia && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-[12px] bg-t-info-bg px-3 py-[9px] text-[13px] leading-[18px] text-t-primary">
                        <Info className="h-[15px] w-[15px] shrink-0 text-t-info" aria-hidden="true" />
                        <span>¿Querías decir <b className="[overflow-wrap:anywhere]">{sugerencia}</b>?</span>
                        <button
                          type="button"
                          onClick={() => { cambiar('email', sugerencia); refEmail.current?.focus(); }}
                          className={cn(ENLACE, 'text-[13px]')}
                        >
                          Sí, cámbialo
                        </button>
                      </div>
                    )}
                  </div>
                  <ErrorCampo id={`${id('email')}-e`} texto={mostrarError('email') ? errores.email : ''} />
                </div>

                {/* ── Contraseña ── */}
                <div className="mt-[18px] min-w-0">
                  <label htmlFor={id('contrasena')} className={ETIQUETA}>Contraseña</label>
                  <div className="relative">
                    <input
                      ref={refContrasena}
                      id={id('contrasena')}
                      type={verContrasena ? 'text' : 'password'}
                      value={datos.contrasena}
                      onChange={(e) => cambiar('contrasena', e.target.value)}
                      onBlur={() => salir('contrasena')}
                      autoComplete="new-password"
                      placeholder="8 caracteres o más"
                      aria-invalid={mostrarError('contrasena')}
                      aria-describedby={`${id('contrasena')}-r ${id('contrasena')}-e`}
                      className={INPUT}
                    />
                    <button
                      type="button"
                      // Sin robarle el foco al campo: se sigue escribiendo, y no
                      // cuenta como «salir» (no salta la validación por mirar).
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setVerContrasena((v) => !v)}
                      aria-label={verContrasena ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                      aria-pressed={verContrasena}
                      className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-t-secondary hover:bg-t-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--t-border-focus)]"
                    >
                      {verContrasena ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                  <ul id={`${id('contrasena')}-r`} className="mt-2 grid gap-[5px]">
                    <Regla ok={reglas.largo}>8 caracteres o más</Regla>
                    <Regla ok={reglas.dificil}>Difícil de adivinar: ni 12345678 ni el nombre del estudio</Regla>
                  </ul>
                  <ErrorCampo id={`${id('contrasena')}-e`} texto={mostrarError('contrasena') ? errores.contrasena : ''} />
                </div>
              </>
            )}

            {/* Un solo sitio para lo que dice el servidor. */}
            <div aria-live="polite">
              {error && <p className="mt-[18px] rounded-[12px] bg-t-error-bg px-3.5 py-2.5 text-[13px] font-medium text-t-error">{error}</p>}
            </div>

            {/* Sin margen alrededor: el widget mide 0 px salvo que Cloudflare pida algo a mano. */}
            {captcha}

            {/* ⚠️ `onMouseDown` sin foco: si al pulsar el campo de antes perdiera
                el foco, su error aparecería en ese instante, el botón bajaría y el
                clic caería fuera (medido: el primer «Crear mi estudio» tras una
                contraseña corta no hacía nada). Pulsar ya valida todo y lleva el
                foco al primer campo con algo que arreglar. */}
            <button type="submit" onMouseDown={(e) => e.preventDefault()} disabled={enviando || montando} className={cn(BOTON_ALTA, 'mt-[18px]')}>
              {enviando || montando ? (
                <><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Creando tu estudio…</>
              ) : (
                <>Crear mi estudio <ArrowRight className="h-4 w-4" aria-hidden="true" /></>
              )}
            </button>
            <p className="mt-3 text-center text-[13px] leading-[18px] text-t-secondary">{lineaPlan}</p>
          </form>

          {/* Se abren aparte: lo escrito sigue aquí (la contraseña no se guarda en ningún sitio). */}
          <p className="mt-[18px] text-[12.5px] leading-[18px] text-t-tertiary">
            Al crear tu estudio aceptas las{' '}
            <a href="/terminos" target="_blank" rel="noopener noreferrer" className="text-t-link underline underline-offset-2">condiciones de uso</a>{' '}
            y la{' '}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="text-t-link underline underline-offset-2">política de privacidad</a>.
          </p>
          {!conSesion && (
            <p className="mt-3.5 text-[14px] text-t-secondary">
              ¿Ya tienes cuenta? <Link href="/login" className="text-t-link underline underline-offset-2">Entrar</Link>
            </p>
          )}
        </div>

        <VistaPrevia nombre={nombreVisible} slug={slug} />
      </main>
    </Marco>
  );
}

// ── Lo que no es estado ─────────────────────────────────────────────────────

/** La etiqueta del botón de la web que la trajo (`CLAVE_ORIGEN_ALTA`). La normaliza `metadataDelAlta`. */
function leerLlegada(): string | null {
  try { return window.sessionStorage.getItem(CLAVE_ORIGEN_ALTA); } catch { return null; }
}

/** Pide «Tu cuenta está activa» (app/api/alta/estudio-creado). Nunca espera ni falla. */
function pedirCorreoCuentaActiva(): void {
  void (async () => {
    try {
      const cabecera = await authHeader();
      if (!('Authorization' in cabecera)) return;
      await fetch('/api/alta/estudio-creado', { method: 'POST', headers: cabecera, keepalive: true });
    } catch { /* best-effort */ }
  })();
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const TITULO = 'mt-2 text-[26px] font-semibold leading-[31px] tracking-[-0.02em] text-t-primary outline-none sm:text-[31px] sm:leading-9';
const SUBTITULO = 'mt-2.5 max-w-[48ch] text-[16px] leading-[25px] text-t-secondary';
const ETIQUETA = 'mb-1.5 block text-[13px] font-medium leading-[18px] text-t-primary';
const AYUDA = 'text-[13px] leading-[18px] text-t-tertiary';
// 16 px en el móvil: con menos, Safari de iPhone hace zoom al tocar el campo.
const INPUT = [
  'h-11 w-full appearance-none rounded-full border-[1.5px] border-transparent bg-t-sunken pl-[18px] pr-[46px]',
  'text-[16px] text-t-primary placeholder:text-t-tertiary sm:text-[15px]',
  'transition-[border-color,background-color,box-shadow] duration-150 motion-reduce:transition-none',
  'hover:border-[color:var(--t-border-default)]',
  'focus:border-[color:var(--t-border-focus)] focus:bg-t-raised focus:outline-none',
  'focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--t-border-focus)_22%,transparent)]',
  'aria-[invalid=true]:border-[color:var(--t-error-fg)]',
].join(' ');
const ENLACE = 'inline-flex items-center gap-1 font-medium text-t-link underline decoration-1 underline-offset-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--t-border-focus)]';
const BOTON_BASE = 'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-[22px] text-[15px] font-medium transition-[filter,background-color] duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--t-border-focus)] disabled:cursor-not-allowed disabled:opacity-60';
// La llamada del alta va en magenta (la maqueta): blanco sobre Magenta 500 da 4,7:1.
const BOTON_ALTA = `${BOTON_BASE} w-full bg-t-magenta text-white hover:bg-[var(--t-magenta-700)]`;
const BOTON_PRINCIPAL = `${BOTON_BASE} bg-t-inverse text-t-on-inverse hover:brightness-110`;

function Marco({ children, whatsapp }: { children: React.ReactNode; whatsapp?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-t-canvas text-t-primary">
      <header className="flex items-center justify-between gap-3 px-[18px] py-2.5 sm:px-8 sm:py-[18px]">
        <Link href="/" aria-label="Volver a la portada de Tentare" className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--t-border-focus)]">
          <LogoTentare alto={20} tinta="auto" />
        </Link>
        {/* Una persona por WhatsApp, a la vista en todo el alta (decisión 5). */}
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 items-center gap-2.5 rounded-full bg-t-raised py-1.5 pl-3 pr-4 text-[13px] font-medium leading-[17px] text-t-primary shadow-t-card transition-colors hover:bg-t-sunken sm:text-[14px]"
        >
          <MessageCircle className="h-4 w-4 shrink-0 text-t-success sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
          <span>
            ¿Dudas? Escríbenos
            <small className="hidden text-[12px] font-normal leading-[15px] text-t-tertiary sm:block">Te responde una persona</small>
          </span>
        </a>
      </header>
      {children}
    </div>
  );
}

function Columna({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-[480px] px-[18px] pb-8 pt-1 sm:px-6 sm:pb-14 sm:pt-4">{children}</main>;
}

function IconoGrande({ children, ok = false }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-7 grid h-[52px] w-[52px] place-items-center rounded-[16px]',
        ok ? 'bg-t-success-bg text-t-success' : 'bg-t-raised text-t-primary shadow-t-card',
      )}
    >
      {children}
    </span>
  );
}

function IconoBien({ visible }: { visible: boolean }) {
  return (
    <Check
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-t-success transition-[opacity,transform] duration-200 motion-reduce:transition-none',
        visible ? 'scale-100 opacity-100' : 'scale-75 opacity-0',
      )}
    />
  );
}

/** El aviso de un campo: el contenedor está siempre (para que se anuncie); el texto, solo si lo hay. */
function ErrorCampo({ id, texto }: { id: string; texto: string }) {
  return (
    <div id={id} aria-live="polite">
      {texto && <p className="mt-1.5 text-[13px] font-medium leading-[18px] text-t-error">{texto}</p>}
    </div>
  );
}

function Regla({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-2 text-[13px] leading-[18px] transition-colors', ok ? 'text-t-primary' : 'text-t-tertiary')}>
      <span
        aria-hidden="true"
        className={cn(
          'grid h-4 w-4 shrink-0 place-items-center rounded-full',
          ok ? 'bg-t-success text-t-raised' : 'shadow-[inset_0_0_0_1.5px_var(--t-border-default)]',
        )}
      >
        {ok && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </span>
      {children}
      <span className="sr-only">{ok ? ' (cumplido)' : ' (pendiente)'}</span>
    </li>
  );
}

/** La línea de la ruta: lo hecho en sólido, lo que queda en punteado y el paso de ahora en magenta. */
function LineaDePasos({ actual }: { actual: number }) {
  const n = PASOS_RUTA.length;
  const progreso = (actual - 1) / (n - 1);
  return (
    <ol aria-label={`Los ${n} pasos para abrir tu estudio`} className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
      <span aria-hidden="true" className="absolute left-[5px] top-[5px] border-t-[1.5px] border-dashed border-[color:var(--t-text-disabled)]" style={{ right: `calc(100% / ${n} - 5px)` }} />
      <span
        aria-hidden="true"
        className="absolute left-[5px] top-1 h-[3px] rounded-[2px] transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `calc((100% - 100% / ${n}) * ${progreso})`, background: 'var(--t-gradient-progress)' }}
      />
      {PASOS_RUTA.map(([num, nombre, obligatorio], i) => {
        const estado = i + 1 < actual ? 'hecho' : i + 1 === actual ? 'ahora' : 'pendiente';
        return (
          <li key={num} aria-current={estado === 'ahora' ? 'step' : undefined} className="relative grid min-w-0 gap-px pt-[18px] sm:pt-5">
            <span
              aria-hidden="true"
              className={cn(
                'absolute z-[1] grid place-items-center rounded-full',
                estado === 'hecho' && '-left-px -top-px h-3.5 w-3.5 bg-t-primary text-t-canvas',
                estado === 'ahora' && 'left-0 top-0 h-[11px] w-[11px] bg-t-attention shadow-[0_0_0_4px_color-mix(in_srgb,var(--t-attention)_20%,transparent)]',
                estado === 'pendiente' && 'left-0 top-0 h-[11px] w-[11px] bg-t-canvas shadow-[inset_0_0_0_1.5px_var(--t-text-disabled)]',
              )}
            >
              {estado === 'hecho' && <Check className="h-[9px] w-[9px]" strokeWidth={3.2} />}
            </span>
            <span aria-hidden="true" className="font-t-mono text-[11px] leading-[14px] tracking-[0.06em] text-t-tertiary">{num}</span>
            <span aria-hidden="true" className={cn('hidden truncate text-[12px] leading-4 sm:block', estado === 'ahora' ? 'font-semibold text-t-primary' : estado === 'hecho' ? 'font-medium text-t-primary' : 'font-medium text-t-secondary')}>
              {nombre}
            </span>
            {!obligatorio && <span aria-hidden="true" className="hidden font-t-mono text-[11px] leading-[14px] text-t-tertiary sm:block">opcional</span>}
            <span className="sr-only">{`Paso ${i + 1}: ${nombre}${obligatorio ? '' : ' (opcional)'}, ${estado === 'hecho' ? 'hecho' : estado === 'ahora' ? 'ahora' : 'pendiente'}`}</span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * «Así empieza la app de tus alumnas»: la app de verdad, la pantalla con la que
 * la recibe a una alumna al abrir su enlace, en un iPhone 17 Pro y con el nombre
 * que va escribiendo (components/alta-nueva/app-de-muestra.tsx). Su estudio aún
 * no existe: es el estudio tal como nacerá, sin nada inventado encima.
 */
function VistaPrevia({ nombre, slug }: { nombre: string; slug: string }) {
  // Que el teléfono quepa entero (con la isla y el indicador) en la altura de la ventana.
  const escala = useEscalaIphone(0.66, 300);
  return (
    <aside
      aria-label="Vista previa de la app de tus alumnas"
      className="flex min-w-0 flex-col items-center gap-[18px] self-start rounded-[20px] bg-t-sunken p-5 text-center lg:sticky lg:top-6 lg:rounded-[24px] lg:p-8"
    >
      <p className="t-label -mb-1 text-t-tertiary">Así empieza la app de tus alumnas</p>
      <AppDeMuestra nombre={nombre} escala={escala} />
      <p className="max-w-full truncate rounded-full bg-t-raised px-3 py-1.5 font-t-mono text-[12px] leading-4 text-t-secondary shadow-t-card" data-testid="enlace-app-prevista">
        tentare.app/portal/{slug}
      </p>
      <p className="max-w-[300px] text-[12.5px] leading-[18px] text-t-tertiary">
        Es tu app de verdad: lo primero que ve una alumna al abrir tu enlace. Tu logo y tu color los eliges en el paso 5;
        la foto es una de serie hasta que subas la tuya en Apariencia.
      </p>
      <ul className="grid max-w-[300px] gap-2 text-left">
        {['Tu app existe desde que creas tu estudio', 'Tus alumnas entran desde el móvil, sin descargarse nada', 'Si te atascas, te ayuda una persona'].map((v) => (
          <li key={v} className="flex gap-2.5 text-[14px] leading-5 text-t-secondary">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-t-success" aria-hidden="true" />
            {v}
          </li>
        ))}
      </ul>
    </aside>
  );
}
