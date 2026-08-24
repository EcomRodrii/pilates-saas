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
// tal cual en vez de reinventarlo: la foto pasa de "caja con texto debajo" a
// tratamiento editorial (degradado + texto ENCIMA, como la propia foto de
// marketing de un estudio boutique — es el gesto que Momence/Bsport clavan),
// y la columna derecha pasa de texto flotando sobre el fondo a una tarjeta
// elevada de verdad (mismo `R.card`/`SH.card` que ya usan las tarjetas de
// bono), con avatar de instructora y una fila de confianza al pie.
//
// Cubre HOY solo "datos"+"pago" del flujo "pagar y reservar sin login previo"
// (docs/reserva-sin-login-diseno.md) — es el tramo que hoy vive fragmentado en
// dos hojas con "‹ Datos"/"‹ Pago" (page.tsx). La pantalla de éxito ('done')
// NO se toca en esta fase: ya se rediseñó en una fase anterior de esta misma
// sesión (estados explícitos, referencia de pago, Google Calendar/ICS) y ya
// cumple lo que se pide aquí para la confirmación.
//
// Monta DENTRO de <PublicSheet> con estilo "pantalla completa" (ver
// `reserva-pantalla-completa` en globals.css y su uso en page.tsx) — reutiliza
// a propósito toda la lógica ya resuelta de esa hoja para el iframe embebido
// (franjaVisible, safe-area, animación de entrada/salida): lo único que
// cambia es que esta vez el "cajón" ocupa la pantalla entera y no se ve como
// una tarjeta flotante con fondo oscurecido.
import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { ChevronLeft, Calendar, Clock, MapPin, Tag, Lock, ShieldCheck, RotateCcw, Check, X, Loader2 } from 'lucide-react';
import type { PlanTarifa } from '@/lib/types';
import type { ModoTokens } from '@/lib/portal-modo';
import { serif, sans, cq, radius as R, shadow as SH, eyebrow, EASE } from '@/lib/reservar-publico-tokens';
import { fmtTime, fmtLong, telefonoValido } from '@/lib/reservar/formato';
import { imagenDeClase, alFallarImagen, IMAGENES_CLASE } from '@/lib/imagenes-por-defecto';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';

export interface DatosContacto {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
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
  salaNombre: string | null;
  nivel: string | null;
}

export function PantallaReserva({
  t, onVolver, estudioNombre, estudioDireccion, studioId, clase, precio, fase,
  loginForm, onChangeLoginForm, datosError, datosCargando,
  privacidadAceptada, onTogglePrivacidad, onAbrirPrivacidad,
  mostrarCodigo, onMostrarCodigo, codigoDescuento, onChangeCodigo,
  onContinuar, pago,
}: {
  t: ModoTokens;
  /** "‹ Volver a la clase" — un único punto de salida, no un "atrás" por paso. */
  onVolver: () => void;
  estudioNombre: string;
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
  };
}) {
  const [ctaHover, setCtaHover] = useState(false);
  const camposIncompletos = camposFaltantes(loginForm, privacidadAceptada);
  const formValido = camposIncompletos.length === 0;
  const ctaActivo = formValido && !datosCargando;

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
  const precioConDescuento = codigoEstadoMostrado === 'valido' && codigoDescuentoEur != null
    ? Math.max(0, Math.round((precio - codigoDescuentoEur) * 100) / 100)
    : null;

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: sans, background: 'var(--portal-bg)' }}>
      {/* Cabecera minimalista — un único "‹ volver", nunca "‹ Datos"/"‹ Pago":
          es la pieza que más se nota cuando se compara con Momence, cuyo
          checkout entero es un scroll sin ningún control de "paso anterior"
          salvo el propio del navegador. */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${cq(14, 1.8, 18)} ${cq(18, 3, 28)}`, flexShrink: 0, borderBottom: '1px solid var(--portal-line)',
      }}>
        <button type="button" onClick={fase === 'pago' && pago ? pago.onVolverADatos : onVolver}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', color: 'var(--portal-muted)', fontSize: 13, fontWeight: 600, padding: 0,
            flexShrink: 0,
          }}>
          <ChevronLeft size={16} strokeWidth={2.5} />
          {fase === 'pago' ? 'Editar mis datos' : 'Volver a la clase'}
        </button>
        {/* Fase 4 (mobile-first): sin `minWidth: 0` un hijo de flex nunca
            encoge por debajo del ancho de su contenido — el nombre de un
            estudio largo ("Centro de Pilates y Bienestar Marbella Este")
            empujaba la cabecera fuera del viewport en un Android estrecho
            (360px) en vez de truncarse. */}
        <span style={{
          fontFamily: serif, fontSize: cq(14, 1.6, 16), color: 'var(--portal-ink)', letterSpacing: '-0.01em',
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 12,
        }}>
          {estudioNombre}
        </span>
      </header>

      {/* Único scroll natural de la pantalla — nada de overflow anidado ni
          `100vh` fijo: el contenedor padre (PublicSheet en modo pantalla
          completa) ya resuelve `dvh`/franja del iframe/safe-area. */}
      {/* `overscrollBehavior: 'contain'` no es cosmético: sin `footer`,
          `PublicSheet` no envuelve `children` en su wrapper de scroll de
          siempre (ese sí lo lleva) — este div es el ÚNICO contenedor con
          scroll, y sin contenerlo, al llegar al final el scroll encadena
          hacia la página de debajo (el "doble scroll" que la Fase 4 pide
          evitar explícitamente). Encontrado con la propia captura de
          verificación de esta fase, no al llegar a Fase 4. */}
      <div className="pantalla-reserva-contenedor" style={{ flex: '1 1 auto', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <div style={{
          maxWidth: 1040, margin: '0 auto',
          paddingTop: cq(20, 3, 40),
          paddingInline: cq(18, 3, 28),
          // Fase 4 (mobile-first): la franja del gesto de inicio de iPhone se
          // suma al aire de siempre, no lo sustituye — `viewportFit: 'cover'`
          // ya está declarado en app/reservar/[slug]/layout.tsx (el único
          // sitio que hace que `env(safe-area-inset-*)` deje de devolver 0),
          // pero sin este `calc()` el CTA/fila de confianza quedaban a ras
          // del indicador de inicio en vez de tener aire por debajo — hueco
          // real porque esta pantalla, al no llevar `footer` en `PublicSheet`,
          // no hereda el `env(safe-area-inset-bottom)` que sí lleva su patrón
          // de pie fijo de siempre.
          paddingBottom: `calc(${cq(40, 6, 64)} + env(safe-area-inset-bottom, 0px))`,
          display: 'grid', gap: cq(28, 3.4, 44),
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
        className="pantalla-reserva-grid"
        >
          {/* ── Columna izquierda: la clase como pieza editorial ──
              Foto a sangre con degradado y el nombre ENCIMA — no una foto en
              caja con texto debajo. Es el gesto concreto que distingue una
              pantalla de reserva "premium" de un formulario con una imagen al
              lado (auditado en vivo contra Momence). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: cq(18, 2, 22) }}>
            <div style={{ position: 'relative', borderRadius: R.hero, overflow: 'hidden', boxShadow: SH.hero }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- foto de catálogo o subida por el estudio, no un asset conocido en build */}
              <img
                src={imagenDeClase(clase)}
                alt=""
                loading="lazy"
                decoding="async"
                onError={alFallarImagen(IMAGENES_CLASE.generica)}
                style={{ width: '100%', aspectRatio: '5 / 4', objectFit: 'cover', background: clase.color, display: 'block' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(20,22,15,.82) 0%, rgba(20,22,15,.38) 42%, rgba(20,22,15,0) 68%)',
              }} />
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: cq(18, 2.4, 28) }}>
                {clase.nivel && (
                  <div style={{ ...eyebrow(9), color: 'rgba(255,255,255,.82)', marginBottom: 8 }}>{clase.nivel}</div>
                )}
                <h1 style={{ fontFamily: serif, fontWeight: 400, fontSize: cq(26, 3.2, 38), lineHeight: 1.04, color: '#fff', letterSpacing: '-0.01em' }}>
                  {clase.nombre}
                </h1>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: `0 ${cq(2, 0.4, 4)}` }}>
              <FilaResumen icon={<Calendar size={15} />}>{tituloFecha(clase.inicio)}</FilaResumen>
              <FilaResumen icon={<Clock size={15} />}>
                {fmtTime(clase.inicio)} – {fmtTime(clase.fin)}
                {clase.duracionMinutos ? ` · ${clase.duracionMinutos} min` : ''}
              </FilaResumen>
              {clase.salaNombre && (
                <FilaResumen icon={<MapPin size={15} />}>{clase.salaNombre} · {estudioDireccion || estudioNombre}</FilaResumen>
              )}
              {clase.instructorNombre && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <AvatarIniciales nombre={clase.instructorNombre} />
                  <span style={{ fontSize: 13.5, color: 'var(--portal-muted-2)' }}>
                    Con <strong style={{ color: 'var(--portal-ink)', fontWeight: 600 }}>{clase.instructorNombre}</strong>
                  </span>
                </div>
              )}
              {clase.descripcion && (
                <p style={{ color: 'var(--portal-muted-2)', fontSize: 13.5, lineHeight: 1.6, marginTop: 8 }}>
                  {clase.descripcion}
                </p>
              )}
            </div>
          </div>

          {/* ── Columna derecha: la superficie de pago ──
              Una tarjeta elevada de verdad (mismo `R.card`/`SH.card` que las
              tarjetas de bono de esta misma página), no texto flotando sobre
              el fondo — es la convención que Stripe Checkout, Bsport y
              Momence comparten: la zona donde se paga se distingue de la
              zona donde se informa. */}
          <div style={{
            background: 'var(--portal-surface)', border: '1px solid var(--portal-line)',
            borderRadius: R.card, boxShadow: SH.card,
            padding: `${cq(22, 2.6, 32)} ${cq(18, 2.6, 30)}`,
            display: 'flex', flexDirection: 'column', gap: cq(18, 2, 22),
          }}>
            {fase === 'datos' && (
              <div key="datos" className="pantalla-reserva-seccion" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <div style={eyebrow(9)}>Paso final</div>
                  <h2 style={{ fontFamily: serif, fontWeight: 400, fontSize: cq(21, 2.2, 25), color: 'var(--portal-ink)', marginTop: 6, marginBottom: 6 }}>
                    Tus datos
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--portal-muted-2)', lineHeight: 1.5 }}>
                    No necesitas crear una cuenta. Al completar tu reserva crearemos automáticamente tu acceso para que puedas gestionar tus próximas clases.
                  </p>
                </div>

                <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                  <CampoTexto placeholder="Nombre" value={loginForm.nombre}
                    onChange={v => onChangeLoginForm({ nombre: v })}
                    autoFocus />
                  <CampoTexto placeholder="Apellidos" value={loginForm.apellidos}
                    onChange={v => onChangeLoginForm({ apellidos: v })} />
                </div>
                <CampoTexto type="email" placeholder="Tu email" value={loginForm.email}
                  onChange={v => onChangeLoginForm({ email: v })} />
                <CampoTexto type="tel" placeholder="Tu teléfono (+34 600 000 000)" value={loginForm.telefono}
                  onChange={v => onChangeLoginForm({ telefono: v })}
                  onEnter={onContinuar} />
                {datosError && (
                  <p style={{ color: 'var(--destructive)', fontSize: 13 }}>{datosError}</p>
                )}

                {/* Código promocional — colapsado por defecto, un clic lo
                    revela justo encima de donde va a importar (el pago),
                    mismo criterio ya auditado en Momence. Feedback en vivo
                    (validando/válido/inválido) contra
                    /api/public/validar-codigo-descuento. */}
                <div>
                  {!mostrarCodigo ? (
                    <button type="button" onClick={onMostrarCodigo}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
                        cursor: 'pointer', fontSize: 13, color: 'var(--portal-muted-2)', padding: 0,
                      }}>
                      <Tag size={14} />
                      ¿Tienes un código promocional?
                    </button>
                  ) : (
                    <div>
                      <div className="pantalla-reserva-codigo" style={{
                        borderColor: codigoEstadoMostrado === 'valido' ? 'color-mix(in srgb, #2f7a4f 45%, var(--portal-line))'
                          : codigoEstadoMostrado === 'invalido' ? 'color-mix(in srgb, var(--destructive) 40%, var(--portal-line))'
                          : undefined,
                      }}>
                        <Tag size={15} style={{ color: 'var(--portal-muted)', flexShrink: 0 }} />
                        <input
                          type="text"
                          value={codigoDescuento}
                          onChange={e => onChangeCodigo(e.target.value)}
                          placeholder="Código promocional"
                          style={{
                            flex: 1, border: 'none', outline: 'none', background: 'none',
                            // 16px, no 14: por debajo de 16px iOS Safari amplía
                            // la página entera al enfocar el campo (mismo
                            // motivo que CampoTexto más abajo).
                            fontSize: 16, color: 'var(--portal-ink)',
                          }}
                        />
                        {codigoEstadoMostrado === 'validando' && (
                          <Loader2 size={15} className="animate-spin" style={{ color: 'var(--portal-muted)', flexShrink: 0 }} />
                        )}
                        {codigoEstadoMostrado === 'valido' && <Check size={16} strokeWidth={2.5} style={{ color: '#2f7a4f', flexShrink: 0 }} />}
                        {codigoEstadoMostrado !== 'idle' && (
                          <button type="button" onClick={() => onChangeCodigo('')}
                            aria-label="Quitar código"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--portal-muted)', display: 'flex', flexShrink: 0 }}>
                            <X size={15} />
                          </button>
                        )}
                      </div>
                      {codigoEstadoMostrado === 'valido' && (
                        <p style={{ fontSize: 12, color: '#2f7a4f', fontWeight: 600, marginTop: 6 }}>
                          Código aplicado: −{codigoDescuentoEur} €
                        </p>
                      )}
                      {codigoEstadoMostrado === 'invalido' && (
                        <p style={{ fontSize: 12, color: 'var(--destructive)', marginTop: 6 }}>{codigoMotivo}</p>
                      )}
                    </div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', userSelect: 'none' }}>
                  <input type="checkbox" checked={privacidadAceptada}
                    onChange={e => onTogglePrivacidad(e.target.checked)}
                    style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0, accentColor: 'var(--portal-brand)' }} />
                  <span style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--portal-ink)' }}>
                    Al inscribirme, acepto la{' '}
                    <button type="button" onClick={e => { e.preventDefault(); onAbrirPrivacidad(); }}
                      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textDecoration: 'underline', fontWeight: 600, cursor: 'pointer', color: 'inherit' }}>
                      política de privacidad
                    </button>.
                  </span>
                </label>

                {/* Total justo encima del CTA — misma proximidad que Stripe
                    Checkout/Bsport: el precio se recuerda justo donde se paga,
                    no solo arriba del todo, lejos del botón. Con código
                    válido, el precio tachado deja claro que el descuento ya
                    cuenta, no solo que "se aplicará". */}
                <div style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  paddingTop: 14, borderTop: '1px solid var(--portal-line)',
                }}>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-muted)', fontWeight: 600 }}>Total a pagar</span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    {precioConDescuento !== null && (
                      <span style={{ fontSize: 14, color: 'var(--portal-muted)', textDecoration: 'line-through' }}>{precio} €</span>
                    )}
                    <span style={{ fontFamily: serif, fontSize: cq(22, 2.2, 26), color: 'var(--portal-ink)' }}>
                      {precioConDescuento ?? precio} €
                    </span>
                  </span>
                </div>

                <div>
                  <button type="button" onClick={onContinuar} disabled={!ctaActivo}
                    onMouseEnter={() => setCtaHover(true)} onMouseLeave={() => setCtaHover(false)}
                    style={{
                      width: '100%', height: cq(50, 4, 58), borderRadius: R.pillBtnCta, border: 'none', cursor: ctaActivo ? 'pointer' : 'not-allowed',
                      fontFamily: sans, fontSize: 14.5, fontWeight: 600, letterSpacing: '.01em',
                      color: 'var(--portal-brand-foreground)',
                      background: 'var(--portal-brand)',
                      opacity: ctaActivo ? 1 : 0.45,
                      boxShadow: ctaActivo ? SH.ctaOscuroFuerte : 'none',
                      transform: ctaActivo && ctaHover ? 'translateY(-1px)' : 'none',
                      transition: `box-shadow .35s ${EASE}, transform .35s ${EASE}, opacity .25s ease`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                    {datosCargando && <Loader2 size={16} className="animate-spin" />}
                    {datosCargando ? 'Un momento…' : 'Continuar al pago'}
                  </button>
                  {/* Explica exactamente qué falta, sin esperar a que se
                      pulse el botón deshabilitado — nunca un botón "mudo". */}
                  {!formValido && !datosCargando && (
                    <p style={{ fontSize: 11.5, color: 'var(--portal-muted)', textAlign: 'center', marginTop: 8 }}>
                      Falta: {camposIncompletos.join(', ')}
                    </p>
                  )}
                </div>

                <FilaConfianza />
              </div>
            )}

            {fase === 'pago' && pago && (
              <div key="pago" className="pantalla-reserva-seccion">
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
                    nombre: `${loginForm.nombre.trim()} ${loginForm.apellidos.trim()}`.trim(),
                    email: loginForm.email.trim(),
                    telefono: loginForm.telefono.trim(),
                  }}
                  fuentePago={pago.fuentePago}
                  radioInput={pago.radioInput}
                  onExito={pago.onExito}
                  onCerrar={pago.onVolverADatos}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Qué le falta al formulario para poder continuar, en el orden en que se
 *  rellenan los campos — para explicar el botón deshabilitado en vez de
 *  dejarlo mudo (Fase 3 del rediseño: "validación que explique exactamente
 *  qué falta"). */
function camposFaltantes(loginForm: DatosContacto, privacidadAceptada: boolean): string[] {
  const faltan: string[] = [];
  if (!loginForm.nombre.trim()) faltan.push('nombre');
  if (!loginForm.apellidos.trim()) faltan.push('apellidos');
  if (!loginForm.email.trim()) faltan.push('email');
  if (!telefonoValido(loginForm.telefono)) faltan.push('teléfono');
  if (!privacidadAceptada) faltan.push('aceptar la política de privacidad');
  return faltan;
}

function tituloFecha(inicio: string) {
  const d = new Date(inicio);
  const texto = fmtLong(d);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function FilaResumen({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, color: 'var(--portal-muted-2)' }}>
      <span style={{ color: 'var(--portal-muted)', flexShrink: 0, display: 'inline-flex' }}>{icon}</span>
      {children}
    </div>
  );
}

/** Mismo criterio visual que `AvatarIniciales` de `reserva-calendario.tsx`
 *  (iniciales, sin acentos raros que resolver), a una escala algo mayor: aquí
 *  es la única foto de la instructora en toda la pantalla, no una fila de
 *  lista compitiendo con la hora. */
function AvatarIniciales({ nombre }: { nombre: string }) {
  const partes = nombre.trim().split(/\s+/);
  const iniciales = ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
  return (
    <span style={{
      width: 26, height: 26, borderRadius: 999, background: 'var(--portal-velo-suave)',
      border: '1px solid var(--portal-line)', display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: '.02em',
      color: 'var(--portal-muted)', flexShrink: 0,
    }}>
      {iniciales}
    </span>
  );
}

/** Fila de confianza al pie de la tarjeta — mismo trío que ya enseñan
 *  Momence/Bsport en su checkout (seguridad del pago, cancelación,
 *  confirmación instantánea), con los iconos de este kit en vez del
 *  candado-emoji de la v1 (que se veía "barato" al lado del resto de la
 *  pantalla). También llena el aire que dejaba la tarjeta vacía por debajo. */
function FilaConfianza() {
  const item: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--portal-muted)',
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', justifyContent: 'center', paddingTop: 2 }}>
      <span style={item}><Lock size={12} strokeWidth={2.2} />Pago seguro por Stripe</span>
      <span style={item}><RotateCcw size={12} strokeWidth={2.2} />Cancela cuando quieras</span>
      <span style={item}><ShieldCheck size={12} strokeWidth={2.2} />Confirmación al instante</span>
    </div>
  );
}

function CampoTexto({
  placeholder, value, onChange, type = 'text', autoFocus, onEnter,
}: {
  placeholder: string; value: string; onChange: (v: string) => void; type?: string;
  autoFocus?: boolean; onEnter?: () => void;
}) {
  const estilo: CSSProperties = {
    // 16px, no 15: por debajo de 16px iOS Safari amplía la página entera al
    // enfocar el campo y no la devuelve a su sitio (medido, e2e/reservar-
    // modal-movil.spec.ts).
    width: '100%', padding: '13px 15px', fontSize: 16, color: 'var(--portal-ink)',
    background: 'var(--portal-surface-2)', border: '1.5px solid var(--portal-line)',
    borderRadius: 16, outline: 'none',
    transition: 'border-color .2s ease, box-shadow .2s ease',
  };
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      autoFocus={autoFocus}
      onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter(); }}
      // El foco de teclado lo pinta `.pantalla-reserva-campo:focus` en
      // globals.css — un `:focus` en CSS cubre los cuatro campos por
      // construcción, sin depender de que cada llamador cablee su propio
      // estado (era justo el hueco: solo "Nombre" lo tenía).
      className="pantalla-reserva-campo"
      style={estilo}
    />
  );
}
