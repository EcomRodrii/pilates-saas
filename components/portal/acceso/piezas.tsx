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
// ⚠️ COLOR DEL KIT (`--ap-*`, app/portal/[slug]/portal-app.css), no del tema
// del estudio. Esta pantalla se pintaba con `--portal-brand*` y los neutros de
// `useModo()`; al convertir el portal al kit "Tentare Studio App" pasa a la
// paleta fija, como el resto. Forma, curva y tipografía siguen saliendo de
// `lib/portal-design.ts` mientras esa parte no esté migrada.

import { useId } from 'react';
import { EASE, dur, transicion, micro, texto, radio, altura, sombra } from '@/lib/portal-design';
import { imagenDeEstudio, alFallarImagen, IMAGENES_POR_DEFECTO } from '@/lib/imagenes-por-defecto';

/**
 * El fondo oscuro de la puerta y la tinta clara que va encima.
 *
 * ⚠️ SALEN DEL KIT (`--ap-*`), no del tema del estudio. Antes eran
 * `--portal-brand` / `--portal-brand-foreground`, es decir la puerta se
 * pintaba del color de CADA estudio. Decisión explícita del fundador al
 * convertir el portal: el portal se ve idéntico al prototipo, y eso incluye
 * la primera pantalla.
 *
 * Consecuencia asumida: la puerta de todos los estudios es la misma. Lo que
 * NO se pierde es el contraste garantizado — el duotono de la foto (ver
 * `PortadaAcceso`) se mantiene, solo que ahora tiñe hacia el verde noche del
 * kit en vez de hacia la marca. Sin ese tinte, el texto claro dependería de
 * qué foto suba cada propietaria.
 */
export const MARCA = 'var(--ap-verde-noche, #12291A)';
export const MARCA_FG = 'var(--ap-fondo, #FAF9F5)';
/**
 * La tinta de las micro-etiquetas sobre el fondo oscuro. El kit las pinta en
 * verde claro (`--ap-verde-claro`), no en el mismo crema del titular: es lo
 * que las separa de la jerarquía principal sin bajarles el contraste.
 */
export const MARCA_ETIQUETA = 'var(--ap-verde-claro, #A8D0A9)';

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
 * La foto del estudio teñida del verde noche del kit. Sin foto propia, la de
 * por defecto — antes aquí quedaba el color plano, que es lo que veía toda
 * propietaria que acababa de darse de alta.
 *
 * El tinte (`multiply` al 72 %) es lo que hace que la portada sea del PORTAL y
 * no de la foto: cualquier imagen —una sala con luz fría, un retrato, una
 * captura del móvil— acaba en la misma familia de color. Y es lo que garantiza
 * el contraste del texto claro encima sin depender de qué suba la propietaria.
 *
 * ⚠️ Hasta la conversión al kit este tinte era el color de MARCA del estudio,
 * y ahí cumplía además una tercera función: que la portada se viera de cada
 * estudio. Esa función se ha perdido a propósito (ver `MARCA` arriba); las
 * otras dos se conservan intactas.
 *
 * `alto` cambia entre los dos pasos (300 → 212): la portada se retira para
 * dejar sitio, y esa retirada es la que cuenta que se ha avanzado.
 *
 * ⚠️ Una sola línea de identidad (nombre · ciudad), no dos — verificado contra
 * las capturas reales: el prototipo nunca repite el nombre del estudio en
 * grande encima de la foto (esa fue la lectura errónea de un handoff previo,
 * que hardcodeaba la palabra "Pilates" en la línea mono y el nombre real
 * debajo, en grande — con un estudio como "Studio Alma" se leía "Pilates ·
 * Barcelona" / "Studio Alma", duplicando la identidad en dos tamaños).
 */
export function PortadaAcceso({
  alto, fotoUrl, nombre, ciudad, progreso,
}: {
  alto: number;
  fotoUrl: string | null;
  nombre: string;
  ciudad?: string | null;
  /** 0–100. El hilo de arena del borde inferior. */
  progreso: number;
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
            // ⚠️ SIN duotono por multiply, a diferencia de antes. Medido: con
            // el verde noche del kit (#12291A) el multiply al 72 % dejaba la
            // foto en luminancia media 18/255 — prácticamente negra. Con el
            // oliva de marca de antes (#343825) daba 28, que ya era oscuro
            // pero dejaba leer la sala. El kit es más oscuro que cualquier
            // marca, así que la receta que servía con el tema ya no sirve.
            //
            // El kit no usa duotono para foto bajo texto: usa DEGRADADO
            // (`rgba(18,41,26,.95) → .68`, CHEATSHEET-CSS.md, tarjeta "Tu
            // próxima clase"), que es lo que deja ver la foto y a la vez
            // garantiza el texto. Aquí el único texto sobre la imagen es la
            // etiqueta mono de abajo, y justo ahí el degradado de más abajo ya
            // llega al 100 % de opacidad — o sea que su contraste no depende
            // de la foto, igual que antes no dependía.
            //
            // Se conserva algo de `grayscale` para que la portada siga siendo
            // de la familia del portal y no de los colores de la foto.
            filter: 'grayscale(.55) contrast(1.05)',
            opacity: 0.9,
          }}
        />
      }
      {/* Degradado hacia el verde noche: ancla el bloque de texto de abajo sin
          necesitar una caja ni una sombra debajo de cada letra.
          Con el duotono fuera (ver el filtro de arriba) este degradado pasa a
          ser lo ÚNICO que garantiza el contraste de la etiqueta, así que se
          refuerza: empieza antes (18 % en vez de 30 %) y pasa por un tramo
          intermedio al 72 %, en vez de saltar de transparente a opaco. */}
      <div
        aria-hidden
        style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(180deg, transparent 18%, rgba(18,41,26,.72) 62%, ${MARCA} 100%)`,
        }}
      />
      <div style={{ position: 'absolute', left: 30, right: 30, bottom: 26 }}>
        <p style={{ ...micro(9.5, 0.34), color: MARCA_ETIQUETA }}>
          {nombre}{ciudad ? ` · ${ciudad}` : ''}
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
 * Campo en cápsula — mismo tratamiento que el resto del portal
 * (`components/portal/ui/Input.tsx`) y que el diseño real ("Crea tu cuenta").
 *
 * Antes era una línea de base sin caja, a propósito ("una cápsula con fondo
 * compite con el CTA") — decisión revertida: la puerta es la única pantalla
 * del portal con ese tratamiento distinto, y de las cinco marcadas por el
 * fundador como no fieles al diseño real, esta era una de las dos con
 * hueco genuino (la otra, el botón de Apple, se queda fuera — no hay
 * proveedor configurado, y un botón que no entra es peor que no tenerlo).
 */
export function CampoLinea({
  etiqueta, tipo = 'text', valor, onChange, marcador, autoComplete, autoFocus, onEnter, sufijo, alto = 56, tamano = 17,
}: {
  etiqueta: string;
  tipo?: 'text' | 'email' | 'password';
  valor: string;
  onChange: (v: string) => void;
  marcador?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  /** El botón «ver» de la contraseña, anclado a la derecha, centrado en vertical. */
  sufijo?: React.ReactNode;
  alto?: number;
  tamano?: number;
}) {
  const uid = useId();
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
        // Superficie, borde y tinta del kit (`--ap-*`), no de `useModo()`:
        // el campo vive sobre la hoja clara de la puerta, que ya es
        // `--ap-fondo`, y con los neutros del tema no cuadraban.
        style={{
          width: '100%', height: alto, background: 'var(--ap-card, #FFFFFF)',
          border: `1.5px solid var(--ap-borde, #E5E3DA)`, borderRadius: radio.card,
          color: 'var(--ap-tinta, #1A1A1A)', fontFamily: texto.meta.fontFamily, fontSize: tamano,
          padding: `0 ${sufijo ? 56 : 20}px 0 20px`,
          outline: 'none',
          transition: transicion(['border-color'], dur.foco),
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = '#4F8A5B'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ap-borde, #E5E3DA)'; }}
      />
      {sufijo && (
        <div style={{ position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)' }}>{sufijo}</div>
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
