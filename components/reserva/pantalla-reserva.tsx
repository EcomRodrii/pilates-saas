'use client';

// Fase 2 del rediseño de la reserva (pedido explícito del fundador, 2026-08):
// "que deje de sentirse como un modal disfrazado y pase a ser una pantalla
// propia de Tentare". Referencia de UX: Momence (`secretstudiofit.com/reserva`
// → "Reservar ahora"), auditada en vivo — un solo scroll continuo (datos +
// código promocional + pago), sin pasos fragmentados tipo wizard, dos
// columnas en escritorio que se apilan en una en móvil. Documentado en
// `docs/rediseno-pantalla-reserva-diseno.md` (Fase 1).
//
// v2 (mismo día): la v1 usaba estilos sueltos inventados y quedó plana
// comparada con Momence/Timp/Bsport — feedback directo del fundador. La causa
// real: ignoraba el lenguaje visual que YA usa el resto de esta misma página
// (`lib/reservar-publico-tokens.ts` — radios/sombras/eyebrows/`cq()`, ya
// aplicado en las tarjetas de bonos de más abajo en page.tsx). v2 lo adopta
// tal cual en vez de reinventarlo.
//
// F4 del rediseño «/reservar = estilo de la app de la alumna» (29-sep-2026):
// la misma pantalla habla ahora el idioma de la app. Lo que cambió, y por qué:
//
//   · La clase va en una foto con velo y, encima, el nivel, el nombre y los
//     chips —la cabecera de la ficha de la app, compartida con la ficha de
//     /reservar (components/reserva/heroe-clase.tsx)— y ya no en una foto 5:4
//     con la instructora, tres chips en mono, una tarjeta de sala y la
//     descripción apilados debajo. En el móvil eso se comía la primera
//     pantalla entera: «Tus datos» empezaba en y≈750 de 844.
//   · En el móvil el formulario va JUSTO DEBAJO de la foto, y los detalles de
//     la clase (instructora, las filas Cuándo / Dónde / Plazas / Cancelación de
//     lib/reservar/ficha-clase.ts y la descripción) pasan detrás: quien llega
//     aquí ya ha elegido la clase y viene a dar sus datos. En escritorio, dos
//     columnas como siempre: la clase a la izquierda y los datos y el pago a la
//     derecha (la rejilla con nombre de áreas vive en app/globals.css, bajo
//     `.pantalla-reserva-grid`).
//   · Los campos, el selector de lo que se compra y el código tienen el
//     aspecto de los de la app (campo de 50 px, opciones en filas con su
//     radio, etiqueta en versales).
//
// ⚠️ Lo que NO cambia —es dinero—: la validación del código (el debounce y
// `/api/public/validar-codigo-descuento`), `onContinuar`, `camposFaltantes` y
// su «Falta: …», la casilla de privacidad, y `CheckoutEmbebido` por dentro,
// Bizum y `onExito`. Solo cambia lo que los rodea.
//
// Cubre HOY solo "datos"+"pago" del flujo "pagar y reservar sin login previo"
// (docs/reserva-sin-login-diseno.md). La pantalla de éxito ('done') NO se toca
// aquí.
//
// Monta DENTRO de <PublicSheet inline> (page.tsx) — reutiliza toda la lógica
// ya resuelta de esa hoja para el iframe embebido (franja visible, safe-area).
// Este fichero NO lo compila el bundle del widget nativo: sí puede usar las
// clases `pantalla-reserva-*` de app/globals.css.
import { useState, useEffect, useId, useMemo, useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { ChevronLeft, Tag, Lock, ShieldCheck, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import type { PlanTarifa } from '@/lib/types';
import type { ModoTokens } from '@/lib/portal-modo';
import { serif, sans, cq, radius as R, shadow as SH, EASE, pesoTitular, textoSemantico } from '@/lib/reservar-publico-tokens';
import { fmtTime, fmtLong, telefonoValido } from '@/lib/reservar/formato';
import { imagenDeClase, alFallarImagen, IMAGENES_CLASE } from '@/lib/imagenes-por-defecto';
import { hoyEnEstudio } from '@/lib/utils';
import { cuandoCorto, filasFicha, rolInstructora } from '@/lib/reservar/ficha-clase';
import { HeroeClase, estiloChipSobreFoto } from '@/components/reserva/heroe-clase';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { SpotPickerPublico } from '@/components/reserva/spot-picker-publico';

export interface DatosContacto {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
}

export interface InfoAdicional {
  genero: string;
  comoConociste: string;
  codigoPostal: string;
  /** ISO `yyyy-mm-dd` (valor nativo de `<input type="date">`). */
  fechaNacimiento: string;
}

export interface ClaseParaPantallaReserva {
  nombre: string;
  color: string;
  fotoUrl: string | null;
  descripcion: string | null;
  inicio: string;
  fin: string;
  duracionMinutos: number | null;
  instructorNombre: string | null;
  /** Su foto, si la ha subido: la tarjeta de la instructora, como en la app. Sin ella, sus iniciales. */
  instructorFotoUrl?: string | null;
  /** `PROPIETARIO` → «Directora»; cualquier otro → «Instructora». */
  instructorRol?: string | null;
  salaNombre: string | null;
  nivel: string | null;
  /** Plazas libres — chip sobre la foto y fila «Capacidad»/«Plazas». `null`
   *  si el aforo no aplica (p. ej. citas 1:1), nunca un número inventado. */
  plazasLibres: number | null;
  /** El aforo, para decir «10 personas · 6 libres» como la app. Sin él, solo las libres. */
  aforoMaximo?: number | null;
}

/** Los radios del widget, ya resueltos (`radiosDe`). Sin pasarlos, los de la app. */
const RADIOS_POR_DEFECTO = { tarjeta: R.card, boton: R.pill, input: 14 };

/** La micro-etiqueta en versales de la app (`.t-label`), con los tokens de /reservar. */
const etiqueta: CSSProperties = {
  margin: 0, fontFamily: sans, fontSize: 11, fontWeight: 800, letterSpacing: '.1em',
  textTransform: 'uppercase', color: 'var(--portal-muted)',
};

export function PantallaReserva({
  t, onVolver, estudioNombre, ocultarNombreEstudio, estudioDireccion, studioId, clase, precio, fase,
  loginForm, onChangeLoginForm, datosError, datosCargando,
  privacidadAceptada, onTogglePrivacidad, onAbrirPrivacidad,
  mostrarCodigo, onMostrarCodigo, codigoDescuento, onChangeCodigo,
  onContinuar, pago,
  planesOpciones, planSeleccionadoId, onCambiarPlan, sinCodigo = false,
  spotPicker, infoAdicional, onChangeInfoAdicional,
  ventanaCancelacionHoras = null, radios = RADIOS_POR_DEFECTO, densidadEsc = 1,
}: {
  t: ModoTokens;
  /** "‹ Volver a la clase" — un único punto de salida, no un "atrás" por paso. */
  onVolver: () => void;
  estudioNombre: string;
  /** La página ya pinta la cabecera del estudio encima: no repetir su nombre. */
  ocultarNombreEstudio?: boolean;
  /**
   * La calle del estudio, sin la ciudad: la fila «Dónde» dice lo mismo que en
   * la ficha de la clase («Calle Larios 1 · Sala Mat»), que tampoco la lleva.
   * Vacía = solo la sala.
   */
  estudioDireccion: string;
  /** Solo para validar el código promocional en vivo (`/api/public/validar-codigo-descuento`). */
  studioId: string;
  clase: ClaseParaPantallaReserva;
  precio: number;
  fase: 'datos' | 'pago';
  loginForm: DatosContacto;
  onChangeLoginForm: (patch: Partial<DatosContacto>) => void;
  datosError: string;
  datosCargando: boolean;
  privacidadAceptada: boolean;
  onTogglePrivacidad: (v: boolean) => void;
  onAbrirPrivacidad: () => void;
  mostrarCodigo: boolean;
  onMostrarCodigo: () => void;
  codigoDescuento: string;
  onChangeCodigo: (v: string) => void;
  onContinuar: () => void;
  /** Solo se necesita cuando `fase === 'pago'`. */
  pago?: {
    plan: PlanTarifa;
    clientSecret: string;
    publishableKey: string;
    stripeAccountId: string;
    ventanaCancelacionHoras: number;
    textoBoton: string;
    fuentePago?: { familia: string; cssSrc: string | null };
    radioInput?: number;
    onExito: () => void;
    onVolverADatos: () => void;
    // Bizum: fuera del Payment Element a propósito (redirect, no cabe en el
    // checkout embebido). Sin esta prop, `<CheckoutEmbebido>` no pinta el
    // botón — mismo criterio que ya usa el widget embebible (Modo B).
    onBizum?: (aceptaCondiciones: boolean) => void;
  };
  /** "Bonos y mensualidades del estudio": solo cuando hay más de un plan
   *  PUNTUAL que cubre la clase — con uno solo, se auto-elige sin preguntar. */
  planesOpciones?: PlanTarifa[];
  planSeleccionadoId?: string;
  onCambiarPlan?: (plan: PlanTarifa) => void;
  /** Sin el campo de código promocional (la «clase de prueba» ya es la oferta). */
  sinCodigo?: boolean;
  /** "Elige tu plaza": solo cuando la sala tiene mapa de sitios y la clase no
   *  está llena (la lista de espera no ocupa sitio, igual que en 'confirm'). */
  spotPicker?: {
    spots: { id: string; nombre: string; fila: number; columna: number }[];
    takenIds: Set<string>;
    selected: string | null;
    onSelect: (id: string | null) => void;
    primary: string;
  };
  infoAdicional: InfoAdicional;
  onChangeInfoAdicional: (patch: Partial<InfoAdicional>) => void;
  /**
   * La ventana de cancelación REAL de esta clase (la de su tipo, si tiene la
   * suya), para la fila «Cancelación» — la misma cifra que ya dice la línea de
   * confianza del pago. `0`/`null` = sin fila.
   */
  ventanaCancelacionHoras?: number | null;
  /**
   * Las esquinas del widget (`radiosDe(apariencia)`): en el widget incrustado,
   * `forma`/`radio` del estudio siguen mandando también aquí. En la página
   * suelta llegan las de por defecto.
   */
  radios?: { tarjeta: number; boton: number; input: number };
  /** `escalaDensidad(apariencia)`: 0.75 con «compacta», 1 si no. */
  densidadEsc?: number;
}) {
  const [ctaHover, setCtaHover] = useState(false);
  // ⚠️ Auditoría de conversión (2026-08-31): "Información adicional" (4
  // campos opcionales) se pintaba SIEMPRE expandida, entre los datos
  // obligatorios y el resto del checkout — alargaba justo la pantalla de
  // mayor fricción (primera reserva de pago) sin aportar nada a la decisión
  // de reservar. Cerrada por defecto, tras un disclosure; se abre sola si ya
  // hay algo escrito (p. ej. al volver de "pago" a "datos" con
  // `onVolverADatos`, que no desmonta este componente).
  const [infoAdicionalAbierta, setInfoAdicionalAbierta] = useState(
    () => !!(infoAdicional.genero || infoAdicional.comoConociste || infoAdicional.codigoPostal || infoAdicional.fechaNacimiento)
  );
  const camposIncompletos = camposFaltantes(loginForm, privacidadAceptada);
  const formValido = camposIncompletos.length === 0;
  const ctaActivo = formValido && !datosCargando;
  const idPlanes = useId();
  const idCodigo = useId();
  const grupoPlanesRef = useRef<HTMLDivElement>(null);

  // Código promocional — feedback en vivo (Fase 3 del rediseño). Solo UI: el
  // servidor SIEMPRE recalcula al pagar (`checkout-embebido`, ya existente,
  // sin tocar) — un código inválido nunca bloquea la compra, esto solo evita
  // que la única forma de enterarse fuera mirar el importe ya dentro del
  // Payment Element.
  const [codigoEstado, setCodigoEstado] = useState<'idle' | 'validando' | 'valido' | 'invalido'>('idle');
  const [codigoDescuentoEur, setCodigoDescuentoEur] = useState<number | null>(null);
  const [codigoMotivo, setCodigoMotivo] = useState('');
  const codigoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codigoPeticion = useRef(0);

  useEffect(() => {
    if (codigoTimer.current) clearTimeout(codigoTimer.current);
    const texto = codigoDescuento.trim();
    // Sin texto, no hay nada que pedir: `codigoEstadoMostrado` de abajo ya
    // deriva 'idle' directamente del valor vacío, sin esperar a ningún
    // setState — así se borra al instante al pulsar la X, y el efecto no
    // llama a setState de forma síncrona en su propio cuerpo (lo único que
    // dispararía el aviso de cascading-renders de react-hooks).
    if (!texto) return;
    const miPeticion = ++codigoPeticion.current;
    // Debounce: no se valida en cada tecla, solo cuando la persona hace una
    // pausa real al escribir — mismo criterio que cualquier buscador.
    codigoTimer.current = setTimeout(() => {
      if (miPeticion !== codigoPeticion.current) return;
      setCodigoEstado('validando');
      fetch('/api/public/validar-codigo-descuento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studioId, codigo: texto, subtotal: precio }),
      })
        .then(r => r.json())
        .then((data: { ok?: boolean; descuento?: number; motivo?: string }) => {
          // Una respuesta tardía de una petición vieja (p.ej. si se sigue
          // escribiendo) no debe pisar el estado de la petición más reciente.
          if (miPeticion !== codigoPeticion.current) return;
          if (data.ok) { setCodigoEstado('valido'); setCodigoDescuentoEur(data.descuento ?? 0); }
          else { setCodigoEstado('invalido'); setCodigoMotivo(data.motivo ?? 'Ese código no es válido'); }
        })
        .catch(() => {
          if (miPeticion !== codigoPeticion.current) return;
          // Fallo de red al validar: no se anuncia como "código inválido"
          // (sería falso) — el servidor lo resolverá igualmente al pagar.
          setCodigoEstado('idle');
        });
    }, 500);
    return () => { if (codigoTimer.current) clearTimeout(codigoTimer.current); };
  }, [codigoDescuento, studioId, precio]);

  const codigoEstadoMostrado = codigoDescuento.trim() ? codigoEstado : 'idle';
  // Verde de «código aplicado» y rojo de los errores, legibles sobre la
  // tarjeta que se ve: antes eran un `#2f7a4f` y el `--destructive` del panel,
  // fijados para fondo claro (sobre Carbón no llegaban a AA).
  const colorOk = textoSemantico('success', t);
  const colorError = textoSemantico('danger', t);
  const precioConDescuento = codigoEstadoMostrado === 'valido' && codigoDescuentoEur != null
    ? Math.max(0, Math.round((precio - codigoDescuentoEur) * 100) / 100)
    : null;

  // La clase, contada igual que en su ficha (lib/reservar/ficha-clase.ts). «Hoy»
  // es el del estudio, una vez: no cambia mientras se rellena el formulario.
  const hoy = useMemo(() => hoyEnEstudio(), []);
  const chipsFoto = [
    cuandoCorto(clase.inicio, hoy),
    ...(clase.duracionMinutos != null ? [`${clase.duracionMinutos} min`] : []),
    ...(clase.salaNombre ? [clase.salaNombre] : []),
  ];
  const filas = filasFicha({
    inicio: clase.inicio, fin: clase.fin, hoy,
    salaNombre: clase.salaNombre, direccion: estudioDireccion,
    aforoMaximo: clase.aforoMaximo, libres: clase.plazasLibres,
    ventanaCancelacionHoras: ventanaCancelacionHoras ?? pago?.ventanaCancelacionHoras ?? null,
  });

  // Teclado del selector de lo que se compra (patrón «radio group» de WAI-ARIA):
  // las flechas cambian de opción y se lleva el foco con ella; Tab entra y sale
  // del grupo de una vez (solo la elegida es tabulable).
  function alTecladoPlanes(e: KeyboardEvent<HTMLDivElement>) {
    if (!planesOpciones || !onCambiarPlan) return;
    const paso = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const i = Math.max(0, planesOpciones.findIndex(p => p.id === planSeleccionadoId));
    const siguiente = (i + paso + planesOpciones.length) % planesOpciones.length;
    onCambiarPlan(planesOpciones[siguiente]);
    grupoPlanesRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[siguiente]?.focus();
  }

  return (
    <div style={{
      minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: sans, background: 'var(--portal-bg)',
      // La forma y la densidad del estudio, en el mismo canal que el calendario
      // (`--reservar-radio-*`, `--reservar-densidad-esc`): lo que viene del
      // widget incrustado gana aquí también.
      '--reservar-radio-tarjeta': `${radios.tarjeta}px`,
      '--reservar-radio-boton': `${radios.boton}px`,
      '--reservar-radio-input': `${radios.input}px`,
      '--reservar-densidad-esc': densidadEsc,
    } as CSSProperties}>
      {/* Único scroll natural de la pantalla — nada de overflow anidado ni
          `100vh` fijo: el contenedor padre (PublicSheet en modo pantalla
          completa) ya resuelve `dvh`/franja del iframe/safe-area. */}
      {/* `overscrollBehavior: 'contain'` no es cosmético: sin `footer`,
          `PublicSheet` no envuelve `children` en su wrapper de scroll de
          siempre (ese sí lo lleva) — este div es el ÚNICO contenedor con
          scroll, y sin contenerlo, al llegar al final el scroll encadena
          hacia la página de debajo (el "doble scroll" que la Fase 4 pide
          evitar explícitamente). */}
      {/* La cabecera va DENTRO del contenedor (F4) para que la alcance su
          consulta de contenedor: en escritorio se alinea con las dos columnas
          de abajo, y en el móvil con el borde de la foto. */}
      <div className="pantalla-reserva-contenedor" style={{ flex: '1 1 auto', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {/* Cabecera minimalista — un único "‹ volver", nunca "‹ Datos"/"‹ Pago":
            es la pieza que más se nota cuando se compara con Momence, cuyo
            checkout entero es un scroll sin ningún control de "paso anterior"
            salvo el propio del navegador. */}
        <header className="pantalla-reserva-cabecera" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          paddingBlock: cq(4, 0.8, 10), borderBottom: '1px solid var(--portal-line)',
        }}>
          <button type="button" onClick={fase === 'pago' && pago ? pago.onVolverADatos : onVolver}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, background: 'none', border: 'none',
              cursor: 'pointer', color: 'var(--portal-muted)', fontFamily: sans, fontSize: 13.5, fontWeight: 700, padding: 0,
              flexShrink: 0,
            }}>
            <ChevronLeft size={17} strokeWidth={2.5} aria-hidden />
            {fase === 'pago' ? 'Editar mis datos' : 'Volver a la clase'}
          </button>
          {/* Fase 4 (mobile-first): sin `minWidth: 0` un hijo de flex nunca
              encoge por debajo del ancho de su contenido — el nombre de un
              estudio largo empujaba la cabecera fuera del viewport en un
              Android estrecho (360px) en vez de truncarse. */}
          {!ocultarNombreEstudio && (
            <span style={{
              fontFamily: serif, fontSize: cq(14, 1.6, 16), color: 'var(--portal-ink)', letterSpacing: '-0.01em',
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 12,
            }}>
              {estudioNombre}
            </span>
          )}
        </header>

        <div
          className="pantalla-reserva-grid"
          style={{
            paddingTop: cq(14, 2.2, 32),
            // Fase 4 (mobile-first): la franja del gesto de inicio de iPhone se
            // suma al aire de siempre, no lo sustituye — `viewportFit: 'cover'`
            // ya está declarado en app/reservar/[slug]/layout.tsx.
            paddingBottom: `calc(${cq(40, 6, 64)} + env(safe-area-inset-bottom, 0px))`,
            display: 'grid', gap: cq(14, 2.4, 28),
          }}
        >
          {/* ── La clase: foto a sangre con velo, y encima el nivel, el nombre
              y los chips. El nombre es el `h1` de esta pantalla (mientras se
              reserva, la portada de la página no se pinta). ── */}
          <div className="pantalla-reserva-heroe">
            <HeroeClase
              foto={
                // eslint-disable-next-line @next/next/no-img-element -- foto de catálogo o subida por el estudio, no un asset conocido en build
                <img
                  src={imagenDeClase(clase)}
                  alt=""
                  decoding="async"
                  onError={alFallarImagen(IMAGENES_CLASE.generica)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: clase.color }}
                />
              }
              alto={cq(196, 26, 320)}
              radio="var(--reservar-radio-tarjeta, 20px)"
              antetitulo={clase.nivel}
              titulo={clase.nombre}
              nivelTitulo={1}
              tamanoTitulo={cq(24, 2.8, 32)}
              chips={chipsFoto}
              arribaDerecha={clase.plazasLibres !== null ? (
                <span style={estiloChipSobreFoto}>
                  {clase.plazasLibres} {clase.plazasLibres === 1 ? 'plaza' : 'plazas'}
                </span>
              ) : undefined}
            />
          </div>

          {/* ── La superficie de pago ──
              Una tarjeta elevada de verdad, no texto flotando sobre el fondo —
              es la convención que Stripe Checkout, Bsport y Momence comparten:
              la zona donde se paga se distingue de la zona donde se informa.
              En el móvil va JUSTO debajo de la foto (orden del DOM); en
              escritorio, en su columna de la derecha (áreas de la rejilla). */}
          <div className="pantalla-reserva-tarjeta" style={{
            background: 'var(--portal-surface)', border: '1px solid var(--portal-line)',
            borderRadius: `var(--reservar-radio-tarjeta, ${R.card}px)`, boxShadow: SH.card,
            padding: `calc(${cq(20, 2.6, 30)} * var(--reservar-densidad-esc, 1)) calc(${cq(18, 2.6, 30)} * var(--reservar-densidad-esc, 1))`,
            display: 'flex', flexDirection: 'column', gap: cq(18, 2, 22), minWidth: 0,
          }}>
            {fase === 'datos' && (
              <div key="datos" className="pantalla-reserva-seccion" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  {/* ⚠️ Auditoría de conversión (2026-08-31): decía "Paso
                      final" aquí, pero tras "Continuar al pago" viene la
                      pantalla de pago completa — `fase === 'pago'` no lleva
                      ningún eyebrow de paso, y aquí tampoco: no se promete un
                      conteo que el propio flujo no sostiene. */}
                  <h2 style={{
                    margin: 0, fontFamily: serif, fontWeight: pesoTitular(800), fontSize: cq(22, 2.2, 25),
                    lineHeight: 1.1, letterSpacing: '-.02em', color: 'var(--portal-ink)',
                  }}>
                    Tus datos
                  </h2>
                  <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--portal-muted-2)', lineHeight: 1.5 }}>
                    No necesitas crear una cuenta: al reservar te creamos el acceso para gestionar tus próximas clases.
                  </p>
                </div>

                {/* "Tus datos" — diseño "Tentare Portal Reservas": UN solo
                    campo "Nombre y apellido" (nunca Nombre/Apellidos por
                    separado — `entregarPlanComprado` ya sabe partir un nombre
                    compuesto), Email y Móvil en una fila de dos columnas. Con
                    `autoComplete`, el navegador los rellena de un toque. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <CampoTexto placeholder="Nombre y apellido" value={loginForm.nombre}
                    onChange={v => onChangeLoginForm({ nombre: v })}
                    autoComplete="name" autoFocus />
                  <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
                    <CampoTexto type="email" placeholder="Email" value={loginForm.email}
                      onChange={v => onChangeLoginForm({ email: v })}
                      autoComplete="email" inputMode="email" />
                    <CampoTexto type="tel" placeholder="Móvil" value={loginForm.telefono}
                      onChange={v => onChangeLoginForm({ telefono: v })}
                      autoComplete="tel" inputMode="tel"
                      onEnter={onContinuar} />
                  </div>
                  {datosError && (
                    <p role="alert" style={{ margin: 0, color: colorError, fontSize: 13 }}>{datosError}</p>
                  )}
                </div>

                {/* "Información adicional" — cerrada por defecto (ver
                    auditoría de conversión arriba, 2026-08-31): un disclosure
                    la saca del camino directo hacia el CTA sin perder el dato
                    para quien sí quiera rellenarlo. */}
                <div>
                  {infoAdicionalAbierta ? (
                    <p style={{ ...etiqueta, marginBottom: 8 }}>
                      Información adicional <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: 'none' }}>· solo te lo pedimos la primera vez</span>
                    </p>
                  ) : (
                    <button type="button" onClick={() => setInfoAdicionalAbierta(true)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, minHeight: 32, border: 'none', background: 'none',
                        padding: 0, fontFamily: sans, fontSize: 13, fontWeight: 700, color: 'var(--portal-muted)', cursor: 'pointer',
                      }}>
                      + Cuéntanos un poco más <span style={{ fontWeight: 500 }}>(opcional)</span>
                    </button>
                  )}
                  {/* ⚠️ Intentado y revertido (2026-08-29): cambiar a
                      `auto-fit`/`minmax` colapsaba esta rejilla a una sola
                      columna también en MÓVIL — reproducido en local con
                      e2e/reservar-modal-movil.spec.ts. `1fr 1fr` coincide con
                      el .dc.html; no se toca sin una forma de estrechar SOLO
                      el rango de anchura intermedio. */}
                  {infoAdicionalAbierta && (
                    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
                      <CampoSelect placeholder="Género" value={infoAdicional.genero}
                        onChange={v => onChangeInfoAdicional({ genero: v })}
                        opciones={[['mujer', 'Mujer'], ['hombre', 'Hombre'], ['prefiero-no-decirlo', 'Prefiero no decirlo']]} />
                      <CampoSelect placeholder="¿Cómo nos has conocido?" value={infoAdicional.comoConociste}
                        onChange={v => onChangeInfoAdicional({ comoConociste: v })}
                        opciones={[['instagram', 'Instagram'], ['google', 'Google'], ['amiga', 'Una amiga'], ['paso-por-delante', 'Paso por delante']]} />
                      <CampoTexto placeholder="Código postal" value={infoAdicional.codigoPostal}
                        onChange={v => onChangeInfoAdicional({ codigoPostal: v })} autoComplete="postal-code" />
                      <CampoTexto placeholder="Cumpleaños · dd/mm/aaaa" value={infoAdicional.fechaNacimiento}
                        onChange={v => onChangeInfoAdicional({ fechaNacimiento: v })} />
                    </div>
                  )}
                </div>

                {/* "Elige tu plaza" — mismo componente que ya usa la pantalla
                    'confirm' de socia autenticada (components/reserva/
                    spot-picker-publico.tsx). Opcional: sin elegir, el servidor
                    asigna cualquier sitio libre al confirmar el pago. */}
                {spotPicker && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
                      <p style={etiqueta}>Elige tu plaza</p>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-muted)' }}>
                        {spotPicker.spots.length - spotPicker.takenIds.size === 0
                          ? 'clase completa'
                          : `quedan ${spotPicker.spots.length - spotPicker.takenIds.size} de ${spotPicker.spots.length}`}
                      </span>
                    </div>
                    <SpotPickerPublico {...spotPicker} />
                  </div>
                )}

                {/* Qué se está comprando para poder reservar esta clase.
                    SIEMPRE visible, aunque solo haya una opción — confirmar el
                    importe antes de pagar es la mitad del trabajo de esta
                    pantalla. Cada opción dice CUÁNTAS clases da y cuándo
                    caduca: quien paga 120 € tiene que ver que se lleva diez
                    clases y no la de hoy. En filas con su radio, como las
                    opciones de la app, y no en dos columnas de cajitas: a 390
                    px el nombre de un bono se partía en tres líneas. */}
                {planesOpciones && onCambiarPlan && (
                  <div>
                    <p id={idPlanes} style={{ ...etiqueta, marginBottom: 8 }}>
                      Qué compras para reservar esta clase
                    </p>
                    <div ref={grupoPlanesRef} role="radiogroup" aria-labelledby={idPlanes} onKeyDown={alTecladoPlanes}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {planesOpciones.map((p, idx) => {
                        const sel = p.id === planSeleccionadoId;
                        const detalle = queIncluye(p) || p.descripcion || '';
                        // Solo la elegida entra en el orden del tabulador; si
                        // no hubiera ninguna, la primera, para que el grupo
                        // nunca quede fuera del teclado.
                        const tabulable = sel || (idx === 0 && !planesOpciones.some(o => o.id === planSeleccionadoId));
                        return (
                          <button key={p.id} type="button" role="radio" aria-checked={sel} tabIndex={tabulable ? 0 : -1}
                            onClick={() => onCambiarPlan(p)}
                            className="pantalla-reserva-opcion"
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 56,
                              padding: '10px 14px 10px 12px', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                              borderRadius: 'var(--reservar-radio-input, 14px)',
                              border: `1.5px solid ${sel ? 'var(--portal-brand)' : 'var(--portal-line)'}`,
                              background: sel ? 'color-mix(in oklab, var(--portal-brand) 7%, var(--portal-surface))' : 'var(--portal-surface)',
                              transition: 'border-color .2s ease, background-color .2s ease',
                            }}>
                            <span aria-hidden="true" style={{
                              width: 20, height: 20, borderRadius: 999, flexShrink: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1.5px solid ${sel ? 'var(--portal-brand)' : 'var(--portal-muted)'}`,
                            }}>
                              {sel && <span style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--portal-brand)' }} />}
                            </span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--portal-ink)', lineHeight: 1.25 }}>{p.nombre}</span>
                              {detalle && (
                                <span style={{ display: 'block', fontSize: 12, color: 'var(--portal-muted)', marginTop: 2, lineHeight: 1.35 }}>{detalle}</span>
                              )}
                            </span>
                            <span style={{ fontFamily: serif, fontWeight: pesoTitular(800), fontSize: 16, color: 'var(--portal-ink)', whiteSpace: 'nowrap' }}>
                              {p.precio} €
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Código promocional — colapsado por defecto, un clic lo
                    revela justo encima de donde va a importar (el pago),
                    mismo criterio ya auditado en Momence. Feedback en vivo
                    (validando/válido/inválido) contra
                    /api/public/validar-codigo-descuento. Abierto, el campo de
                    la app: su etiqueta en versales encima. */}
                {sinCodigo ? null : !mostrarCodigo ? (
                  <button type="button" onClick={onMostrarCodigo}
                    style={{
                      alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 32,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      fontFamily: sans, fontSize: 13, fontWeight: 600, color: 'var(--portal-muted-2)',
                    }}>
                    <Tag size={14} aria-hidden />
                    ¿Tienes un código promocional?
                  </button>
                ) : (
                  <div>
                    <label htmlFor={idCodigo} style={{ ...etiqueta, display: 'block', marginBottom: 8 }}>¿Tienes un código?</label>
                    <div className="pantalla-reserva-codigo" style={{
                      borderColor: codigoEstadoMostrado === 'valido' ? `color-mix(in srgb, ${colorOk} 45%, var(--portal-line))`
                        : codigoEstadoMostrado === 'invalido' ? `color-mix(in srgb, ${colorError} 40%, var(--portal-line))`
                        : undefined,
                    }}>
                      <Tag size={15} aria-hidden style={{ color: 'var(--portal-muted)', flexShrink: 0 }} />
                      <input
                        id={idCodigo}
                        type="text"
                        value={codigoDescuento}
                        onChange={e => onChangeCodigo(e.target.value)}
                        placeholder="Código promocional"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        style={{
                          flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none',
                          // 16px, no 14: por debajo de 16px iOS Safari amplía
                          // la página entera al enfocar el campo (mismo
                          // motivo que CampoTexto más abajo).
                          fontFamily: 'inherit', fontSize: 16, fontWeight: 600, letterSpacing: '.03em', color: 'var(--portal-ink)',
                        }}
                      />
                      {codigoEstadoMostrado === 'validando' && (
                        <Loader2 size={15} className="animate-spin" aria-hidden style={{ color: 'var(--portal-muted)', flexShrink: 0 }} />
                      )}
                      {codigoEstadoMostrado === 'valido' && <Check size={16} strokeWidth={2.5} aria-hidden style={{ color: colorOk, flexShrink: 0 }} />}
                      {codigoEstadoMostrado !== 'idle' && (
                        <button type="button" onClick={() => onChangeCodigo('')}
                          aria-label="Quitar código"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, margin: -4, color: 'var(--portal-muted)', display: 'flex', flexShrink: 0 }}>
                          <X size={15} />
                        </button>
                      )}
                    </div>
                    {codigoEstadoMostrado === 'valido' && (
                      <p role="status" style={{ margin: '6px 0 0', fontSize: 12.5, color: colorOk, fontWeight: 700 }}>
                        Código aplicado: −{codigoDescuentoEur} €
                      </p>
                    )}
                    {codigoEstadoMostrado === 'invalido' && (
                      <p role="status" style={{ margin: '6px 0 0', fontSize: 12.5, color: colorError }}>{codigoMotivo}</p>
                    )}
                  </div>
                )}

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 44, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={privacidadAceptada}
                    onChange={e => onTogglePrivacidad(e.target.checked)}
                    style={{ marginTop: 1, width: 18, height: 18, flexShrink: 0, accentColor: 'var(--portal-brand)', cursor: 'pointer' }} />
                  <span style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--portal-ink)' }}>
                    Al inscribirme, acepto la{' '}
                    <button type="button" onClick={e => { e.preventDefault(); onAbrirPrivacidad(); }}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 700, cursor: 'pointer', color: 'inherit' }}>
                      política de privacidad
                    </button>.
                  </span>
                </label>

                {/* ⚠️ Auditoría de conversión (2026-08-31): total+CTA
                    pegados al fondo del VIEWPORT en móvil (`.pantalla-reserva-cta-pegada`,
                    solo por debajo de 760px — @container en globals.css, el
                    mismo breakpoint que ya decide una vs. dos columnas aquí
                    mismo). */}
                <div className="pantalla-reserva-cta-pegada">
                  {/* Total justo encima del CTA — misma proximidad que Stripe
                      Checkout/Bsport: el precio se recuerda justo donde se
                      paga. Con código válido, el precio tachado deja claro que
                      el descuento ya cuenta, no solo que "se aplicará". */}
                  <div style={{
                    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                    paddingTop: 14, borderTop: '1px solid var(--portal-line)',
                  }}>
                    <span style={{ fontSize: 13, color: 'var(--portal-muted)', fontWeight: 700 }}>Total a pagar</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      {precioConDescuento !== null && (
                        <span style={{ fontSize: 14, color: 'var(--portal-muted)', textDecoration: 'line-through' }}>{precio} €</span>
                      )}
                      <span style={{ fontFamily: serif, fontWeight: pesoTitular(800), fontSize: cq(22, 2.2, 26), color: 'var(--portal-ink)' }}>
                        {precioConDescuento ?? precio} €
                      </span>
                    </span>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <button type="button" onClick={onContinuar} disabled={!ctaActivo}
                      onMouseEnter={() => setCtaHover(true)} onMouseLeave={() => setCtaHover(false)}
                      style={{
                        width: '100%', minHeight: 52, padding: '0 20px', border: 'none',
                        borderRadius: `var(--reservar-radio-boton, ${R.pillBtnCta}px)`,
                        cursor: ctaActivo ? 'pointer' : 'not-allowed',
                        fontFamily: sans, fontSize: 15, fontWeight: 800, letterSpacing: '-.005em',
                        color: 'var(--portal-brand-foreground)',
                        background: 'var(--portal-brand)',
                        opacity: ctaActivo ? 1 : 0.45,
                        boxShadow: ctaActivo ? SH.ctaOscuroFuerte : 'none',
                        transform: ctaActivo && ctaHover ? 'translateY(-1px)' : 'none',
                        transition: `box-shadow .35s ${EASE}, transform .35s ${EASE}, opacity .25s ease`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                      {datosCargando && <Loader2 size={16} className="animate-spin" aria-hidden />}
                      {datosCargando ? 'Un momento…' : 'Continuar al pago'}
                    </button>
                    {/* Explica exactamente qué falta, sin esperar a que se
                        pulse el botón deshabilitado — nunca un botón "mudo". */}
                    {!formValido && !datosCargando && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--portal-muted)', textAlign: 'center', lineHeight: 1.45 }}>
                        Falta: {camposIncompletos.join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <FilaConfianza />
              </div>
            )}

            {fase === 'pago' && pago && (
              <div key="pago" className="pantalla-reserva-seccion" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* El título de este paso para quien navega por encabezados
                    («Tus datos» → «Pagar y reservar»). A la vista ya lo dice el
                    propio pago («Confirmar reserva», el resumen y el botón). */}
                <h2 className="sr-only">Pagar y reservar</h2>
                {/* ⚠️ `datosError` se pintaba SOLO en la fase de datos, y el
                    fallback de Bizum (`onBizum` → /api/stripe/checkout) escribe
                    justo ahí cuando falla. Resultado: se pulsaba «Pagar con
                    Bizum» y no pasaba absolutamente nada en la pantalla donde
                    más se abandona. */}
                {datosError && (
                  <p role="alert" style={{ color: colorError, fontSize: 13, margin: 0 }}>{datosError}</p>
                )}
                <CheckoutEmbebido
                  t={t}
                  plan={pago.plan}
                  clientSecret={pago.clientSecret}
                  publishableKey={pago.publishableKey}
                  stripeAccountId={pago.stripeAccountId}
                  resumenClase={{
                    nombre: clase.nombre,
                    fecha: fmtLong(new Date(clase.inicio)),
                    hora: fmtTime(clase.inicio),
                    instructor: clase.instructorNombre,
                  }}
                  ventanaCancelacionHoras={pago.ventanaCancelacionHoras}
                  textoBoton={pago.textoBoton}
                  datosPago={{
                    nombre: loginForm.nombre.trim(),
                    email: loginForm.email.trim(),
                    telefono: loginForm.telefono.trim(),
                  }}
                  fuentePago={pago.fuentePago}
                  radioInput={pago.radioInput}
                  onExito={pago.onExito}
                  onBizum={pago.onBizum}
                  onCerrar={pago.onVolverADatos}
                />
              </div>
            )}
          </div>

          {/* ── La clase en detalle: quién la da, las filas de la app y la
              descripción. En el móvil, DESPUÉS del formulario (quien llega aquí
              ya la eligió); en escritorio, bajo la foto, en la columna de la
              izquierda. ── */}
          <div className="pantalla-reserva-detalles" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            {clase.instructorNombre && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, minWidth: 0,
                padding: '8px 16px 8px 8px', background: 'var(--portal-surface)',
                border: '1px solid var(--portal-line)', borderRadius: `var(--reservar-radio-tarjeta, ${R.card}px)`,
              }}>
                <AvatarInstructora nombre={clase.instructorNombre} fotoUrl={clase.instructorFotoUrl ?? null} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--portal-ink)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clase.instructorNombre}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--portal-muted)', lineHeight: 1.3 }}>{rolInstructora(clase.instructorRol)}</p>
                </div>
              </div>
            )}
            <dl style={{
              margin: 0, display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 16px',
              background: 'var(--portal-surface)', border: '1px solid var(--portal-line)',
              borderRadius: `var(--reservar-radio-tarjeta, ${R.card}px)`,
            }}>
              {filas.map(f => (
                <div key={f.clave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 13, lineHeight: 1.4 }}>
                  <dt style={{ color: 'var(--portal-muted)', flexShrink: 0 }}>{f.clave}</dt>
                  <dd style={{ margin: 0, color: 'var(--portal-ink)', fontWeight: 700, textAlign: 'right', minWidth: 0 }}>{f.valor}</dd>
                </div>
              ))}
            </dl>
            {clase.descripcion && (
              <p style={{ margin: 0, color: 'var(--portal-muted-2)', fontSize: 13.5, lineHeight: 1.6 }}>
                {clase.descripcion}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * «10 clases · caduca a los 90 días» — qué se lleva quien paga esto.
 *
 * Sin esta línea, un bono de 120 € y una clase suelta de 15 € se veían igual:
 * un nombre y un precio. Quien elige el de 120 tiene que ver que se lleva diez
 * clases, no la de hoy diez veces más cara.
 *
 * Devuelve cadena vacía para un PUNTUAL: «1 clase» junto a «Clase suelta» es
 * ruido, no información.
 */
function queIncluye(p: PlanTarifa): string {
  if (p.tipo !== 'BONO') return '';
  const partes: string[] = [];
  if (p.sesiones && p.sesiones > 0) partes.push(`${p.sesiones} clases`);
  if (p.validezDias && p.validezDias > 0) partes.push(`caduca a los ${p.validezDias} días`);
  return partes.join(' · ');
}

/** Qué le falta al formulario para poder continuar, en el orden en que se
 *  rellenan los campos — para explicar el botón deshabilitado en vez de
 *  dejarlo mudo (Fase 3 del rediseño: "validación que explique exactamente
 *  qué falta"). */
function camposFaltantes(loginForm: DatosContacto, privacidadAceptada: boolean): string[] {
  const faltan: string[] = [];
  // Diseño "Tentare Portal Reservas": un solo campo "Nombre y apellido" — sin
  // requisito separado de apellidos.
  if (!loginForm.nombre.trim()) faltan.push('nombre y apellido');
  if (!loginForm.email.trim()) faltan.push('email');
  if (!telefonoValido(loginForm.telefono)) faltan.push('teléfono');
  if (!privacidadAceptada) faltan.push('aceptar la política de privacidad');
  return faltan;
}

/** Su foto, o sus iniciales si no la ha subido — como la tarjeta de la
 *  instructora de la app. Decorativo: su nombre va escrito justo al lado. */
function AvatarInstructora({ nombre, fotoUrl }: { nombre: string; fotoUrl: string | null }) {
  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- foto subida por la instructora, no un asset conocido en build
      <img src={fotoUrl} alt="" loading="lazy" decoding="async"
        style={{ width: 40, height: 40, borderRadius: 999, objectFit: 'cover', flexShrink: 0, background: 'var(--portal-surface-2)' }} />
    );
  }
  const partes = nombre.trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
  return (
    <span aria-hidden="true" style={{
      width: 40, height: 40, borderRadius: 999, flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--portal-surface-2)', border: '1px solid var(--portal-line)',
      fontSize: 13, fontWeight: 800, letterSpacing: '.02em', color: 'var(--portal-muted)',
    }}>
      {iniciales}
    </span>
  );
}

/** Fila de confianza al pie de la tarjeta — mismo trío que ya enseñan
 *  Momence/Bsport en su checkout (seguridad del pago, cancelación,
 *  confirmación instantánea), con los iconos de este kit. */
function FilaConfianza() {
  const item: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--portal-muted)',
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', paddingTop: 2 }}>
      <span style={item}><Lock size={12} strokeWidth={2.2} aria-hidden />Pago seguro por Stripe</span>
      <span style={item}><RotateCcw size={12} strokeWidth={2.2} aria-hidden />Cancela cuando quieras</span>
      <span style={item}><ShieldCheck size={12} strokeWidth={2.2} aria-hidden />Confirmación al instante</span>
    </div>
  );
}

/**
 * Un campo de «Tus datos», con el aspecto del de la app (`.input`): 50 px de
 * alto, borde de 1,5 px y las esquinas de input del widget. El placeholder hace
 * de etiqueta y además se expone como nombre accesible (`aria-label`): sin él,
 * un lector de pantalla dependía de que el navegador usara el placeholder.
 */
function CampoTexto({
  placeholder, value, onChange, type = 'text', autoFocus, onEnter, autoComplete, inputMode,
}: {
  placeholder: string; value: string; onChange: (v: string) => void; type?: string;
  autoFocus?: boolean; onEnter?: () => void;
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
}) {
  const estilo: CSSProperties = {
    // 16px, no 15: por debajo de 16px iOS Safari amplía la página entera al
    // enfocar el campo y no la devuelve a su sitio (medido, e2e/reservar-
    // modal-movil.spec.ts).
    width: '100%', minHeight: 50, padding: '12px 16px', fontFamily: 'inherit', fontSize: 16, fontWeight: 600,
    color: 'var(--portal-ink)', background: 'var(--portal-surface)',
    border: '1.5px solid var(--portal-line)', borderRadius: 'var(--reservar-radio-input, 14px)', outline: 'none',
    transition: 'border-color .2s ease, box-shadow .2s ease',
  };
  return (
    <input
      type={type}
      placeholder={placeholder}
      aria-label={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      autoFocus={autoFocus}
      autoComplete={autoComplete}
      inputMode={inputMode}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      // El foco de teclado lo pinta `.pantalla-reserva-campo:focus` en
      // globals.css — un `:focus` en CSS cubre todos los campos por
      // construcción, sin depender de que cada llamador cablee su propio
      // estado (era justo el hueco: solo "Nombre" lo tenía).
      className="pantalla-reserva-campo"
      style={estilo}
    />
  );
}

/** Mismo tratamiento visual que `CampoTexto` — reutiliza su clase de foco. */
function CampoSelect({
  placeholder, value, onChange, opciones,
}: {
  placeholder: string; value: string; onChange: (v: string) => void; opciones: [string, string][];
}) {
  return (
    <select
      value={value}
      aria-label={placeholder}
      onChange={e => onChange(e.target.value)}
      className="pantalla-reserva-campo"
      style={{
        width: '100%', minHeight: 50, padding: '12px 14px', fontFamily: 'inherit', fontSize: 16, fontWeight: 600,
        color: value ? 'var(--portal-ink)' : 'var(--portal-muted)',
        background: 'var(--portal-surface)', border: '1.5px solid var(--portal-line)',
        borderRadius: 'var(--reservar-radio-input, 14px)', outline: 'none', transition: 'border-color .2s ease, box-shadow .2s ease',
      }}
    >
      <option value="">{placeholder}</option>
      {opciones.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
    </select>
  );
}
