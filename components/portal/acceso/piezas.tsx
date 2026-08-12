'use client';

// Las piezas comunes de la PUERTA de acceso del portal (handoff «Portal de la
// Socia — flujo de acceso, una sola puerta»).
//
// Viven aquí y no dentro de cada página porque los dos pasos —email y
// contraseña— son la MISMA pantalla contándose en dos tiempos: la portada se
// retira, el hilo avanza, los campos son idénticos. Duplicarlas garantizaba
// que se separaran al primer retoque, que es justo lo que pasó entre /acceso y
// /login (dos pantallas de acceso con dos maquetaciones distintas, que es de
// donde viene este rediseño).
//
// ⚠️ Nada de valores nuevos: forma, tipografía, sombra y curva salen de
// `lib/portal-design.ts`; los neutros de `useModo()`; el color de marca de las
// variables `--portal-brand*` que publica el tema del estudio. El handoff da
// los hex del tema Original como REFERENCIA, no como valores a escribir.

import { useId } from 'react';
import { EASE, dur, transicion, display, micro, texto, radio, altura, sombra } from '@/lib/portal-design';
import { useModo } from '@/lib/portal-modo';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';

/** El color de marca y su contraste, siempre a través del tema publicado. */
export const MARCA = 'var(--portal-brand, #343825)';
export const MARCA_FG = 'var(--portal-brand-foreground, #D9C29E)';

/**
 * Entrada escalonada de cada bloque.
 *
 * El diseño pide que la pantalla no aparezca de golpe sino por partes, con
 * 90 ms entre una y otra. Es una animación de ENTRADA, no de estado: se
 * declara con `animation` y no con `transition` porque no hay dos valores
 * entre los que interpolar, hay un elemento que llega.
 */
export function entrada(orden: number): React.CSSProperties {
  return {
    animation: `portal-rise-soft 700ms ${EASE} ${orden * 90}ms both`,
  };
}

/**
 * La foto del estudio teñida de marca. Sin foto propia, la de por defecto —
 * antes aquí quedaba el color plano, que es lo que veía toda propietaria que
 * acababa de darse de alta.
 *
 * El tinte (`multiply` al 72 % sobre el color de marca) es lo que hace que la
 * portada sea del ESTUDIO y no de la foto: cualquier imagen —una sala con luz
 * fría, un retrato, una captura del móvil— acaba en la misma familia de color
 * que el resto del portal. Es también lo que garantiza el contraste del texto
 * blanco encima sin depender de qué suba la propietaria. Y es lo que hace que
 * la foto por defecto no se note como foto de archivo: sale en la marca de
 * cada estudio, no en la suya.
 *
 * `alto` cambia entre los dos pasos (300 → 212): la portada se retira para
 * dejar sitio, y esa retirada es la que cuenta que se ha avanzado.
 */
export function PortadaAcceso({
  alto, fotoUrl, nombre, ciudad, progreso, tamNombre,
}: {
  alto: number;
  fotoUrl: string | null;
  nombre: string;
  ciudad?: string | null;
  /** 0–100. El hilo de arena del borde inferior. */
  progreso: number;
  tamNombre: number;
}) {
  const foto = imagenDeEstudio('portada', fotoUrl);
  return (
    <div
      style={{
        position: 'relative', height: alto, flex: 'none', overflow: 'hidden',
        background: MARCA,
        transition: transicion(['height'], dur.portada),
      }}
    >
      {
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt=""
          onError={alFallarImagen(IMAGENES_POR_DEFECTO.portada[0])}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            // El encuadre que eligió el estudio (theme.fotoEncuadre). Sin
            // token, centrado — que es lo que hacía antes.
            objectPosition: 'var(--portal-foto-pos, center center)',
            // ⚠️ `grayscale` ANTES del multiply, y esto no estaba en el
            // handoff: es la corrección tras verlo en producción.
            //
            // El handoff da como referencia el tema Original (oliva #343825),
            // un color oscuro y apagado: multiplicar por él ya deja un
            // duotono. Pero el diseño tiene que funcionar con CUALQUIER
            // preset, y con una marca clara y saturada —la lila de Pilates
            // Boutique— los tonos de piel sobrevivían al tinte y salían
            // verdosos: se leía como un filtro de Instagram mal puesto, no
            // como identidad.
            //
            // Quitar el color de la foto primero es la receta de duotono de
            // toda la vida: el resultado es del color de la marca, sea cual
            // sea, y no depende de qué haya en la imagen. El `contrast` de más
            // compensa lo que aplana el gris.
            filter: 'grayscale(1) contrast(1.08)',
            opacity: 0.72, mixBlendMode: 'multiply',
          }}
        />
      }
      {/* Degradado hacia el color de marca: ancla el bloque de texto de abajo
          sin necesitar una caja ni una sombra debajo de cada letra. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, transparent 30%, ${MARCA} 100%)`,
        }}
      />
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 26 }}>
        <p style={{ ...micro(9.5, 0.34), color: MARCA_FG }}>
          Pilates{ciudad ? ` · ${ciudad}` : ''}
        </p>
        <p
          style={{
            ...display(tamNombre, false, 1.02),
            color: '#F6F4EF', marginTop: 6,
            transition: transicion(['font-size'], dur.portada),
          }}
        >
          {nombre}
        </p>
      </div>
      <HiloProgreso progreso={progreso} />
    </div>
  );
}

/**
 * El hilo de arena del borde inferior de la portada.
 *
 * No es una barra de progreso al uso —no dice «paso 2 de 4»— porque el flujo
 * no tiene un número fijo de pasos: quien entra con contraseña hace dos y
 * quien pide un enlace hace cuatro. Lo que transmite es que se avanza, que es
 * lo único cierto en los dos caminos.
 */
function HiloProgreso({ progreso }: { progreso: number }) {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 1.5,
        background: 'rgba(246,244,239,.16)',
      }}
    >
      <div
        style={{
          height: '100%', width: `${progreso}%`, background: MARCA_FG,
          transition: transicion(['width'], dur.portada),
        }}
      />
    </div>
  );
}

/**
 * Campo de LÍNEA DE BASE, no cápsula.
 *
 * Es la diferencia visual más grande respecto a la pantalla anterior, y no es
 * estética: una cápsula con fondo es una caja que compite con el CTA, y en una
 * pantalla cuyo único trabajo es que escribas una cosa, la caja sobra. La
 * línea deja el texto a 19 px flotando sobre el fondo del portal.
 */
export function CampoLinea({
  etiqueta, tipo = 'text', valor, onChange, marcador, autoComplete, autoFocus, onEnter, sufijo, alto = 56, tamano = 19,
}: {
  etiqueta: string;
  tipo?: 'text' | 'email' | 'password';
  valor: string;
  onChange: (v: string) => void;
  marcador?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  /** El botón «ver» de la contraseña, anclado abajo a la derecha. */
  sufijo?: React.ReactNode;
  alto?: number;
  tamano?: number;
}) {
  const uid = useId();
  const { t } = useModo();
  return (
    <div style={{ position: 'relative' }}>
      <label htmlFor={uid} className="sr-only">{etiqueta}</label>
      <input
        id={uid}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }}
        placeholder={marcador ?? etiqueta}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={{
          width: '100%', height: alto, background: 'transparent',
          border: 'none', borderBottom: `1px solid ${t.line}`, borderRadius: 0,
          color: t.ink, fontFamily: texto.meta.fontFamily, fontSize: tamano,
          paddingRight: sufijo ? 56 : 0,
          outline: 'none',
          transition: transicion(['border-color'], dur.foco),
        }}
        onFocus={(e) => { e.currentTarget.style.borderBottomColor = MARCA; }}
        onBlur={(e) => { e.currentTarget.style.borderBottomColor = t.line; }}
      />
      {sufijo && (
        <div style={{ position: 'absolute', right: 0, bottom: 12 }}>{sufijo}</div>
      )}
    </div>
  );
}

/**
 * El CTA de la puerta: cápsula de 62 con el círculo y la flecha a la derecha.
 *
 * Apagado hasta que hay algo que enviar — y el `disabled` real acompaña a la
 * opacidad, que si no sería un botón que parece apagado y funciona. La flecha
 * entra desplazándose cuando se enciende: es la única señal de que ya se puede
 * seguir, en una pantalla sin más elementos.
 */
export function BotonCta({
  children, onClick, listo, cargando, tipo = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  /** Hay contenido válido: enciende el botón. */
  listo: boolean;
  cargando?: boolean;
  tipo?: 'button' | 'submit';
}) {
  const activo = listo && !cargando;
  return (
    <button
      type={tipo}
      onClick={onClick}
      disabled={!activo}
      style={{
        width: '100%', height: altura.botonCta, borderRadius: radio.botonCta,
        background: MARCA, color: MARCA_FG, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 9px 0 26px',
        boxShadow: sombra.cta,
        opacity: activo ? 1 : 0.4,
        cursor: activo ? 'pointer' : 'default',
        transition: transicion(['opacity', 'transform'], dur.foco),
      }}
    >
      <span style={{ ...texto.botonCta }}>{cargando ? 'Un momento…' : children}</span>
      <span
        aria-hidden
        style={{
          width: 44, height: 44, borderRadius: 22, flex: 'none',
          background: 'rgba(246,244,239,.14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16,
          transform: activo ? 'none' : 'translateX(-8px)',
          opacity: activo ? 1 : 0,
          transition: transicion(['transform', 'opacity'], dur.foco),
        }}
      >
        →
      </span>
    </button>
  );
}

/** El error de un campo: pequeño, rojo y pegado debajo. Nunca un cuadro. */
export function ErrorCampo({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" style={{ ...texto.nota, fontSize: 11.5, color: '#B0453A', marginTop: 14 }}>
      {children}
    </p>
  );
}
