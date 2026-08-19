'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Loader2, Mail, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/db/supabase';
import { dbCreateStudio, setCurrentStudioId } from '@/lib/supabase-data';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { SelectorPlan } from '@/components/planes/selector-plan';
import { HojaComparativa } from '@/components/planes/comparativa-planes';
import { TRIAL_DIAS } from '@/lib/billing/trial';
import { type Plan } from '@/lib/billing/entitlements';
import {
  BORRADOR_ALTA,
  leerBorrador,
  guardarBorrador,
  olvidarBorrador,
  validarPaso,
  type BorradorAlta,
} from '@/lib/alta/borrador';

// ─────────────────────────────────────────────────────────────────────────────
// Alta pública de un estudio. Tres pasos, prueba de 7 días y sin tarjeta.
//
// Esta pantalla estuvo ~5 meses siendo un formulario de lista de espera («deja
// tu email y te avisamos») porque Tentare no estaba abierto. Vuelve a dar de
// alta un estudio de verdad; el camino de creación (`dbCreateStudio` +
// `pending_studio` en app/login) nunca se llegó a borrar, solo dejó de
// dispararse desde aquí.
//
// ⚠️ ORDEN DE LOS PASOS: estudio → plan → cuenta, y no cuenta primero. No es
// una preferencia estética, lo obliga la arquitectura: si el proyecto exige
// confirmar el email, tras `signUp()` NO hay sesión, así que no hay forma de
// escribir en `studios` hasta que la persona vuelve del enlace del correo —
// puede que horas después y desde otro móvil. Por eso el estudio y el plan
// viajan como metadata del propio usuario (`pending_studio`), y para poder
// viajar ahí tienen que estar recogidos ANTES del alta. Recogerlos después
// obligaría a inventar un almacén intermedio para datos a medio confirmar.
// De regalo, es también el orden de menos fricción: se pide la contraseña
// cuando ya se ha invertido algo, no en la primera pantalla.
// ─────────────────────────────────────────────────────────────────────────────

type Fase = 'formulario' | 'confirmar-email' | 'listo';

const PASOS = [
  { n: 1, titulo: 'Tu estudio', sub: 'Cómo se llama' },
  { n: 2, titulo: 'Tu plan', sub: 'Lo pruebas gratis' },
  { n: 3, titulo: 'Tu cuenta', sub: 'Para entrar' },
] as const;

export default function CrearEstudioPage() {
  const uid = useId();
  const { signUp } = useAuth();
  const { widget: captcha, pedirToken } = useCaptcha();

  const [paso, setPaso] = useState(1);
  const [datos, setDatos] = useState<BorradorAlta>(BORRADOR_ALTA);
  const [fase, setFase] = useState<Fase>('formulario');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [tocado, setTocado] = useState(false);
  const [comparativaAbierta, setComparativaAbierta] = useState(false);
  const [slugCreado, setSlugCreado] = useState<string | null>(null);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const yaMontado = useRef(false);

  // ── Recuperar lo que dejó a medias ───────────────────────────────────────
  // Cerrar la pestaña a mitad del alta y volver es de los abandonos más
  // comunes que hay. Sin esto, volver significa empezar de cero.
  //
  // ⚠️ La contraseña NUNCA se guarda (ver lib/alta/borrador.ts): dejar una
  // contraseña en localStorage la deja legible para cualquier script de la
  // página y para quien use el mismo ordenador después.
  //
  // El `setState` va dentro del efecto a propósito, y no en un inicializador
  // perezoso de `useState`: `leerBorrador()` toca `localStorage`, que en el
  // servidor no existe. Inicializar con él daría un HTML de servidor (borrador
  // vacío) distinto del primer render de cliente (borrador recuperado), que es
  // justo lo que React marca como desajuste de hidratación. Restaurar TIENE que
  // pasar después de montar. Mismo patrón, y mismo `disable`, que el resto de
  // pantallas del repo que rehidratan desde disco (portal/acceso, interno/*).
  useEffect(() => {
    const guardado = leerBorrador();
    if (!guardado) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDatos((d) => ({ ...d, ...guardado, contrasena: '' }));
    setBorradorRecuperado(true);
  }, []);

  // Guarda a medida que escribe. `yaMontado` evita que el primer render
  // (con el borrador aún vacío) pise lo que acabamos de recuperar.
  useEffect(() => {
    if (!yaMontado.current) { yaMontado.current = true; return; }
    if (fase === 'formulario') guardarBorrador(datos);
  }, [datos, fase]);

  // Al cambiar de paso, el foco va al titular. Sin esto, quien navega con
  // teclado o lector de pantalla pulsa «Continuar» y el foco se queda en un
  // botón que ya no existe: se cae al principio del documento y no se anuncia
  // nada, así que el cambio de paso es invisible.
  useEffect(() => {
    if (fase === 'formulario') tituloRef.current?.focus();
  }, [paso, fase]);

  const problema = validarPaso(paso, datos);
  const puedeSeguir = problema === null;

  function siguiente() {
    setTocado(true);
    if (!puedeSeguir) return;
    setTocado(false);
    setError('');
    setPaso((p) => Math.min(3, p + 1));
  }

  function atras() {
    setTocado(false);
    setError('');
    setPaso((p) => Math.max(1, p - 1));
  }

  async function crear() {
    setTocado(true);
    if (!puedeSeguir || enviando) return;
    setError('');
    // El estado de carga se enciende ANTES de pedir el token: Turnstile tarda
    // entre 3 y 7 segundos en emitirlo, y sin esto el botón se queda inerte
    // todo ese rato y la gente lo vuelve a pulsar (bug real de #843).
    setEnviando(true);

    try {
      const token = await pedirToken();
      if (token === null) { setError(ERROR_CAPTCHA); return; }

      // Lo que necesita `dbCreateStudio` cuando haya sesión. Viaja como
      // metadata del usuario para sobrevivir al rebote del email.
      const pendiente = {
        nombre: datos.estudio.trim(),
        ciudad: datos.ciudad.trim(),
        plan: datos.plan,
        comoNosConocio: datos.comoNosConocio || undefined,
      };

      const { error: errorAlta, needsConfirmation, yaRegistrado } = await signUp(
        datos.email.trim(),
        datos.contrasena,
        { nombre: datos.persona.trim(), pending_studio: pendiente },
        token ?? undefined,
      );

      if (yaRegistrado) {
        // gotrue responde 200 con un usuario fantasma cuando el email YA tiene
        // cuenta confirmada (para no dejar enumerar emails). Decir «revisa tu
        // correo» aquí sería mentir: no se ha enviado nada.
        setError('Ya hay una cuenta con este email. Inicia sesión y podrás seguir desde donde lo dejaste.');
        return;
      }
      if (errorAlta) { setError(errorAlta); return; }

      if (needsConfirmation) {
        // El estudio se creará en /login al volver del enlace del correo.
        // El borrador se conserva a propósito hasta entonces.
        setFase('confirmar-email');
        return;
      }

      // Confirmación de email desactivada: ya hay sesión, se crea ahora.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Tu cuenta se ha creado, pero no hemos podido abrir la sesión. Entra desde «Iniciar sesión».');
        return;
      }
      const estudio = await dbCreateStudio({ ...pendiente, ownerAuthUserId: user.id });
      if (!estudio) {
        // La cuenta SÍ existe. No se pierde nada: `pending_studio` sigue en la
        // metadata, así que el próximo login lo reintenta solo (dbCreateStudio
        // es idempotente por su id determinista).
        setError('Tu cuenta está creada, pero no hemos podido montar el estudio. Vuelve a entrar en un minuto y lo terminamos.');
        return;
      }
      setCurrentStudioId(estudio.id);
      setSlugCreado(estudio.slug);
      olvidarBorrador();
      setFase('listo');
    } catch {
      setError('No hemos podido crear tu estudio. Revisa tu conexión e inténtalo otra vez.');
    } finally {
      setEnviando(false);
    }
  }

  // ── Pantallas finales ────────────────────────────────────────────────────
  if (fase === 'confirmar-email') {
    return (
      <Marco>
        <div className="text-center">
          <IconoGrande><Mail size={22} aria-hidden="true" /></IconoGrande>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-tight text-foreground">Confirma tu email</h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
            Te hemos enviado un enlace a <strong className="text-foreground">{datos.email}</strong>. En cuanto lo
            abras, montamos <strong className="text-foreground">{datos.estudio}</strong> y empiezan tus {TRIAL_DIAS} días
            de prueba.
          </p>
          <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            Puedes abrirlo desde el móvil aunque hayas empezado aquí: tus datos van con tu cuenta, no con este
            navegador.
          </p>
          <Link href="/login" className="mt-5 inline-block text-[14px] font-semibold text-brand-medio hover:underline">
            Ir a iniciar sesión
          </Link>
        </div>
      </Marco>
    );
  }

  if (fase === 'listo') {
    return (
      <Marco>
        <div className="text-center">
          <IconoGrande><Check size={22} strokeWidth={3} aria-hidden="true" /></IconoGrande>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-tight text-foreground">
            {datos.estudio} ya está en marcha
          </h1>
          <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">
            Tienes {TRIAL_DIAS} días de prueba con todo abierto. No hemos pedido tarjeta y no se te va a cobrar nada.
          </p>
          {slugCreado && (
            <p className="mt-4 rounded-xl bg-muted px-4 py-3 text-[13px] text-muted-foreground">
              La dirección de tus alumnas será{' '}
              <span className="font-semibold text-foreground">tentare.app/{slugCreado}</span>
            </p>
          )}
          <a
            href="/dashboard"
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-bold text-brand-foreground transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            Entrar en mi estudio <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </Marco>
    );
  }

  // ── El formulario ────────────────────────────────────────────────────────
  const pasoActual = PASOS[paso - 1];

  return (
    <Marco ancho={paso === 2}>
      {/* Progreso. Es un <ol> con aria-current: un lector de pantalla anuncia
          «paso 2 de 3, Tu plan» en vez de leer tres puntos de adorno. */}
      <ol className="mb-6 flex items-center gap-1.5" aria-label={`Paso ${paso} de ${PASOS.length}`}>
        {PASOS.map((p) => {
          const hecho = p.n < paso;
          const activo = p.n === paso;
          return (
            <li key={p.n} className="flex-1" aria-current={activo ? 'step' : undefined}>
              <span className="sr-only">{`Paso ${p.n}: ${p.titulo}${hecho ? ' (completado)' : ''}`}</span>
              <span
                aria-hidden="true"
                className={`block h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                  hecho ? 'bg-brand/45' : activo ? 'bg-brand' : 'bg-border'
                }`}
              />
            </li>
          );
        })}
      </ol>

      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1
            ref={tituloRef}
            tabIndex={-1}
            className="text-[21px] font-extrabold leading-tight tracking-tight text-foreground outline-none sm:text-[24px]"
          >
            {pasoActual.titulo}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{pasoActual.sub}</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold tabular-nums text-accent-foreground">
          {paso}/{PASOS.length}
        </span>
      </div>

      {borradorRecuperado && paso === 1 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-brand/25 bg-brand/[0.06] px-3.5 py-2.5 text-[12.5px] leading-snug text-foreground">
          <RotateCcw size={14} aria-hidden="true" className="mt-px shrink-0 text-brand-medio" />
          Hemos recuperado lo que habías dejado a medias.
        </p>
      )}

      {/* `key={paso}`: al cambiar de paso React monta un bloque nuevo y la
          animación de entrada se vuelve a disparar. Sin la key, es el mismo
          nodo con otro contenido y no se anima nada. */}
      <div key={paso} className="animate-[portal-rise-soft_.28s_cubic-bezier(.16,1,.3,1)_both] motion-reduce:animate-none">
        {paso === 1 && (
          <div className="space-y-4">
            <Campo
              id={`${uid}-estudio`}
              etiqueta="Nombre de tu estudio"
              valor={datos.estudio}
              onCambio={(v) => setDatos({ ...datos, estudio: v })}
              placeholder="Ej. Estudio Tentare"
              autoFocus
              autoComplete="organization"
              ayuda="Es el nombre que verán tus alumnas."
            />
            <Campo
              id={`${uid}-ciudad`}
              etiqueta="Ciudad"
              opcional
              valor={datos.ciudad}
              onCambio={(v) => setDatos({ ...datos, ciudad: v })}
              placeholder="Ej. Madrid"
              autoComplete="address-level2"
            />
          </div>
        )}

        {paso === 2 && (
          <div>
            <SelectorPlan valor={datos.plan} onCambio={(p) => setDatos({ ...datos, plan: p })} enPrueba />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setComparativaAbierta(true)}
                className="text-[13.5px] font-semibold text-brand-medio underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Ver todo lo que incluye cada plan
              </button>
              <span className="text-[12.5px] text-muted-foreground">Puedes cambiar de plan cuando quieras.</span>
            </div>
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            <Campo
              id={`${uid}-persona`}
              etiqueta="Tu nombre"
              valor={datos.persona}
              onCambio={(v) => setDatos({ ...datos, persona: v })}
              placeholder="Ej. María García"
              autoFocus
              autoComplete="name"
            />
            <Campo
              id={`${uid}-email`}
              etiqueta="Email"
              tipo="email"
              valor={datos.email}
              onCambio={(v) => setDatos({ ...datos, email: v })}
              placeholder="maria@miestudio.com"
              autoComplete="email"
            />
            <Campo
              id={`${uid}-clave`}
              etiqueta="Contraseña"
              tipo="password"
              valor={datos.contrasena}
              onCambio={(v) => setDatos({ ...datos, contrasena: v })}
              autoComplete="new-password"
              ayuda="Mínimo 8 caracteres."
            />

            {/* ⚠️ Aquí NO va campo trampa (honeypot), y es deliberado. El
                honeypot solo sirve si alguien lo COMPRUEBA en el servidor, y su
                único comprobador era `/api/public/interes-lanzamiento`, que se
                ha borrado con la lista de espera. Este alta no pasa por ningún
                endpoint propio: va directa a gotrue, que verifica el token de
                Turnstile a nivel de PROYECTO — esa sí es una defensa real y
                activa. Pintar aquí un campo que nadie lee sería exactamente el
                bug de #847 otra vez: algo que parece proteger y no protege. */}
          </div>
        )}
      </div>

      {/* Un solo sitio para lo que va mal, y con aria-live: si el mensaje solo
          se pinta, quien usa lector de pantalla pulsa el botón y no se entera
          de que ha fallado nada. */}
      <div aria-live="polite" className="mt-4 empty:mt-0">
        {tocado && problema && (
          <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-[13px] font-medium text-warning">{problema}</p>
        )}
        {error && (
          <p className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-[13px] font-medium text-destructive">{error}</p>
        )}
      </div>

      {/* Sin margen alrededor: el widget mide 0 px salvo que Cloudflare pida
          resolver algo a mano, y un margen fijo dejaría un hueco permanente. */}
      {captcha}

      <div className="mt-5 flex items-center gap-2.5">
        {paso > 1 && (
          <button
            type="button"
            onClick={atras}
            disabled={enviando}
            className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-3 text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ArrowLeft size={15} aria-hidden="true" /> Atrás
          </button>
        )}
        <button
          type="button"
          onClick={paso === 3 ? crear : siguiente}
          disabled={enviando}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3.5 text-[15px] font-bold text-brand-foreground transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
        >
          {enviando ? (
            <>
              <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Creando tu estudio…
            </>
          ) : paso === 3 ? (
            <>Empezar mis {TRIAL_DIAS} días gratis</>
          ) : (
            <>Continuar <ArrowRight size={16} aria-hidden="true" /></>
          )}
        </button>
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
        <ShieldCheck size={13} aria-hidden="true" className="shrink-0" />
        Sin tarjeta de crédito · Sin permanencia
      </p>

      <p className="mt-4 text-center text-[13px] text-muted-foreground">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-semibold text-brand-medio hover:underline">Inicia sesión</Link>
      </p>

      <HojaComparativa
        abierta={comparativaAbierta}
        onCerrar={() => setComparativaAbierta(false)}
        destacado={datos.plan as Plan}
      />
    </Marco>
  );
}

// ── Piezas de la pantalla ───────────────────────────────────────────────────

function Marco({ children, ancho = false }: { children: React.ReactNode; ancho?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background px-4 py-8 sm:justify-center sm:py-12">
      <div className={`mx-auto w-full ${ancho ? 'max-w-2xl' : 'max-w-md'} transition-[max-width] duration-300 motion-reduce:transition-none`}>
        <Link href="/" className="mb-6 flex justify-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" aria-label="Volver a la portada de Tentare">
          <LogoTentare alto={30} tinta="auto" />
        </Link>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_20px_50px_-30px_rgba(26,26,26,.45)] sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}

function IconoGrande({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-brand-foreground">
      {children}
    </div>
  );
}

function Campo({
  id, etiqueta, valor, onCambio, placeholder, tipo = 'text', ayuda, opcional, autoFocus, autoComplete,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (v: string) => void;
  placeholder?: string;
  tipo?: string;
  ayuda?: string;
  opcional?: boolean;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const ayudaId = `${id}-ayuda`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-foreground">
        {etiqueta}
        {opcional && <span className="ml-1 font-normal text-muted-foreground">{' '}(opcional)</span>}
      </label>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        aria-describedby={ayuda ? ayudaId : undefined}
        className="w-full rounded-xl border border-input bg-background px-3.5 py-3 text-[15px] text-foreground transition-colors placeholder:text-muted-foreground/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15 motion-reduce:transition-none"
      />
      {ayuda && <p id={ayudaId} className="mt-1.5 text-[12px] text-muted-foreground">{ayuda}</p>}
    </div>
  );
}
