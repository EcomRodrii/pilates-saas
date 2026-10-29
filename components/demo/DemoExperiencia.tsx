'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { useCaptcha, ERROR_CAPTCHA } from '@/components/auth/turnstile-widget';
import { captchaGastado } from '@/lib/auth/captcha-usado';
import { CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';
import { ALTA } from '@/components/landing/enlaces';
import { guardarBorradorAltaNueva } from '@/lib/alta/registro';
import { capturarEvento } from '@/lib/posthog-cliente';
import { CENTROS, TIPOS_CENTRO, type TipoCentro } from '@/lib/demo/centros';
import { validarDatosDemo, type CampoDemo } from '@/lib/demo/lead';
import type { DemoGenerada } from '@/lib/demo/modelo';
import type { AlternativaCatalogo, TurnoTenti } from '@/lib/demo/tenti';
import type { RespuestaEvaluacion } from '@/lib/demo/evaluacion';
import { ejecutarDemo, evaluarDemo, iniciarDemo, turnoDeTenti } from '@/lib/demo/cliente';
import {
  borrarSesion, guardarDatos, guardarSesion, leerDatos, leerSesionGuardada,
  type PropuestaGuardada, type SesionGuardada,
} from '@/lib/demo/persistencia';
import { ChatTenti, type MensajeChat } from './ChatTenti';
import { Recorrido } from './Recorrido';
import { CLAVE_PANEL, CLAVE_VUELTA } from '@/lib/demo/panel/guia';
import './demo.css';

// La demo personalizada, de punta a punta: centro → datos → Tenti → recorrido →
// valoración → alta. Es una pantalla propia (no un modal de la landing) porque
// tiene que sobrevivir a un refresco, a «atrás» y a una pestaña cerrada.
//
// Lo que vive aquí es SOLO presentación y estado: ninguna regla de negocio se
// calcula en el navegador (la demo llega construida y validada del servidor) y
// lo que se recuerda no lleva datos personales (lib/demo/persistencia.ts).

type Fase = 'retomar' | 'centro' | 'datos' | 'tenti' | 'preparando' | 'recorrido' | 'evaluacion' | 'alta';
const PASOS = ['Tu centro', 'Tus datos', 'Tu duda', 'Tu demo', 'Valoración'] as const;
const PASO_DE_FASE: Record<Fase, number> = { retomar: 0, centro: 0, datos: 1, tenti: 2, preparando: 3, recorrido: 3, evaluacion: 4, alta: 4 };

interface Datos { nombre: string; estudio: string; email: string; telefono: string }
const DATOS_VACIOS: Datos = { nombre: '', estudio: '', email: '', telefono: '' };
const EJEMPLOS = [
  'Quiero ver qué pasa con un bono cuando la alumna avisa de que no va',
  '¿Gana una recuperación si cancela a tiempo?',
  '¿De qué bono se descuenta la sesión si tiene varios?',
];

// La marca de «vuelvo del panel» se lee UNA vez por carga de página: React en desarrollo ejecuta los efectos dos veces y la
// primera la borra, así que la segunda (la que decide) no la vería.
let vueltaDelPanel: boolean | null = null;
function leerVueltaDelPanel(): boolean {
  if (vueltaDelPanel === null) {
    try { vueltaDelPanel = sessionStorage.getItem(CLAVE_VUELTA) === '1'; sessionStorage.removeItem(CLAVE_VUELTA); } catch { vueltaDelPanel = false; }
  }
  return vueltaDelPanel;
}

export function DemoExperiencia() {
  const router = useRouter();
  const uid = useId();
  const { widget: captcha, pedirToken } = useCaptcha();

  const [fase, setFase] = useState<Fase>('centro');
  const [centro, setCentro] = useState<TipoCentro | null>(null);
  const [datos, setDatos] = useState<Datos>(DATOS_VACIOS);
  const [comercial, setComercial] = useState(false);
  const [trampa, setTrampa] = useState('');
  const [errores, setErrores] = useState<Partial<Record<CampoDemo, string>>>({});
  const [errorGlobal, setErrorGlobal] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [sesion, setSesion] = useState<string | null>(null);
  const [huella, setHuella] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [desde, setDesde] = useState(0);
  const [opciones, setOpciones] = useState<string[]>([]);
  const [alternativas, setAlternativas] = useState<AlternativaCatalogo[]>([]);
  const [escribiendo, setEscribiendo] = useState(false);
  const [errorChat, setErrorChat] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaGuardada | null>(null);
  const [demo, setDemo] = useState<DemoGenerada | null>(null);
  const [ejecutando, setEjecutando] = useState(false);
  const [guardada, setGuardada] = useState<SesionGuardada | null>(null);
  const [verTexto, setVerTexto] = useState(false);
  const siguienteId = useRef(1);
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);

  // Al abrir: ¿hay una demo a medias? El formulario se recupera aparte (pestaña).
  useEffect(() => {
    capturarEvento('demo_abierta');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDatos(leerDatos() ?? DATOS_VACIOS);
    const g = leerSesionGuardada();
    // Vuelve del panel real (lo terminó o salió): a la valoración, con su sesión, sin pedirle nada otra vez.
    const vuelta = leerVueltaDelPanel();
    if (g && vuelta) {
      setCentro(g.tipoCentro); setSesion(g.sesion); setPropuesta(g.propuesta);
      setMensajes(g.historial.map((m) => ({ id: siguienteId.current++, rol: m.rol, texto: m.texto })));
      setFase('evaluacion');
    } else if (g) { setGuardada(g); setFase('retomar'); }
  }, []);

  // Lo que se recuerda para volver (sin datos personales).
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    if (sesion && centro) {
      guardarSesion({
        sesion, tipoCentro: centro, propuesta,
        historial: mensajes.filter((m) => !m.local).map(({ rol, texto }) => ({ rol, texto })),
      });
    }
  }, [sesion, centro, propuesta, mensajes]);

  // Al cambiar de pantalla el foco va al título: el cambio se anuncia y el foco no se queda en un botón que ya no está.
  useEffect(() => { titulo.current?.focus(); }, [fase]);

  const nuevoMensaje = useCallback((rol: 'usuario' | 'tenti', texto: string, local = false): MensajeChat => ({ id: siguienteId.current++, rol, texto, local }), []);

  // ── Retomar ──────────────────────────────────────────────────────────────
  async function retomar() {
    if (!guardada) return;
    setCentro(guardada.tipoCentro);
    setSesion(guardada.sesion);
    setMensajes(guardada.historial.map((m) => nuevoMensaje(m.rol, m.texto)));
    setErrorGlobal(null);
    if (guardada.propuesta) {
      setEjecutando(true);
      const r = await ejecutarDemo(guardada.sesion, guardada.propuesta.escenario, guardada.propuesta.parametros);
      setEjecutando(false);
      if (r.ok) { setPropuesta(guardada.propuesta); setDemo(r.datos.demo); setFase('recorrido'); return; }
      if (r.sesionCaducada) return empezarDeNuevo();
    }
    setFase('tenti');
    abrirChat(guardada.historial.length === 0);
  }

  function empezarDeNuevo() {
    borrarSesion();
    setGuardada(null); setSesion(null); setHuella(null); setMensajes([]); setDesde(0); setOpciones([]); setAlternativas([]);
    setPropuesta(null); setDemo(null); setCentro(null); setErrorChat(null);
    setFase('centro');
  }

  // ── Datos → sesión ───────────────────────────────────────────────────────
  function cambiar(campo: keyof Datos, valor: string) {
    setDatos((d) => {
      const n = { ...d, [campo]: valor };
      guardarDatos(n);
      return n;
    });
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  async function enviarDatos(e: React.FormEvent) {
    e.preventDefault();
    if (enviando || !centro) return;
    setErrorGlobal(null);
    const v = validarDatosDemo({ ...datos, tipoCentro: centro, comercial });
    if (!v.ok) { setErrores(v.errores); document.getElementById(`${uid}-${Object.keys(v.errores)[0]}`)?.focus(); return; }
    setErrores({});
    const clave = JSON.stringify([v.datos.tipoCentro, v.datos.nombre, v.datos.estudio, v.datos.email, v.datos.telefono, v.datos.comercial]);
    // Si vuelve atrás y no ha cambiado nada, no se pide otra sesión.
    if (sesion && huella === clave) { setFase('tenti'); abrirChat(mensajes.length === 0); return; }
    // El estado de carga se enciende ANTES de pedir el token: tarda segundos.
    setEnviando(true);
    const token = await pedirToken();
    if (token === null) { setEnviando(false); setErrorGlobal(ERROR_CAPTCHA); return; }
    const r = await iniciarDemo({ ...v.datos, captcha: token || undefined, [CAMPO_TRAMPA]: trampa });
    if (token) captchaGastado();
    setEnviando(false);
    if (!r.ok) {
      if (r.errores) setErrores(r.errores);
      setErrorGlobal(r.mensaje);
      return;
    }
    if (!r.datos.sesion) { setErrorGlobal('No hemos podido abrir tu demo. Vuelve a intentarlo.'); return; }
    capturarEvento('demo_datos_enviados', { centro: v.datos.tipoCentro });
    setSesion(r.datos.sesion); setHuella(clave); setFase('tenti');
    abrirChat(true);
  }

  // ── Tenti ────────────────────────────────────────────────────────────────
  function abrirChat(conSaludo: boolean) {
    if (!conSaludo) return;
    const quien = datos.nombre.trim().split(' ')[0];
    setMensajes((m) => [...m, nuevoMensaje('tenti', `Hola${quien ? `, ${quien}` : ''}. Soy Tenti. Cuéntame qué quieres entender de cómo funcionaría Tentare en tu estudio y te preparo una demo con tu caso.`, true)]);
    setOpciones(EJEMPLOS);
  }

  const aplicarTurno = useCallback((t: TurnoTenti) => {
    capturarEvento('demo_propuesta', { tipo: t.tipo });
    if (t.tipo === 'pregunta') {
      setMensajes((m) => [...m, nuevoMensaje('tenti', t.texto)]);
      setOpciones(t.opciones); setAlternativas([]);
    } else if (t.tipo === 'demo') {
      setOpciones([]); setAlternativas([]);
      setPropuesta({ escenario: t.escenario, parametros: t.parametros as Record<string, unknown>, resumen: t.resumen, aclaracion: t.aclaracion });
      setDemo(t.demo);
      setFase('preparando');
    } else {
      setMensajes((m) => [...m, nuevoMensaje('tenti', t.texto)]);
      setOpciones([]); setAlternativas(t.alternativas);
    }
  }, [nuevoMensaje]);

  async function pedirTurno(historial: MensajeChat[]) {
    if (!sesion) return;
    setEscribiendo(true); setErrorChat(null); setOpciones([]); setAlternativas([]);
    const r = await turnoDeTenti(sesion, historial.filter((m) => !m.local).slice(desde).map(({ rol, texto }) => ({ rol, texto })));
    setEscribiendo(false);
    if (!r.ok) {
      if (r.sesionCaducada) { setErrorGlobal(r.mensaje); setSesion(null); setHuella(null); setFase('datos'); return; }
      setErrorChat(r.mensaje);
      return;
    }
    aplicarTurno(r.datos.turno);
  }

  function enviarMensaje(texto: string) {
    const lista = [...mensajes, nuevoMensaje('usuario', texto)];
    setMensajes(lista);
    void pedirTurno(lista);
  }

  async function elegirAlternativa(id: string) {
    if (!sesion) return;
    setEjecutando(true); setErrorChat(null);
    const r = await ejecutarDemo(sesion, id, {});
    setEjecutando(false);
    if (!r.ok) { if (r.sesionCaducada) { setSesion(null); setFase('datos'); } else setErrorChat(r.mensaje); return; }
    setPropuesta({ escenario: id, parametros: {}, resumen: '', aclaracion: null });
    setDemo(r.datos.demo);
    setMensajes((m) => [...m, nuevoMensaje('usuario', `Enséñame: ${r.datos.demo.titulo}`, true)]);
    setFase('preparando');
  }

  async function reejecutar() {
    if (!sesion || !propuesta) return;
    setEjecutando(true);
    const r = await ejecutarDemo(sesion, propuesta.escenario, propuesta.parametros);
    setEjecutando(false);
    if (r.ok) setDemo(r.datos.demo);
    else if (r.sesionCaducada) { setSesion(null); setFase('datos'); setErrorGlobal(r.mensaje); }
  }

  // «Preparando tu recorrido»: una transición, no una espera. Se salta con un clic y, si no, entra sola en un instante.
  useEffect(() => {
    if (fase !== 'preparando') return;
    const t = window.setTimeout(() => setFase('recorrido'), 900);
    return () => window.clearTimeout(t);
  }, [fase]);

  // ── El panel real ────────────────────────────────────────────────────────
  // La demo se ve en el panel de VERDAD de Tentare (con un estudio de ejemplo), no en un dibujo: se deja la marca de esta
  // pestaña con los pasos y se abre la primera pantalla. El panel carga `demo-panel.js` y pone la guía encima.
  function abrirPanel() {
    if (!demo) return;
    const pasos = demo.pasos.map((p) => ({ titulo: p.titulo, proposito: p.proposito, pantalla: p.pantalla }));
    try { sessionStorage.setItem(CLAVE_PANEL, JSON.stringify({ t: Date.now(), guia: { titulo: demo.titulo, pasos, paso: 0 } })); } catch { /* sin almacenamiento */ }
    capturarEvento('demo_paso', { escenario: demo.escenario, n: 0 });
    window.location.assign(pasos[0]?.pantalla?.ruta ?? '/dashboard');
  }

  // ── Valoración ───────────────────────────────────────────────────────────
  async function valorar(respuesta: RespuestaEvaluacion) {
    capturarEvento('demo_evaluada', { respuesta });
    if (sesion) void evaluarDemo(sesion, respuesta, propuesta?.escenario ?? null);
    if (respuesta === 'resuelta') { setFase('alta'); return; }
    // El historial que ve el modelo empieza ahora; lo escrito sigue a la vista.
    setDesde(mensajes.filter((m) => !m.local).length);
    if (respuesta === 'otro_ejemplo') {
      setMensajes((m) => [...m, nuevoMensaje('tenti', 'Claro. Elige otro ejemplo o cuéntame otro caso.', true)]);
      setAlternativas(demo ? (Object.values(CATALOGO_RESUMEN).filter((a) => a.id !== propuesta?.escenario)) : []);
    } else {
      setMensajes((m) => [...m, nuevoMensaje('tenti', respuesta === 'otra_duda' ? 'Dime cuál es tu otra duda.' : 'Gracias por decírmelo. Cuéntame qué no ha encajado y lo vemos.', true)]);
      setAlternativas([]);
    }
    setOpciones([]);
    setFase('tenti');
  }

  function irAlAlta() {
    capturarEvento('demo_ir_al_alta');
    // Lo ya escrito pasa por el borrador del alta (el mismo mecanismo, con su validación): no se vuelve a pedir.
    guardarBorradorAltaNueva({ nombre: datos.estudio, email: datos.email });
    router.push(ALTA);
  }

  // ── Atrás ────────────────────────────────────────────────────────────────
  const atras: Partial<Record<Fase, Fase>> = { datos: 'centro', tenti: 'datos', recorrido: 'tenti', preparando: 'tenti', evaluacion: 'recorrido', alta: 'evaluacion' };
  const puedeVolver = fase in atras;
  const paso = PASO_DE_FASE[fase];

  return (
    <div className="dm-raiz" role="dialog" aria-modal="true" aria-labelledby={`${uid}-titulo`}>
      <div className="dm-fondo" aria-hidden="true" />
      <div className="dm-tarjeta">
        <div className="dm-cabecera">
          <button type="button" className="dm-icono-btn" aria-label="Paso anterior" disabled={!puedeVolver} onClick={() => atras[fase] && setFase(atras[fase]!)}>
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="dm-cabecera-fila">
            <Link href="/" aria-label="Tentare, volver a la página principal"><LogoTentare alto={24} /></Link>
            <Link href="/" className="dm-icono-btn" aria-label="Cerrar la demo"><X size={20} aria-hidden="true" /></Link>
          </div>
        </div>
        <ol className="dm-progreso" aria-label="Progreso">
          {PASOS.map((p, n) => <li key={p} data-hecho={n < paso} aria-current={n === paso ? 'step' : undefined}><span className="dm-solo-lectores">{p}</span></li>)}
        </ol>
        <p className="dm-progreso-texto">Paso {paso + 1} de {PASOS.length} · {PASOS[paso]}</p>

        <div className="dm-cuerpo">
          {fase === 'retomar' && guardada && (
            <div className="dm-entra" style={{ display: 'grid', gap: 18 }}>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">Tienes una demo a medias</h1>
              <p className="dm-lead">Puedes seguir donde lo dejaste o empezar de cero.</p>
              <div className="dm-acciones">
                <button type="button" className="dm-boton dm-boton-primario" onClick={() => void retomar()} disabled={ejecutando}>Continuar mi demo</button>
                <button type="button" className="dm-boton dm-boton-contorno" onClick={empezarDeNuevo}>Empezar de nuevo</button>
              </div>
            </div>
          )}

          {fase === 'centro' && (
            <div className="dm-entra" style={{ display: 'grid', gap: 18 }}>
              <div>
                <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">¿Qué tipo de centro tienes?</h1>
                <p className="dm-lead" style={{ marginTop: 8 }}>Así adaptamos los ejemplos y el vocabulario a tu día a día.</p>
              </div>
              <fieldset className="dm-opciones">
                <legend className="dm-solo-lectores">Tipo de centro</legend>
                {TIPOS_CENTRO.map((t) => (
                  <label key={t} className="dm-opcion">
                    <input type="radio" name={`${uid}-centro`} value={t} checked={centro === t} onChange={() => setCentro(t)} onClick={() => setCentro(t)} />
                    <span className="dm-opcion-cara">
                      <span className="dm-opcion-titulo">{CENTROS[t].etiqueta}</span>
                      <span className="dm-opcion-detalle">{CENTROS[t].detalle}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}

          {fase === 'datos' && (
            <form className="dm-entra" noValidate onSubmit={(e) => void enviarDatos(e)} style={{ display: 'grid', gap: 18 }} aria-describedby={errorGlobal ? `${uid}-err` : undefined}>
              <div>
                <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">Cuéntanos quién eres</h1>
                <p className="dm-lead" style={{ marginTop: 8 }}>Para preparar tu demo y poder ayudarte después. No pedimos contraseña.</p>
              </div>
              <div className="dm-form">
                {([
                  ['nombre', 'Tu nombre', 'name', 'text'],
                  ['estudio', 'Nombre de tu estudio', 'organization', 'text'],
                  ['email', 'Correo electrónico', 'email', 'email'],
                  ['telefono', 'Teléfono', 'tel', 'tel'],
                ] as const).map(([campo, etiqueta, auto, tipo]) => (
                  <div key={campo} className="dm-campo">
                    <label className="dm-etiqueta" htmlFor={`${uid}-${campo}`}>{etiqueta}</label>
                    <input
                      id={`${uid}-${campo}`} className="dm-input" type={tipo} autoComplete={auto} inputMode={campo === 'telefono' ? 'tel' : campo === 'email' ? 'email' : undefined}
                      value={datos[campo]} onChange={(e) => cambiar(campo, e.target.value)}
                      aria-invalid={errores[campo] ? true : undefined} aria-describedby={errores[campo] ? `${uid}-${campo}-e` : undefined}
                    />
                    {errores[campo] && <p id={`${uid}-${campo}-e`} className="dm-error" role="alert">{errores[campo]}</p>}
                  </div>
                ))}
              </div>
              {/* El campo trampa: una persona no lo ve ni llega con el teclado. */}
              <div className="dm-trampa" aria-hidden="true">
                <label>Web<input tabIndex={-1} autoComplete="off" name={CAMPO_TRAMPA} value={trampa} onChange={(e) => setTrampa(e.target.value)} /></label>
              </div>
              <label className="dm-casilla">
                <input type="checkbox" checked={comercial} onChange={(e) => setComercial(e.target.checked)} />
                <span>Quiero recibir por email novedades y guías de Tentare para llevar mi estudio. Puedo darme de baja cuando quiera. <em>(Opcional: no hace falta para ver la demo.)</em></span>
              </label>
              <p className="dm-pequeno">
                Usamos tus datos para preparar la demo y contestarte sobre ella. Más en nuestra{' '}
                <Link href="/privacidad" target="_blank" rel="noopener">política de privacidad</Link>.
              </p>
              {errorGlobal && <div id={`${uid}-err`} className="dm-aviso" data-tono="error" role="alert">{errorGlobal}</div>}
              {captcha}
              <div>
                <button type="submit" className="dm-boton dm-boton-primario" disabled={enviando}>
                  {enviando ? 'Un momento…' : <>Empezar mi demo <ArrowRight size={18} aria-hidden="true" /></>}
                </button>
              </div>
            </form>
          )}

          {fase === 'tenti' && (
            <>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1" style={{ fontSize: 'clamp(1.25rem, 1.1rem + .8vw, 1.6rem)' }}>Tu duda, con Tenti</h1>
              <ChatTenti
                mensajes={mensajes} escribiendo={escribiendo || ejecutando} opciones={opciones} error={errorChat}
                onEnviar={enviarMensaje} onReintentar={() => void pedirTurno(mensajes)}
              />
              {alternativas.length > 0 && (
                <div role="group" aria-label="Demos disponibles" style={{ display: 'grid', gap: 10 }}>
                  {alternativas.map((a) => (
                    <button key={a.id} type="button" className="dm-opcion-cara" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => void elegirAlternativa(a.id)} disabled={ejecutando}>
                      <span className="dm-opcion-titulo">{a.titulo}</span>
                      <span className="dm-opcion-detalle">{a.descripcion}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {fase === 'preparando' && (
            <div className="dm-preparando dm-entra" role="status">
              <div className="dm-pulso" aria-hidden="true" />
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">Estamos preparando tu recorrido personalizado</h1>
              <button type="button" className="dm-boton dm-boton-contorno" onClick={() => setFase('recorrido')}>Ver mi demo ya</button>
            </div>
          )}

          {fase === 'recorrido' && demo && !verTexto && (
            <div className="dm-entra" style={{ display: 'grid', gap: 18 }}>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">Tu demo está lista</h1>
              {propuesta?.resumen && <p className="dm-lead">{propuesta.resumen}</p>}
              {propuesta?.aclaracion && <div className="dm-aviso" role="note">{propuesta.aclaracion}</div>}
              <p className="dm-lead">Te la enseño en el <strong>panel real de Tentare</strong>, con un estudio de ejemplo: las mismas pantallas que usarás tú. Nada de lo que veas toca datos reales.</p>
              <div className="dm-acciones">
                <button type="button" className="dm-boton dm-boton-primario" onClick={abrirPanel}>Verla en el panel real <ArrowRight size={18} aria-hidden="true" /></button>
                <button type="button" className="dm-boton dm-boton-contorno" onClick={() => setVerTexto(true)}>Prefiero el resumen en texto</button>
              </div>
            </div>
          )}

          {fase === 'recorrido' && demo && verTexto && (
            <>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-solo-lectores">{demo.titulo}</h1>
              <Recorrido
                demo={demo} resumen={propuesta?.resumen || null} aclaracion={propuesta?.aclaracion ?? null} ejecutando={ejecutando}
                onTerminar={() => setFase('evaluacion')} onReejecutar={() => void reejecutar()}
                onOtra={() => { setDesde(mensajes.filter((m) => !m.local).length); setAlternativas([]); setOpciones(EJEMPLOS); setFase('tenti'); }}
              />
            </>
          )}

          {fase === 'evaluacion' && (
            <div className="dm-entra" style={{ display: 'grid', gap: 18 }}>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">¿Hemos resuelto tu duda?</h1>
              <p className="dm-lead">Dinos cómo ha ido; no cuenta como resuelta hasta que tú lo digas.</p>
              <div className="dm-opciones" role="group" aria-label="Valoración de la demo">
                {([
                  ['resuelta', 'Sí, lo tengo claro', 'Pasar a crear mi estudio'],
                  ['otra_duda', 'Tengo otra duda', 'Preguntarle algo más a Tenti'],
                  ['otro_ejemplo', 'Quiero ver otro ejemplo', 'Elegir otra demo'],
                  ['no_exacto', 'No es exactamente lo que necesito', 'Contárselo a Tenti'],
                ] as const).map(([clave, titulo2, detalle]) => (
                  <button key={clave} type="button" className="dm-opcion-cara" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit' }} onClick={() => void valorar(clave)}>
                    <span className="dm-opcion-titulo">{titulo2}</span>
                    <span className="dm-opcion-detalle">{detalle}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {fase === 'alta' && (
            <div className="dm-entra" style={{ display: 'grid', gap: 18 }}>
              <h1 id={`${uid}-titulo`} ref={titulo} tabIndex={-1} className="dm-h1">Ahora que sabes cómo funciona, crea tu estudio en Tentare</h1>
              <p className="dm-lead">
                Te llevamos al alta de siempre{datos.estudio || datos.email ? ', con el nombre de tu estudio y tu correo ya escritos' : ''}. Tu estudio no se crea hasta que termines el alta y confirmes tu correo.
              </p>
              <div className="dm-acciones">
                <button type="button" className="dm-boton dm-boton-primario" onClick={irAlAlta}>Crear mi estudio <ArrowRight size={18} aria-hidden="true" /></button>
                <button type="button" className="dm-boton dm-boton-contorno" onClick={() => setFase('evaluacion')}>Volver</button>
              </div>
            </div>
          )}
        </div>

        {fase === 'centro' && (
          <div className="dm-pie">
            <span className="dm-pequeno">Dos minutos, sin tarjeta.</span>
            <button type="button" className="dm-boton dm-boton-primario" disabled={!centro} onClick={() => setFase('datos')}>
              Continuar <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Los títulos de los escenarios para «otro ejemplo» sin traer el catálogo al navegador:
// el servidor valida el id al ejecutarlo, esto solo es lo que se muestra.
const CATALOGO_RESUMEN: Record<string, AlternativaCatalogo> = {
  caducidad_bono: { id: 'caducidad_bono', titulo: 'Caducidad de un bono y ausencia de la alumna', descripcion: 'Qué pasa con las sesiones de un bono cuando la alumna avisa de que no va y el bono llega a su fecha de fin.' },
  ausencia_recuperacion: { id: 'ausencia_recuperacion', titulo: 'Ausencia avisada y recuperación semanal', descripcion: 'Si una alumna con límite semanal gana una recuperación al avisar de que no va.' },
  orden_consumo_bonos: { id: 'orden_consumo_bonos', titulo: 'De qué bono se descuenta la sesión', descripcion: 'Qué bono gasta Tentare cuando una alumna tiene varios y reserva una clase.' },
};
