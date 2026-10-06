'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Sello } from '@/components/student/ui/Sello';
import { CheckoutEmbebido } from '@/components/checkout-widget/checkout-embebido';
import { MODO_TOKENS } from '@/lib/portal-paleta';
import { clavePublicableStripe } from '@/lib/student/comprar';
import { esperarReservaDePago, iniciarPagoDeClase, pedirOpcionesClase, reservarPruebaGratis, type DesenlacePagoClase } from '@/lib/student/pagar-clase';
import { REINTENTOS_PREPARANDOSE, textoCompensacion } from '@/lib/student/pagar-clase-reglas';
import { piDeClientSecret } from '@/lib/billing/estado-pago-publico';
import { euros, fechaLarga } from '@/lib/student/formato';
import type { OpcionDeClase } from '@/lib/reservar/opciones-de-clase';
import type { PlanTarifa } from '@/lib/types';

// Pagar y reservar UNA clase sin salir de su ficha (P06 · Fase A, 6-oct-2026).
//
// El orden es el de la decisión del fundador: se comprueba la plaza → se cobra →
// se reserva. Cada paso lo decide el SERVIDOR:
//   1. «Comprobando la plaza…»: /api/public/opciones-clase dice si hay sitio PARA
//      ELLA y con qué puede venir. Si no, su texto y nada de pago.
//   2. «Continuar»: /api/public/checkout-embebido con la clase. Vuelve a comprobar la
//      plaza antes de crear el cobro, y hay un solo pago vivo por clase.
//   3. Stripe cobra (el mismo `CheckoutEmbebido` de /reservar y de la tienda).
//   4. «Pago hecho. Confirmando tu plaza…»: /api/public/estado-pago con su pago. Solo
//      «Reservada ✓» si el servidor la confirma; si no hubo plaza, lo que tiene a su
//      favor (nunca un ✓); si tarda, «no vuelvas a pagar».
//
// ⚠️ La hoja no se puede cerrar mientras se crea el cobro, mientras Stripe confirma ni
// mientras se espera la plaza: cerrar ahí deja a la alumna sin saber si le han cobrado.

type Fase =
  | { fase: 'comprobando' }
  /** `aviso`: el servidor dijo que la prueba no vale aquí; las demás opciones siguen a la vista (P07). */
  | { fase: 'elegir'; opciones: OpcionDeClase[]; aviso?: string }
  | { fase: 'no-se-puede'; titulo: string; mensaje: string; impago?: boolean }
  | { fase: 'preparando'; opciones: OpcionDeClase[] }
  | { fase: 'pagando'; opciones: OpcionDeClase[]; plan: PlanTarifa; clientSecret: string; importe: number; descuento: number; matricula: number }
  | { fase: 'confirmando'; pi: string }
  | { fase: 'resuelto'; desenlace: DesenlacePagoClase }
  | { fase: 'error'; mensaje: string; sesionCaducada?: boolean; opciones?: OpcionDeClase[] };

const nombreOpcion = (o: OpcionDeClase) => (o.tipo === 'suelta' ? 'Solo esta clase' : o.tipo === 'prueba' ? 'Tu primera clase' : o.nombre);
const detalleOpcion = (o: OpcionDeClase) => (o.tipo === 'suelta'
  ? 'Pagas esta clase y ya está'
  : o.tipo === 'prueba'
    ? (o.gratis ? 'Tu primera clase es gratis. Solo una vez por persona' : 'Una clase, la que elijas. Solo una vez por persona')
    : `${o.sesiones} clases · ${euros(o.precioPorClase)}/clase · esta y ${o.quedanTrasEsta === 1 ? '1 más' : `${o.quedanTrasEsta} más`}${o.ahorroPct ? ` · ahorras un ${o.ahorroPct} %` : ''}`);
const precioOpcion = (o: OpcionDeClase) => (o.gratis ? 'Gratis' : euros(o.importe));
/** El plan que pinta el checkout: el del catálogo, o uno mínimo con lo que dijo el servidor (la prueba no sale en la tienda). */
const planDeOpcion = (planes: readonly PlanTarifa[], o: OpcionDeClase, studioId: string): PlanTarifa =>
  planes.find((p) => p.id === o.planId)
  ?? ({ id: o.planId, studioId, nombre: o.tipo === 'prueba' ? 'Tu primera clase' : o.nombre, tipo: 'PUNTUAL', precio: o.importe, sesiones: o.sesiones, activo: true } as unknown as PlanTarifa);

export function HojaPagarYReservar({
  studioId, socioId, clase, spotId, planes, stripeAccountId, textosLegales, onCerrar, onReservada,
  onSesionCaducada, onSegundoPaso, hrefPagos, hrefMisReservas, hrefMensajes,
}: {
  studioId: string;
  socioId: string | null;
  clase: { id: string; nombre: string; fecha: string; hora: string };
  /** El sitio que eligió en la sala, si la sala tiene mapa. */
  spotId: string | null;
  /** Las tarifas del estudio: el `CheckoutEmbebido` pinta el plan elegido (nombre y tipo). */
  planes: readonly PlanTarifa[];
  stripeAccountId: string | null;
  /** Condiciones del estudio, SOLO si las reescribió (entonces el servidor exige aceptarlas antes de cobrar). */
  textosLegales: { politicaPrivacidad: string; terminosServicio: string } | null;
  onCerrar: () => void;
  /** El servidor confirmó la plaza: la ficha se vuelve a leer. */
  onReservada: () => void;
  onSesionCaducada: () => void;
  onSegundoPaso: () => void;
  hrefPagos: string;
  hrefMisReservas: string;
  hrefMensajes: string;
}) {
  const [estado, setEstado] = useState<Fase>({ fase: 'comprobando' });
  const [elegida, setElegida] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [confirmandoStripe, setConfirmandoStripe] = useState(false);
  const publishableKey = clavePublicableStripe();
  const viva = useRef(true);
  useEffect(() => {
    viva.current = true;
    return () => { viva.current = false; };
  }, []);

  // Tras pagar (o con un pago suyo ya en marcha): desde aquí manda el servidor.
  const confirmar = useCallback(async (pi: string) => {
    setEstado({ fase: 'confirmando', pi });
    const d = await esperarReservaDePago(studioId, pi, () => viva.current);
    if (d.tipo === 'cancelado') return;
    if (d.tipo === 'dos-pasos') { onSegundoPaso(); return; }
    if (d.tipo === 'sesion') {
      setEstado({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar: tu pago está hecho y no se pierde.', sesionCaducada: true });
      return;
    }
    if (d.tipo === 'confirmada') onReservada();
    setEstado({ fase: 'resuelto', desenlace: d });
  }, [studioId, onSegundoPaso, onReservada]);

  // 1. La plaza y las opciones. Desde el gesto de abrir (el montaje lo hace un toque suyo).
  const comprobar = useCallback(async () => {
    setEstado({ fase: 'comprobando' });
    const l = await pedirOpcionesClase(studioId, clase.id, spotId);
    if (!viva.current) return;
    switch (l.tipo) {
      case 'opciones':
        setElegida((e) => (e && l.opciones.some((o) => o.planId === e) ? e : l.opciones[0].planId));
        setEstado({ fase: 'elegir', opciones: l.opciones });
        return;
      case 'pago-en-curso':
        void confirmar(l.pi);
        return;
      case 'rechazo':
        setEstado({ fase: 'no-se-puede', titulo: 'Ahora no se puede pagar esta clase', mensaje: l.mensaje, impago: l.codigo === 'impago' });
        return;
      case 'sin-pago-online':
        setEstado({
          fase: 'no-se-puede', titulo: 'Esta clase se paga en el estudio',
          mensaje: l.precioEspecial
            ? 'Esta clase tiene un precio especial: resérvala en el estudio.'
            : 'Ahora mismo el estudio no cobra esta clase desde la app. Escríbeles y te lo resuelven.',
        });
        return;
      case 'faltan-preguntas':
        setEstado({ fase: 'no-se-puede', titulo: 'Antes, unas preguntas del estudio', mensaje: 'Contéstalas y vuelve a intentarlo. No te hemos cobrado nada.' });
        return;
      case 'dos-pasos':
        onSegundoPaso();
        return;
      case 'sesion':
        setEstado({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar: no se te ha cobrado nada.', sesionCaducada: true });
        return;
      default:
        setEstado({ fase: 'error', mensaje: l.mensaje });
    }
  }, [studioId, clase.id, spotId, confirmar, onSegundoPaso]);

  // UNA sola vez al abrir: es la pregunta «¿hay plaza para mí?», sin efectos en el servidor. ⚠️ Con la guarda: las
  // funciones cambian de identidad en cada render del padre (al confirmarse la plaza, la ficha se relee) y, sin ella,
  // la hoja volvía a «Comprobando…» encima de «Reservada».
  const arrancada = useRef(false);
  useEffect(() => {
    if (arrancada.current) return;
    arrancada.current = true;
    void comprobar();
  }, [comprobar]);

  // 2. «Continuar»: el cobro. El estado de carga se enciende ANTES de la petición.
  const continuar = useCallback(async (opciones: OpcionDeClase[]) => {
    const op = opciones.find((o) => o.planId === elegida);
    if (!op) return;
    const plan = planDeOpcion(planes, op, studioId);
    setEstado({ fase: 'preparando', opciones });
    if (op.tipo === 'prueba' && op.gratis) {
      // P07: la prueba gratis no pasa por Stripe: la reserva de siempre con `pruebaPlanId`.
      const g = await reservarPruebaGratis({ studioId, sesionId: clase.id, spotId, pruebaPlanId: op.planId });
      if (!viva.current) return;
      switch (g.tipo) {
        case 'confirmada':
          onReservada();
          setEstado({ fase: 'resuelto', desenlace: { tipo: 'confirmada', clase: null } });
          return;
        case 'lista_espera':
          setEstado({ fase: 'resuelto', desenlace: { tipo: 'prueba-en-espera', posicion: g.posicion } });
          return;
        case 'rechazo-prueba': {
          const resto = opciones.filter((o) => o.tipo !== 'prueba');
          if (resto.length === 0) { setEstado({ fase: 'no-se-puede', titulo: 'Tu primera clase', mensaje: g.mensaje }); return; }
          setElegida(resto[0].planId);
          setEstado({ fase: 'elegir', opciones: resto, aviso: g.mensaje });
          return;
        }
        case 'rechazo':
          setEstado({ fase: 'no-se-puede', titulo: 'No hemos podido reservarla', mensaje: g.mensaje });
          return;
        case 'dos-pasos': onSegundoPaso(); return;
        case 'sesion':
          setEstado({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar.', sesionCaducada: true });
          return;
        default:
          setEstado({ fase: 'error', mensaje: g.mensaje, opciones });
      }
      return;
    }
    let r = await iniciarPagoDeClase({
      studioId, planId: op.planId, socioId, sesionId: clase.id, spotId, codigoDescuento: null,
      aceptaCondiciones: textosLegales ? acepta : true,
    });
    // Otro intento suyo está creando el cobro (doble toque, otra pestaña): un segundo y otra vez.
    for (let i = 0; r.tipo === 'preparandose' && i < REINTENTOS_PREPARANDOSE; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      if (!viva.current) return;
      r = await iniciarPagoDeClase({
        studioId, planId: op.planId, socioId, sesionId: clase.id, spotId, codigoDescuento: null,
        aceptaCondiciones: textosLegales ? acepta : true,
      });
    }
    if (!viva.current) return;
    switch (r.tipo) {
      case 'ok':
        setEstado({
          fase: 'pagando', opciones, plan, clientSecret: r.clientSecret,
          importe: r.importe ?? op.importe, descuento: r.descuento, matricula: r.matricula,
        });
        return;
      case 'pago-en-curso':
        if (r.pi) { void confirmar(r.pi); return; }
        setEstado({ fase: 'error', mensaje: r.mensaje, opciones });
        return;
      case 'rechazo': {
        // P07: la prueba no vale (ya no es su primera visita, otra a medio pagar…): las demás opciones siguen.
        const resto = opciones.filter((o) => o.tipo !== 'prueba');
        if (r.codigo?.startsWith('prueba-') && resto.length > 0) {
          setElegida(resto[0].planId);
          setEstado({ fase: 'elegir', opciones: resto, aviso: r.mensaje });
          return;
        }
        // La plaza ya no está, o algo cambió: lo que diga el servidor, y nada de pago.
        setEstado({ fase: 'no-se-puede', titulo: 'No hemos podido cobrarte', mensaje: r.mensaje, impago: r.codigo === 'impago' });
        return;
      }
      case 'preparandose':
        setEstado({ fase: 'error', mensaje: 'Estamos preparando tu pago. Inténtalo en un momento: no se te ha cobrado nada.', opciones });
        return;
      case 'faltan-preguntas':
        setEstado({ fase: 'no-se-puede', titulo: 'Antes, unas preguntas del estudio', mensaje: 'Contéstalas y vuelve a intentarlo. No te hemos cobrado nada.' });
        return;
      case 'dos-pasos':
        onSegundoPaso();
        return;
      case 'sesion':
        setEstado({ fase: 'error', mensaje: 'Tu sesión ha caducado. Vuelve a entrar: no se te ha cobrado nada.', sesionCaducada: true });
        return;
      default:
        setEstado({ fase: 'error', mensaje: r.mensaje, opciones });
    }
  }, [elegida, planes, studioId, socioId, clase.id, spotId, textosLegales, acepta, confirmar, onSegundoPaso, onReservada]);

  const sinCobro = !stripeAccountId || !publishableKey;
  const bloqueada = estado.fase === 'preparando' || estado.fase === 'confirmando' || confirmandoStripe;

  return (
    <Sheet open onClose={bloqueada ? () => {} : onCerrar} label={`Pagar y reservar ${clase.nombre}`}>
      <div className="px" style={{ paddingBottom: 16 }}>
        <h2 className="t-title">{clase.nombre}</h2>
        <p className="t-meta" style={{ marginTop: 2 }}>{fechaLarga(clase.fecha)} · {clase.hora}</p>

        <div key={estado.fase} data-testid={'pagar-clase-' + estado.fase} className="a-fade" style={{ marginTop: 'var(--s-3)' }}>
          {estado.fase === 'comprobando' ? (
            <p role="status" className="t-meta">Comprobando la plaza…</p>
          ) : estado.fase === 'no-se-puede' ? (
            <>
              <h3 className="t-card-title">{estado.titulo}</h3>
              <p role="alert" className="note note--warn" style={{ marginTop: 8 }}>{estado.mensaje}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                {estado.impago && <Link href={hrefPagos} className="btn btn--primary" style={{ flex: 1 }}>Pagar lo pendiente</Link>}
                <Button variant="secondary" full={!estado.impago} onClick={onCerrar}>Cerrar</Button>
              </div>
            </>
          ) : estado.fase === 'error' ? (
            <>
              <p role="alert" className="note note--warn">{estado.mensaje}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {estado.sesionCaducada
                  ? <Button full onClick={onSesionCaducada}>Volver a entrar</Button>
                  : <Button full onClick={() => void comprobar()}>Intentar de nuevo</Button>}
                <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
              </div>
            </>
          ) : estado.fase === 'elegir' || estado.fase === 'preparando' ? (
            sinCobro && !estado.opciones.some((o) => o.gratis) ? (
              <>
                <p className="t-meta">Este estudio todavía no tiene los pagos activados en la app. Escríbeles y te lo resuelven.</p>
                <Button variant="secondary" full onClick={onCerrar} style={{ marginTop: 14 }}>Entendido</Button>
              </>
            ) : (
              <>
                {estado.fase === 'elegir' && estado.aviso && (
                  <p role="status" className="note note--warn" data-testid="aviso-prueba" style={{ marginBottom: 'var(--s-3)' }}>{estado.aviso}</p>
                )}
                <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>Cómo vienes</p>
                <div role="radiogroup" aria-label="Cómo vienes a esta clase" className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                  {estado.opciones.filter((o) => o.gratis || !sinCobro).map((o) => (
                    <label
                      key={o.planId}
                      className="card card--pad"
                      data-plan={o.planId}
                      style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: 'pointer', outline: elegida === o.planId ? '2px solid var(--accent)' : undefined }}
                    >
                      <input
                        type="radio" name="opcion-clase" value={o.planId} checked={elegida === o.planId}
                        disabled={estado.fase === 'preparando'} onChange={() => setElegida(o.planId)}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 800 }}>{nombreOpcion(o)}</span>
                        <span className="t-meta">{detalleOpcion(o)}</span>
                      </span>
                      <span className="t-num no-shrink" style={{ fontWeight: 800 }}>{precioOpcion(o)}</span>
                    </label>
                  ))}
                </div>
                {textosLegales && !estado.opciones.find((o) => o.planId === elegida)?.gratis && (
                  <label className="t-small" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 'var(--s-3)' }}>
                    <input type="checkbox" checked={acepta} disabled={estado.fase === 'preparando'} onChange={(e) => setAcepta(e.target.checked)} />
                    <span>Acepto las condiciones y la política de privacidad del estudio.</span>
                  </label>
                )}
                <p className="t-small t-dim" style={{ marginTop: 'var(--s-3)' }}>
                  Comprobamos tu plaza antes de cobrar. El cobro lo hace el estudio a través de Stripe.
                </p>
                {(() => {
                  const op = estado.opciones.find((o) => o.planId === elegida);
                  return (
                    <Button
                      full
                      loading={estado.fase === 'preparando'}
                      disabled={!op || (!!textosLegales && !op.gratis && !acepta)}
                      onClick={() => void continuar(estado.opciones)}
                      style={{ marginTop: 'var(--s-3)' }}
                    >
                      {estado.fase === 'preparando'
                        ? (op?.gratis ? 'Reservando…' : 'Comprobando tu plaza…')
                        : op?.gratis ? 'Reservar gratis' : `Continuar · ${op ? euros(op.importe) : ''}`}
                    </Button>
                  );
                })()}
              </>
            )
          ) : estado.fase === 'pagando' ? (
            <>
              {(estado.descuento > 0 || estado.matricula > 0) && (
                <div className="card card--pad stack" data-testid="desglose" style={{ ['--gap' as string]: 'var(--s-1)', marginBottom: 'var(--s-3)' }}>
                  {estado.descuento > 0 && (
                    <div className="row row--between"><span className="t-small t-dim">Descuento</span><span className="t-small t-num">−{euros(estado.descuento)}</span></div>
                  )}
                  {estado.matricula > 0 && (
                    <div className="row row--between"><span className="t-small t-dim">Matrícula</span><span className="t-small t-num">{euros(estado.matricula)}</span></div>
                  )}
                  <div className="row row--between"><span className="t-card-title">Total</span><span className="t-card-title t-num">{euros(estado.importe)}</span></div>
                </div>
              )}
              {publishableKey && stripeAccountId && (
                <CheckoutEmbebido
                  t={MODO_TOKENS.dia}
                  plan={estado.plan}
                  clientSecret={estado.clientSecret}
                  publishableKey={publishableKey}
                  stripeAccountId={stripeAccountId}
                  importeTotal={estado.importe}
                  textoBoton={`Pagar ${euros(estado.importe)} y reservar`}
                  onProcesando={setConfirmandoStripe}
                  onExito={() => {
                    setConfirmandoStripe(false);
                    const pi = piDeClientSecret(estado.clientSecret);
                    if (pi) void confirmar(pi);
                    else setEstado({ fase: 'resuelto', desenlace: { tipo: 'tarda' } });
                  }}
                  onCerrar={onCerrar}
                />
              )}
            </>
          ) : estado.fase === 'confirmando' ? (
            <div role="status" aria-live="polite" style={{ textAlign: 'center', padding: '12px 0 4px' }}>
              <span aria-hidden style={{ display: 'inline-block', width: 22, height: 22, borderRadius: 'var(--radius-round)', border: '2px solid var(--border-strong)', borderTopColor: 'var(--accent)', animation: 'apSpin .7s linear infinite' }} />
              <h3 className="t-title" style={{ marginTop: 12 }}>Pago hecho. Confirmando tu plaza…</h3>
              <p className="t-meta" style={{ marginTop: 6 }}>Tarda unos segundos; no tienes que hacer nada.</p>
            </div>
          ) : (
            <Desenlace d={estado.desenlace} clase={clase} onCerrar={onCerrar} hrefMisReservas={hrefMisReservas} hrefMensajes={hrefMensajes} />
          )}
        </div>
      </div>
    </Sheet>
  );
}

function Desenlace({ d, clase, onCerrar, hrefMisReservas, hrefMensajes }: {
  d: DesenlacePagoClase; clase: { nombre: string; fecha: string; hora: string };
  onCerrar: () => void; hrefMisReservas: string; hrefMensajes: string;
}) {
  if (d.tipo === 'confirmada') {
    return (
      <div className="a-pop" style={{ textAlign: 'center', padding: '8px 0 4px' }}>
        <Sello />
        <h3 className="t-title" style={{ marginTop: 14 }}>Reservada</h3>
        <p className="t-meta" data-testid="reserva-pagada-confirmada" style={{ marginTop: 6 }}>{clase.nombre} · {fechaLarga(clase.fecha)} · {clase.hora}</p>
        <Link href={hrefMisReservas} className="btn btn--primary" style={{ display: 'flex', marginTop: 14 }}>Ver mi reserva</Link>
        <Button full variant="secondary" onClick={onCerrar} style={{ marginTop: 8 }}>Cerrar</Button>
      </div>
    );
  }
  let titulo: string;
  let cuerpo: string;
  switch (d.tipo) {
    case 'compensada': ({ titulo, cuerpo } = textoCompensacion(d.compensacion, fechaLarga)); break;
    case 'lista_espera': titulo = 'Estás en la lista de espera'; cuerpo = 'La clase se llenó mientras pagabas. Si se libera una plaza, es tuya y te avisamos.'; break;
    case 'pendiente_aprobacion': titulo = 'Tu reserva espera al estudio'; cuerpo = 'En esta clase el estudio aprueba cada reserva. Te avisamos en cuanto conteste.'; break;
    case 'ya_tenia_plaza': titulo = 'Ya tenías esta clase'; cuerpo = 'No te hemos reservado otra plaza. Lo que has pagado queda a tu favor.'; break;
    case 'reembolsada': titulo = 'El estudio te ha devuelto el dinero'; cuerpo = 'Este pago ya no cuenta para esta clase.'; break;
    case 'prueba-en-espera':
      titulo = d.posicion ? `Estás la ${d.posicion}.ª en la lista de espera` : 'Estás en la lista de espera';
      cuerpo = 'La clase está llena. Si se libera una plaza te avisamos, y tu clase de prueba sigue disponible para otra clase.';
      break;
    case 'fallida': titulo = 'Pago hecho, pero sin plaza'; cuerpo = 'No hemos podido darte la plaza. El estudio ya lo sabe y te lo resuelve.'; break;
    default:
      // Se agotó la espera: el pago está, la plaza se está confirmando. Nunca un ✓ ni «vuelve a pagar».
      titulo = 'Tu pago está hecho';
      cuerpo = 'Tu plaza se está confirmando. Te avisamos en cuanto esté; no vuelvas a pagar. Si en un rato no la ves en tus reservas, escribe al estudio.';
  }
  return (
    <div role="status" data-testid={'pago-clase-' + d.tipo} style={{ padding: '8px 0 4px' }}>
      <h3 className="t-title">{titulo}</h3>
      <p className="t-meta" style={{ marginTop: 6, lineHeight: 1.55 }}>{cuerpo}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {d.tipo === 'tarda' || d.tipo === 'fallida'
          ? <Link href={hrefMensajes} className="btn btn--secondary" style={{ flex: 1 }}>Escribir al estudio</Link>
          : <Link href={hrefMisReservas} className="btn btn--secondary" style={{ flex: 1 }}>Mis reservas</Link>}
        <Button variant="secondary" onClick={onCerrar}>Cerrar</Button>
      </div>
    </div>
  );
}
