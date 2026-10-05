'use client';

import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Tenti as Motor, type EmocionTenti, type EstadoTenti } from '@/lib/tenti/motor';
import { paletaDesdeTokens, type PaletaTenti } from '@/lib/tenti/paleta';
import { ID_ANFITRION_PANEL } from '@/lib/panel-portal';
import { prepararSonidos, useSonidosDeTenti } from '@/lib/tenti/preferencia-sonido';
import { capturarExcepcion } from '@/lib/sentry-cliente';

// La mascota de Tentare. El dibujo y las animaciones viven en lib/tenti/motor.ts;
// esto solo lo monta en un <canvas> y lo conecta con la página.
//
// Desde el 5-oct-2026 (decisión del fundador: «en /interno/tenti está
// perfecto») Tenti se comporta en el panel como en el catálogo: parpadea, mira
// alrededor, sigue el cursor con los ojos, se aplasta y suena al tocarlo, se
// molesta si insistes y se marea si insistes mucho. Lo que cada sitio enciende
// lo deciden sus envoltorios (TentiIcono, TentiDecorativo, TentiDiferido) y la
// guardia lib/tenti/donde-vive-tenti.test.ts. Por defecto, aquí:
//   · `sonido` sigue la preferencia del dispositivo («Sonidos de Tenti»,
//     encendida salvo que la apaguen) y cambia al momento si la cambian;
//   · `miradas` encendidas: en reposo mira alrededor de vez en cuando;
//   · no se toca, no saluda solo, no sigue al cursor, sin insignia y decorativo.
//
// El bucle DUERME: pide fotogramas solo mientras algo se mueve (un tween, un
// temporizador, una partícula, un valor que aún no ha llegado, o un estado que
// oscila sin fin) y, si no, se despierta con un setTimeout a la hora del
// próximo parpadeo. Lo despiertan también un cambio de estado, de emoción, de
// insignia, de paleta (claro ↔ oscuro), el puntero si sigue al cursor, `mira`
// y volver a verse. Fuera de pantalla o con la pestaña oculta no queda ni el
// fotograma ni el temporizador. En reposo pinta unos pocos fotogramas por
// segundo en vez de 60. Con «reducir movimiento» el motor no tiene recorrido
// (`quieto`) y ni siquiera se despierta para parpadear.
//
// Se deja observar desde los e2e, porque ningún test ve un canvas: data-estado,
// data-paleta ('tokens' o 'defecto'), data-quieto, data-emocion (la última que
// se le pidió) y data-saludo (cuántas veces ha saludado DE VERDAD; con «reducir
// movimiento» no saluda y no sube).

export interface TentiControl {
  emocion: (e: EmocionTenti) => void;
  saludar: () => void;
}

export interface PropsTenti {
  estado?: EstadoTenti;
  /** Lado del cuadro en px. Tenti ocupa algo más de la mitad. Cambiarlo recrea el motor. */
  tamano?: number;
  /** Mueve los ojos hacia el cursor. Apagado por defecto: con el ratón en
   *  movimiento el bucle vuelve a 60 fps, así que quien lo quiera, lo pide. */
  sigueCursor?: boolean;
  /** Hacia dónde mira en horizontal, de -1 (izquierda) a 1 (derecha), cuando
   *  no sigue al cursor. Con «reducir movimiento» mira siempre al frente. */
  mira?: number;
  /** Sonidos de sus reacciones. Sin él, la preferencia del dispositivo
   *  («Sonidos de Tenti», lib/tenti/preferencia-sonido.ts). */
  sonido?: boolean;
  /** Mira alrededor de vez en cuando, en reposo. */
  miradas?: boolean;
  /** La silueta por dentro del cuerpo, la del icono: 'normal' con
   *  --tenti-silueta, 'invertida' con el color del texto (sobre bg-primary). */
  silueta?: 'normal' | 'invertida';
  /** Saluda (con la mano y su sonido) la primera vez que se ve en esta sesión
   *  del navegador: uno solo por sesión, entre todos los Tentis que lo pidan. */
  saludaUnaVez?: boolean;
  /** Se aplasta al tocarlo, y se marea si insistes. */
  interactivo?: boolean;
  /** Saluda con la mano al montarse, aunque aún no se vea: quien necesite el saludo a la vista, que llame a saludar(). */
  saludaAlAparecer?: boolean;
  /** El piloto de estado sobre la cabeza. */
  insignias?: boolean;
  /** Nombre accesible. Sin él, Tenti es decorativo (aria-hidden): el texto de al lado ya dice lo que pasa. */
  titulo?: string;
  /** Lo que se pinta si no se puede dibujar (sin canvas 2D, o el motor falla). Sin él, nada. */
  reserva?: ReactNode;
  className?: string;
  ref?: Ref<TentiControl>;
}

const MAREO_TRAS_TOQUES = 4;
const CLAVE_SALUDO_SESION = 'tenti-saludo-sesion';

/** Si este Tenti se queda el saludo de la sesión: el primero que lo pida. */
function tomarSaludoDeSesion(): boolean {
  try {
    if (sessionStorage.getItem(CLAVE_SALUDO_SESION)) return false;
    sessionStorage.setItem(CLAVE_SALUDO_SESION, '1');
    return true;
  } catch { return false; }
}
const VENTANA_TOQUES_MS = 1700;
const MAREO_MS = 2200;

export function Tenti({
  estado = 'reposo', tamano = 120, sigueCursor = false, mira, sonido: sonidoPedido, miradas = true, silueta,
  saludaUnaVez = false, interactivo = false, saludaAlAparecer = false, insignias = false, titulo, reserva = null,
  className, ref,
}: PropsTenti) {
  const preferencia = useSonidosDeTenti();
  const sonido = sonidoPedido ?? preferencia;
  const siluetaRef = useRef(silueta);
  const saludaUnaVezRef = useRef(saludaUnaVez);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motorRef = useRef<Motor | null>(null);
  const estadoRef = useRef(estado);
  const toques = useRef<number[]>([]);
  const mareadoHasta = useRef(0);
  const despertarRef = useRef<() => void>(() => {});
  const fallarRef = useRef<(e: unknown) => void>(() => {});
  const [fallo, setFallo] = useState(false);

  // Montaje: el motor y su bucle de fotogramas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // La mascota es adorno: si algo de aquí lanza, la pantalla sigue y en su
    // hueco va `reserva`, sin un <canvas> a medio pintar.
    const fallar = (e: unknown) => {
      capturarExcepcion(e, { tags: { area: 'tenti' } });
      setFallo(true);
    };
    const leerPaleta = () => {
      const estilo = getComputedStyle(canvas);
      return paletaDesdeTokens((t) => estilo.getPropertyValue(t));
    };
    const marcarPaleta = (p: PaletaTenti | null) => { canvas.dataset.paleta = p ? 'tokens' : 'defecto'; };
    const leerSilueta = () => {
      const s = siluetaRef.current;
      if (!s) return null;
      const estilo = getComputedStyle(canvas);
      return (s === 'invertida' ? estilo.color : estilo.getPropertyValue('--tenti-silueta')).trim() || null;
    };
    const reducido = window.matchMedia('(prefers-reduced-motion: reduce)');
    const marcarQuieto = (q: boolean) => { if (q) canvas.dataset.quieto = '1'; else delete canvas.dataset.quieto; };

    let creado: Motor | null = null;
    try {
      const paleta = leerPaleta();
      creado = new Motor(canvas, {
        mini: tamano < 64, sonido, insignias, quieto: reducido.matches, paleta, miradas, silueta: leerSilueta(),
      });
      creado.medir(tamano);
      creado.ponerEstado(estadoRef.current, { forzar: true, silencio: true });
      marcarPaleta(paleta);
      marcarQuieto(creado.quieto);
    } catch (e) {
      // Si llegó a crearse, que no deje temporizadores sueltos (las chispas de 'hecho').
      try { creado?.destruir(); } catch { /* ya estamos en el camino de fallo */ }
      // El fallo del canvas solo se ve al montar: no hay otro sitio donde enterarse.
      capturarExcepcion(e, { tags: { area: 'tenti' } });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFallo(true);
      return;
    }
    const motor = creado;
    motorRef.current = motor;
    fallarRef.current = fallar;

    let visible = true;
    let raf = 0;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    const dormir = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      if (reloj != null) { clearTimeout(reloj); reloj = null; }
    };
    const bucle = () => {
      raf = 0;
      if (!visible || document.hidden) return;
      let seguir: boolean, despertar: number;
      try {
        motor.fotograma();
        seguir = motor.animando() || motor.perpetuo();
        despertar = seguir ? 0 : motor.proximoDespertar();
      } catch (e) { fallar(e); return; }
      if (seguir) { raf = requestAnimationFrame(bucle); return; }
      // Nada se mueve: hasta el próximo parpadeo, ni un fotograma. Si llega
      // un poco antes (los relojes no van a la par), el fotograma de entonces
      // vuelve a programar el resto.
      if (Number.isFinite(despertar)) reloj = setTimeout(arrancar, Math.max(0, despertar - performance.now()));
    };
    function arrancar() {
      if (reloj != null) { clearTimeout(reloj); reloj = null; }
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(bucle);
    }

    let saludoPendiente = saludaUnaVezRef.current;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) { dormir(); return; }
      // El saludo de la sesión, la primera vez que se VE (no al montarse).
      if (saludoPendiente && !motor.quieto) {
        saludoPendiente = false;
        try { if (tomarSaludoDeSesion() && motor.saludar()) canvas.dataset.saludo = String(motor.saludos); } catch (err) { fallar(err); return; }
      }
      arrancar();
    });
    io.observe(canvas);
    const alVolver = () => { if (document.hidden) dormir(); else arrancar(); };
    document.addEventListener('visibilitychange', alVolver);
    const alCambiarMovimiento = () => { motor.quieto = reducido.matches; marcarQuieto(motor.quieto); arrancar(); };
    reducido.addEventListener('change', alCambiarMovimiento);

    // Claro ↔ oscuro: `PanelThemeProvider` pone `.dark` en un <div>, el padre del
    // anfitrión de portales, nunca en <html>. Fuera del panel no hay a quién
    // escuchar, y los tokens de :root no cambian.
    const contenedorTema = document.getElementById(ID_ANFITRION_PANEL)?.parentElement;
    const mo = contenedorTema ? new MutationObserver(() => {
      try {
        const p = leerPaleta();
        motor.ponerPaleta(p);
        motor.silueta = leerSilueta();
        marcarPaleta(p);
        arrancar();
      } catch (e) { fallar(e); }
    }) : null;
    if (contenedorTema) mo?.observe(contenedorTema, { attributes: true, attributeFilter: ['class'] });

    despertarRef.current = arrancar;
    arrancar();
    if (saludaAlAparecer) {
      try { if (motor.saludar()) canvas.dataset.saludo = String(motor.saludos); } catch (e) { fallar(e); }
    }

    return () => {
      dormir(); io.disconnect(); mo?.disconnect();
      document.removeEventListener('visibilitychange', alVolver);
      reducido.removeEventListener('change', alCambiarMovimiento);
      motor.destruir(); motorRef.current = null; despertarRef.current = () => {}; fallarRef.current = () => {};
    };
    // El motor se crea una vez por tamaño (y se suelta si ha fallado); el resto
    // de props se aplican abajo sin recrearlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tamano, fallo]);

  useEffect(() => {
    if (motorRef.current) motorRef.current.sonido = sonido;
    if (sonido) prepararSonidos();
  }, [sonido, tamano, fallo]);

  useEffect(() => { if (motorRef.current) { motorRef.current.miradas = miradas; despertarRef.current(); } }, [miradas, tamano, fallo]);

  useEffect(() => { motorRef.current?.mostrarInsignias(insignias); despertarRef.current(); }, [insignias]);

  useEffect(() => {
    estadoRef.current = estado;
    if (performance.now() < mareadoHasta.current) return;
    try { motorRef.current?.ponerEstado(estado); } catch (e) { fallarRef.current(e); return; }
    despertarRef.current();
  }, [estado]);

  // Los ojos siguen al cursor. Con «reducir movimiento», el motor no hace caso.
  useEffect(() => {
    if (!sigueCursor) return;
    const mover = (e: PointerEvent) => {
      const c = canvasRef.current, m = motorRef.current; if (!c || !m) return;
      const r = c.getBoundingClientRect();
      m.mira.x = Math.tanh((e.clientX - (r.left + r.width / 2)) / 260);
      m.mira.y = -Math.tanh((e.clientY - (r.top + r.height / 2)) / 200);
      despertarRef.current();
    };
    window.addEventListener('pointermove', mover, { passive: true });
    return () => window.removeEventListener('pointermove', mover);
  }, [sigueCursor]);

  // Hacia dónde mira cuando se lo dicen (el buscador: hacia lo que se
  // escribe). Si además sigue al cursor, manda lo último que pase: escribir o
  // mover el ratón. `fallo` va en las dependencias porque al rehacerse el
  // motor vuelve a mirar al frente.
  useEffect(() => {
    const m = motorRef.current;
    if (mira == null || !m) return;
    m.mira.x = Math.max(-1, Math.min(1, mira));
    m.mira.y = 0;
    despertarRef.current();
  }, [mira, sigueCursor, tamano, fallo]);

  // ⚠️ También con try/catch: quien llama puede estar a mitad de algo que no es
  // Tenti (la bienvenida pide 'feliz' justo después de guardar el logo), y un
  // fallo del dibujo no puede convertir ese guardado en un error.
  useImperativeHandle(ref, () => ({
    emocion: (e) => {
      const m = motorRef.current, c = canvasRef.current; if (!m || !c) return;
      try { m.emocion(e); } catch (err) { fallarRef.current(err); return; }
      c.dataset.emocion = e;
      despertarRef.current();
    },
    saludar: () => {
      const m = motorRef.current, c = canvasRef.current; if (!m || !c) return;
      try { if (m.saludar()) c.dataset.saludo = String(m.saludos); } catch (err) { fallarRef.current(err); return; }
      despertarRef.current();
    },
  }), []);

  function tocar() {
    const m = motorRef.current; if (!m) return;
    const n = performance.now();
    toques.current = [...toques.current.filter((t) => n - t < VENTANA_TOQUES_MS), n];
    m.aplastar();
    if (toques.current.length >= MAREO_TRAS_TOQUES) {
      toques.current = [];
      mareadoHasta.current = n + MAREO_MS;
      m.ponerEstado('mareado');
      setTimeout(() => { mareadoHasta.current = 0; motorRef.current?.ponerEstado(estadoRef.current); despertarRef.current(); }, MAREO_MS);
    } else if (toques.current.length >= 2) {
      m.emocion('molesto', 900);
    }
    despertarRef.current();
  }

  if (fallo) return <>{reserva}</>;

  return (
    <canvas
      ref={canvasRef}
      data-tenti=""
      data-estado={estado}
      {...(titulo ? { role: 'img', 'aria-label': titulo } : { 'aria-hidden': true })}
      onClick={interactivo ? tocar : undefined}
      // Tocarlo no le quita el foco a nadie (el campo del buscador sigue activo).
      onMouseDown={interactivo ? (e) => e.preventDefault() : undefined}
      className={className}
      style={{ width: tamano, height: tamano, ...(interactivo ? { cursor: 'pointer', touchAction: 'manipulation' } : null) }}
    />
  );
}
