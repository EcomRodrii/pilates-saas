'use client';

// ─────────────────────────────────────────────────────────────────────────────
// El asistente de bienvenida: TRES pantallas, en vez de once preguntas.
//
//   1 · Tu estudio      — tres datos de perfil (siguen siendo la única forma de
//                         saber de qué software llega cada estudio).
//   2 · Tus clases      — clases, salas, plazas y duración, con lo más común ya
//                         marcado. Con solo «Continuar» el estudio queda montado.
//   3 · Antes de entrar — cobro, prioridad y cómo prefiere que la ayudemos
//                         (incluida «Prefiero que me llamen» con su teléfono).
//                         Todo opcional: se salta con un toque.
//
// A la derecha (o arriba, en el móvil) se ve SU app tomando forma y la guía
// rápida con su progreso real. Al terminar, `onTerminado` entrega las respuestas
// y el lado servidor ya ha creado salas, clases y borradores (§8,
// lib/onboarding/plan-configuracion.ts). Las respuestas son las mismas claves de
// siempre: nada de lo que se preguntaba se ha perdido, solo se ha juntado.
//
// Sin motor de tecleo, sin audio, sin requestAnimationFrame: React normal. Una
// pantalla con formularios no necesita pintar 60 fps para nada.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { authHeader } from '@/lib/api-client';
import { capturarEvento } from '@/lib/posthog-cliente';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { useStudio } from '@/lib/studio-context';
import type { Studio } from '@/lib/types';
import {
  OPCIONES_AFORO, OPCIONES_COBRO, OPCIONES_DURACION, OPCIONES_HORARIO, OPCIONES_IMPARTE, OPCIONES_SALAS,
  TIPOS_CLASE_SUGERIDOS, interpretarRespuestasWizard, planificarConfiguracion, planVacio,
} from '@/lib/onboarding/plan-configuracion';
import {
  OPCIONES_ALUMNOS, OPCIONES_CENTROS, OPCIONES_FOCO, OPCIONES_SOFTWARE, PANTALLAS,
  alinearAforos, camposOnb, numSalasDe, sanearBorrador, vieneDeOtraPlataforma,
} from '@/lib/onboarding/asistente-rapido';
import { guardarProgresoWizard, leerProgresoWizard, type RespuestasWizard } from '@/lib/onboarding/borrador-wizard';
import { alternarSeleccion } from '@/lib/onboarding/seleccion-multiple';
import { eventoAlLlegar } from '@/lib/onboarding/embudo-wizard';
import { AYUDA_LLAMADA, AYUDA_POR_MI, OPCIONES_AYUDA } from '@/lib/llamada/solicitud';
import { CampoLlamada, LLAMADA_VACIA, errorLlamada, type DatosLlamada } from './campo-llamada';
import { GuiaRapidaLista, useGuiaRapida } from './guia-rapida-lista';
import { MarcaCompacta, useColorMarca } from './vista-previa-app';
import { AppAlumnaReal } from './app-alumna-real';

export interface ResultadoConfigurar { tiposClase: number; salas: number }

const OPCIONES_COBRO_LISTA = [...OPCIONES_COBRO];
const TOPE_CLASES = 6;

/** Chips accesibles: una opción (radio) o varias con tope (pulsado). */
function Chips({
  legend, nota, opciones, valor, multi, onCambio, onTope,
}: {
  legend: string;
  nota?: string;
  opciones: readonly string[];
  valor: string | readonly string[] | undefined;
  /** Con número: varias opciones hasta ese tope. Sin él: una sola. */
  multi?: number;
  onCambio: (v: string | string[]) => void;
  onTope?: () => void;
}) {
  const id = useId();
  const marcadas = Array.isArray(valor) ? (valor as readonly string[]) : valor ? [valor as string] : [];
  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-labelledby={`${id}-l`} className="mt-5 first:mt-0">
      <p id={`${id}-l`} className="text-[14px] font-semibold text-foreground">{legend}</p>
      {nota && <p className="mt-0.5 text-[12.5px] text-muted-foreground">{nota}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {opciones.map((o) => {
          const activa = marcadas.includes(o);
          const llena = !!multi && marcadas.length >= multi && !activa;
          return (
            <button
              key={o}
              type="button"
              {...(multi ? { 'aria-pressed': activa } : { role: 'radio', 'aria-checked': activa })}
              onClick={() => {
                if (multi) {
                  const r = alternarSeleccion(marcadas, o, multi);
                  if (r.topeAlcanzado) { onTope?.(); return; }
                  onCambio(r.seleccion);
                } else {
                  // Tocar la que está marcada la quita: así lo opcional (horario,
                  // «das clases tú») se puede dejar sin contestar otra vez.
                  onCambio(activa ? '' : o);
                }
              }}
              className={`min-h-11 rounded-xl border px-3.5 text-[14px] font-medium transition-colors ${
                activa
                  ? 'border-brand-medio bg-brand-medio text-white'
                  : `border-border bg-card text-foreground hover:bg-muted ${llena ? 'opacity-45' : ''}`
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Desplegable({
  etiqueta, opciones, valor, onCambio,
}: { etiqueta: string; opciones: readonly string[]; valor: string | undefined; onCambio: (v: string) => void }) {
  const id = useId();
  return (
    <div className="mt-4 first:mt-0">
      <label htmlFor={id} className="text-[14px] font-semibold text-foreground">{etiqueta}</label>
      <select
        id={id}
        value={valor ?? ''}
        onChange={(e) => onCambio(e.target.value)}
        className="mt-1.5 h-12 w-full rounded-xl border border-border bg-card px-3 text-base text-foreground"
      >
        <option value="">Prefiero no decirlo</option>
        {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

export function AsistenteRapido({
  studio, onTerminado, onSaltar,
}: {
  studio: Studio;
  onTerminado: (ans: RespuestasWizard, creado: ResultadoConfigurar) => void;
  /** «Configurar luego»: sella y lleva al calendario, sin respuestas. */
  onSaltar: () => Promise<boolean>;
}) {
  const { updateStudio } = useStudio();
  const [i, setI] = useState(() => {
    const g = typeof window === 'undefined' ? null : leerProgresoWizard(studio.id);
    return g ? Math.min(g.paso, PANTALLAS.length - 1) : 0;
  });
  const [ans, setAns] = useState<RespuestasWizard>(() => {
    const g = typeof window === 'undefined' ? null : leerProgresoWizard(studio.id);
    return sanearBorrador(g?.ans ?? {});
  });
  const [llamada, setLlamada] = useState<DatosLlamada>(LLAMADA_VACIA);
  const [intentoLlamada, setIntentoLlamada] = useState(false);
  const [errorLlamadaServidor, setErrorLlamadaServidor] = useState<string | null>(null);
  const [errorFin, setErrorFin] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [avisoTope, setAvisoTope] = useState(false);
  // Las clases se crean al confirmar la pantalla 2 (y no solo al final) para que
  // la app real que se ve al lado las tenga. `version` recarga esa app.
  const creadoRef = useRef<ResultadoConfigurar>({ tiposClase: 0, salas: 0 });
  const [creadoAhora, setCreadoAhora] = useState<ResultadoConfigurar>({ tiposClase: 0, salas: 0 });
  const [versionApp, setVersionApp] = useState(0);
  const [verApp, setVerApp] = useState(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const vistas = useRef(new Set<string>());
  const guia = useGuiaRapida(creadoAhora);
  const colorMarca = useColorMarca();

  const pantalla = PANTALLAS[i];
  const guardar = useCallback((siguiente: RespuestasWizard, paso = i) => {
    setAns(siguiente);
    guardarProgresoWizard(studio.id, paso, siguiente);
  }, [studio.id, i]);

  // Embudo: un evento por pantalla, la primera vez que se llega.
  useEffect(() => {
    const ev = eventoAlLlegar(vistas.current, { fase: 'wizard', pasoId: pantalla.id, n: i + 1, total: PANTALLAS.length });
    if (ev) capturarEvento(ev.nombre, ev.props);
  }, [pantalla.id, i]);

  // El foco viaja al titular al cambiar de pantalla (teclado y lectores de pantalla).
  useEffect(() => { tituloRef.current?.focus(); }, [i]);

  const clasesElegidas = ans.clases ?? [];
  const nSalas = numSalasDe(ans);
  const preguntaLlamada = ans.ayuda === AYUDA_LLAMADA;
  const migrable = vieneDeOtraPlataforma(ans.software);

  const terminar = useCallback(async () => {
    if (trabajando) return;
    setErrorFin(null);
    setErrorLlamadaServidor(null);
    // 1 · La llamada primero: si el número no vale o el servidor dice que no, se
    // queda aquí con su error en vez de creer que la hemos pedido.
    if (ans.ayuda === AYUDA_LLAMADA) {
      setIntentoLlamada(true);
      if (errorLlamada(llamada)) { setI(PANTALLAS.length - 1); return; }
    }
    setTrabajando(true);
    try {
      if (ans.ayuda === AYUDA_LLAMADA) {
        let res: Response;
        try {
          res = await fetch('/api/onboarding/ayuda-alta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
            body: JSON.stringify({
              ayuda: ans.ayuda, software: ans.software ?? null,
              prefijo: llamada.prefijo, telefono: llamada.telefono,
              consentimiento: llamada.consentimiento, horaPreferida: llamada.hora,
            }),
          });
        } catch {
          setErrorLlamadaServidor('Sin conexión: no hemos podido guardar tu petición. Revisa tu red y vuelve a pulsar «Ver mi estudio».');
          return;
        }
        if (!res.ok) {
          const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
          setErrorLlamadaServidor(cuerpo?.error || 'No hemos podido guardar tu petición. Prueba otra vez.');
          return;
        }
      }

      // 2 · Respuestas del perfil y montaje del estudio, en paralelo.
      const operativa = interpretarRespuestasWizard(ans);
      const hayPlan = !planVacio(planificarConfiguracion(operativa));
      const [sellado, conf] = await Promise.all([
        updateStudio(camposOnb(ans)),
        hayPlan
          ? (async (): Promise<ResultadoConfigurar | null> => {
              try {
                const r = await fetch('/api/onboarding/configurar', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
                  body: JSON.stringify(operativa),
                });
                if (!r.ok) {
                  capturarExcepcion(new Error(`[onboarding/configurar] HTTP ${r.status}`), { tags: { area: 'onboarding' } });
                  return null;
                }
                const d = await r.json().catch(() => ({})) as { tiposClase?: number; salas?: number };
                return { tiposClase: d.tiposClase ?? 0, salas: d.salas ?? 0 };
              } catch (e) {
                capturarExcepcion(e instanceof Error ? e : new Error(String(e)), { tags: { area: 'onboarding' } });
                return null;
              }
            })()
          : Promise.resolve({ tiposClase: 0, salas: 0 } as ResultadoConfigurar | null),
      ]);
      if (!sellado.ok) {
        capturarExcepcion(new Error(sellado.error ?? 'No se pudieron guardar las respuestas del asistente'), { tags: { area: 'onboarding' } });
        setErrorFin('No hemos podido guardar tus respuestas. Vuelve a pulsar «Ver mi estudio».');
        return;
      }
      // «Configuradlo por mí» no tiene datos que validar: aviso al equipo sin esperar.
      if (ans.ayuda === AYUDA_POR_MI) {
        void (async () => {
          try {
            await fetch('/api/onboarding/ayuda-alta', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
              body: JSON.stringify({ ayuda: ans.ayuda, software: ans.software ?? null }),
            });
          } catch { /* best-effort: el equipo lo ve igualmente en /interno por la columna */ }
        })();
      }
      const fin = conf ?? { tiposClase: 0, salas: 0 };
      onTerminado(ans, {
        tiposClase: Math.max(fin.tiposClase, creadoRef.current.tiposClase),
        salas: Math.max(fin.salas, creadoRef.current.salas),
      });
    } finally {
      setTrabajando(false);
    }
  }, [ans, llamada, trabajando, updateStudio, onTerminado]);

  // Monta salas y clases al confirmar la pantalla 2: el servidor es idempotente
  // (por nombre), así que repetirlo al final no duplica nada. Fallo suave: la
  // app se queda como estaba y el montaje se reintenta al terminar.
  const crearClases = useCallback(async (respuestas: RespuestasWizard) => {
    const operativa = interpretarRespuestasWizard(respuestas);
    if (planVacio(planificarConfiguracion(operativa))) return;
    try {
      const r = await fetch('/api/onboarding/configurar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify(operativa),
      });
      if (!r.ok) { capturarExcepcion(new Error(`[onboarding/configurar] HTTP ${r.status}`), { tags: { area: 'onboarding' } }); return; }
      const d = await r.json().catch(() => ({})) as { tiposClase?: number; salas?: number };
      const nuevo = {
        tiposClase: Math.max(creadoRef.current.tiposClase, d.tiposClase ?? 0),
        salas: Math.max(creadoRef.current.salas, d.salas ?? 0),
      };
      creadoRef.current = nuevo;
      setCreadoAhora(nuevo);
      setVersionApp((v) => v + 1);
    } catch (e) {
      capturarExcepcion(e instanceof Error ? e : new Error(String(e)), { tags: { area: 'onboarding' } });
    }
  }, []);

  const avanzar = useCallback(() => {
    if (i >= PANTALLAS.length - 1) { void terminar(); return; }
    if (PANTALLAS[i].id === 'espacio') void crearClases(ans);
    const sig = i + 1;
    setI(sig);
    guardarProgresoWizard(studio.id, sig, ans);
  }, [i, terminar, crearClases, studio.id, ans]);

  const horarioEtiquetas = useMemo(() => OPCIONES_HORARIO.map((o) => o.label), []);

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-background font-sans text-foreground"
      data-screen="bienvenida"
      style={{ fontFamily: 'var(--font-jakarta), system-ui, sans-serif' }}
    >
      <style>{`
        @keyframes ob-entra { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .ob-entra { animation: ob-entra 320ms cubic-bezier(0.22,1,0.36,1) both; }
        @media (prefers-reduced-motion: reduce) { .ob-entra { animation: none; } }
      `}</style>

      <header className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-5 pb-2 pt-5 sm:px-8">
        <LogoTentare alto={24} tinta="auto" decorativo />
        <button
          type="button"
          onClick={() => { void onSaltar(); }}
          className="min-h-11 px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
        >
          Configurar luego
        </button>
      </header>

      <div className="mx-auto grid w-full max-w-[1040px] gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <main>
          {/* Progreso: tres tramos y la frase para quien no los ve. */}
          <div
            role="progressbar" aria-valuemin={1} aria-valuemax={PANTALLAS.length} aria-valuenow={i + 1}
            aria-label={`Paso ${i + 1} de ${PANTALLAS.length}: ${pantalla.etiqueta}`}
            className="flex gap-1.5"
          >
            {PANTALLAS.map((p, n) => (
              <span key={p.id} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${n <= i ? 'bg-brand-medio' : 'bg-muted'}`} />
            ))}
          </div>
          <p className="mt-2 text-[12.5px] font-semibold text-muted-foreground" aria-live="polite">
            Paso {i + 1} de {PANTALLAS.length} · {pantalla.etiqueta}
          </p>

          {/* En el móvil la app va arriba, pequeña, y la guía en una línea. */}
          <div className="mt-4 space-y-2 lg:hidden">
            <MarcaCompacta nombre={studio.nombre || 'Tu estudio'} logoUrl={studio.logoUrl} color={colorMarca} />
            <details className="rounded-2xl border border-border bg-card px-3.5 py-2" onToggle={(e) => setVerApp((e.currentTarget as HTMLDetailsElement).open)}>
              <summary className="flex min-h-11 cursor-pointer items-center text-[13.5px] font-semibold">Ver tu app de verdad</summary>
              {verApp && studio.slug && (
                <div className="pb-3 pt-1"><AppAlumnaReal slug={studio.slug} ancho={250} version={versionApp} /></div>
              )}
            </details>
            {guia && (
              <p className="px-1 text-[12.5px] text-muted-foreground" data-testid="guia-linea">
                <span className="font-semibold text-foreground">Guía rápida {guia.hechos} de {guia.total}</span>
                {guia.siguiente ? ` · te falta: ${guia.siguiente.label.toLowerCase()}` : ' · todo hecho'}
              </p>
            )}
          </div>

          <form
            key={pantalla.id}
            className="ob-entra mt-5"
            noValidate
            onSubmit={(e) => { e.preventDefault(); avanzar(); }}
          >
            {pantalla.id === 'estudio' && (
              <>
                <h1 ref={tituloRef} tabIndex={-1} className="text-[clamp(24px,4vw,32px)] font-bold leading-tight outline-none">
                  Cuéntanos de tu estudio
                </h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                  Tres datos rápidos. Si vienes de otra plataforma, traemos tus datos gratis.
                </p>
                <div className="mt-6">
                  <Desplegable etiqueta="¿Con qué lo llevas ahora?" opciones={OPCIONES_SOFTWARE} valor={ans.software}
                    onCambio={(v) => guardar({ ...ans, software: v || undefined })} />
                  <Desplegable etiqueta="¿Cuántas alumnas activas tienes?" opciones={OPCIONES_ALUMNOS} valor={ans.alumnos}
                    onCambio={(v) => guardar({ ...ans, alumnos: v || undefined })} />
                  <Desplegable etiqueta="¿Cuántos centros tienes?" opciones={OPCIONES_CENTROS} valor={ans.centros}
                    onCambio={(v) => guardar({ ...ans, centros: v || undefined })} />
                </div>
                {migrable && (
                  <p className="mt-4 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] text-muted-foreground" data-testid="aviso-migracion">
                    Vienes de <strong className="text-foreground">{ans.software}</strong>: al terminar te ayudamos a traer tus alumnas, bonos y horario.
                  </p>
                )}
              </>
            )}

            {pantalla.id === 'espacio' && (
              <>
                <h1 ref={tituloRef} tabIndex={-1} className="text-[clamp(24px,4vw,32px)] font-bold leading-tight outline-none">
                  Tus clases y tu sala
                </h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                  Ya te lo hemos dejado marcado con lo más habitual. Cambia lo que no sea tuyo; después lo afinas cuando quieras.
                </p>
                <div className="mt-6">
                  <Chips
                    legend="¿Qué clases das?"
                    nota="Hasta seis. Las dejamos creadas y podrás añadir más luego."
                    opciones={TIPOS_CLASE_SUGERIDOS} valor={clasesElegidas} multi={TOPE_CLASES}
                    onTope={() => { setAvisoTope(true); setTimeout(() => setAvisoTope(false), 3200); }}
                    onCambio={(v) => { setAvisoTope(false); guardar({ ...ans, clases: v as string[] }); }}
                  />
                  <p className="mt-1.5 min-h-5 text-[12.5px] text-muted-foreground" aria-live="polite">
                    {avisoTope ? 'Has llegado a seis. Quita una para elegir otra: no se quitan solas.' : ''}
                  </p>
                  <Chips legend="¿Cuántas salas tienes?" opciones={OPCIONES_SALAS} valor={ans.salas}
                    onCambio={(v) => guardar(alinearAforos({ ...ans, salas: v as string || undefined }))} />
                  {Array.from({ length: nSalas }, (_, n) => (
                    <Chips
                      key={n}
                      legend={nSalas === 1 ? '¿Cuántas plazas tiene tu sala?' : `¿Cuántas plazas hay en la sala ${n + 1}?`}
                      nota={n === 0 ? 'Es el límite real de reservas por clase.' : undefined}
                      opciones={OPCIONES_AFORO} valor={(ans.aforos ?? [])[n]}
                      onCambio={(v) => {
                        const aforos = [...(ans.aforos ?? [])];
                        aforos[n] = v as string;
                        guardar({ ...ans, aforos });
                      }}
                    />
                  ))}
                  <Chips legend="¿Cuánto dura una clase?" opciones={OPCIONES_DURACION} valor={ans.duracion}
                    onCambio={(v) => guardar({ ...ans, duracion: v as string || undefined })} />
                  <Chips legend="¿A qué horas das clases?" nota="Opcional. Es la franja que verás en tu calendario."
                    opciones={horarioEtiquetas} valor={ans.horario}
                    onCambio={(v) => guardar({ ...ans, horario: v as string || undefined })} />
                  <Chips legend="¿Das clases tú?" nota="Opcional. Si las das, te dejamos tu ficha creada."
                    opciones={OPCIONES_IMPARTE} valor={ans.imparte}
                    onCambio={(v) => guardar({ ...ans, imparte: v as string || undefined })} />
                </div>
              </>
            )}

            {pantalla.id === 'cierre' && (
              <>
                <h1 ref={tituloRef} tabIndex={-1} className="text-[clamp(24px,4vw,32px)] font-bold leading-tight outline-none">
                  Antes de entrar
                </h1>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                  Todo esto es opcional. Si lo dejas en blanco, tu estudio ya está montado.
                </p>
                <div className="mt-6">
                  <Chips legend="¿Cómo cobras a tus alumnas?"
                    nota="Elige todas las que uses. Las dejamos preparadas; el precio lo pones tú antes de activarlas."
                    opciones={OPCIONES_COBRO_LISTA} valor={ans.cobro} multi={OPCIONES_COBRO_LISTA.length}
                    onCambio={(v) => guardar({ ...ans, cobro: v as string[] })} />
                  <Chips legend="¿Qué es lo que más te preocupa ahora mismo?"
                    nota="Elige hasta dos. Subimos a lo primero de tu panel lo que más te importe."
                    opciones={OPCIONES_FOCO} valor={ans.foco} multi={2}
                    onCambio={(v) => guardar({ ...ans, foco: v as string[] })} />
                  <Chips legend="¿Cómo prefieres que te ayudemos?" nota="Puedes cambiar de idea cuando quieras."
                    opciones={OPCIONES_AYUDA} valor={ans.ayuda}
                    onCambio={(v) => guardar({ ...ans, ayuda: v as string || undefined })} />
                  {preguntaLlamada && (
                    <CampoLlamada valor={llamada} onCambio={setLlamada} mostrarErrores={intentoLlamada} errorServidor={errorLlamadaServidor} />
                  )}
                </div>
              </>
            )}

            {errorFin && <p role="alert" className="mt-4 text-[13px] text-destructive">{errorFin}</p>}

            <div className="sticky bottom-0 -mx-5 mt-8 flex items-center gap-3 border-t border-border bg-background/95 px-5 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => setI(i - 1)}
                  disabled={trabajando}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <ArrowLeft size={16} aria-hidden /> Atrás
                </button>
              )}
              <button
                type="submit"
                disabled={trabajando}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-medio px-5 text-[15px] font-bold text-white disabled:opacity-70 sm:flex-none sm:min-w-52"
              >
                {trabajando ? (
                  <><Loader2 size={16} className="animate-spin" aria-hidden /> Montando tu estudio…</>
                ) : i === PANTALLAS.length - 1 ? (
                  <>Ver mi estudio <ArrowRight size={16} aria-hidden /></>
                ) : (
                  <>Continuar <ArrowRight size={16} aria-hidden /></>
                )}
              </button>
              {i < PANTALLAS.length - 1 && (
                <button
                  type="button"
                  onClick={() => { void terminar(); }}
                  disabled={trabajando}
                  className="hidden min-h-12 px-2 text-[13px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50 sm:inline-flex sm:items-center"
                >
                  Saltar y ver mi estudio
                </button>
              )}
            </div>
          </form>
        </main>

        {/* Escritorio: SU app tomando forma y la guía, siempre a la vista. */}
        <aside className="hidden lg:block" aria-label="Vista previa de tu app y guía rápida">
          <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">
            {studio.slug && <AppAlumnaReal slug={studio.slug} ancho={232} version={versionApp} />}
            {i === 1 && creadoAhora.tiposClase === 0 && (
              <p className="-mt-2 text-center text-[12px] text-muted-foreground">Tus clases saldrán aquí en cuanto pulses «Continuar».</p>
            )}
            {guia && <GuiaRapidaLista guia={guia} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
