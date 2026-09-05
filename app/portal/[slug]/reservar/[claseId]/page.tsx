'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { getBonos, getClase, getInstructoras, getReservas } from '@/lib/student/datos';
import { getFavoritos } from '@/lib/student/favoritos';
import { confirmarReserva } from '@/lib/student/reservar';
import { avisoCancelacion, disponibilidad, transicionValida } from '@/lib/student/maquina-reserva';
import { etiquetaDia, euros, horaFin, precioClaseTexto } from '@/lib/student/formato';
import type { BookingState } from '@/lib/student/tipos';
import { AvailabilityBadge } from '@/components/student/ui/Badge';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { BookingButton } from '@/components/student/domain/BookingButton';
import { BookingSummary } from '@/components/student/domain/BookingSummary';
import { BookingStatus } from '@/components/student/domain/BookingStatus';
import { InstructorCard } from '@/components/student/domain/InstructorCard';
import { FavoritoButton } from '@/components/student/domain/FavoritoButton';

// Ficha de clase + hoja de reserva (§A.7). Es la pantalla donde la máquina de
// estados del paquete se conecta al servidor real.
//
// ⚠️ Lo que NO se hace aquí, y es el punto entero de la fase:
//   · No se decide si hay plaza. Se pide, y el servidor contesta.
//   · No se pinta `confirmed` optimistamente ni «mientras carga».
//   · `?outcome=` del paquete NO existe: era una ayuda de revisión para forzar
//     el desenlace, y en producción es una vía para enseñarle a una alumna una
//     confirmación que nadie ha confirmado (§K.8 del handoff pide quitarlo).
export default function FichaClasePage() {
  const { claseId } = useParams<{ claseId: string }>();
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const [bk, setBk] = useState<BookingState>('idle');
  // El motivo CONCRETO del servidor, cuando lo hay. Va aparte del estado
  // porque la máquina del diseño no tiene un estado para cada rechazo: «no
  // tienes bono activo» y «has llegado a tu tope de reservas» caen los dos en
  // `error`, y sin guardar el mensaje se pintaba el copy de avería genérico.
  const [bkMensaje, setBkMensaje] = useState<string | undefined>(undefined);
  // Corazón optimista: `null` = lo que diga el payload; true/false = lo que
  // acaba de pulsar la alumna (y se revierte si el servidor dice que no).
  const [favoritaLocal, setFavoritaLocal] = useState<boolean | null>(null);

  const cargar = useCallback(async () => {
    const [clase, reservas, bonos, instructoras, favoritos] = await Promise.all([
      getClase(estudio.slug, claseId), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getFavoritos(estudio.slug),
    ]);
    return { clase, reservas, bonos, instructoras, favoritos };
  }, [estudio.slug, claseId]);

  const { data, estado, reintentar } = useAsync(cargar, (d) => !d.clase);

  const clase = data?.clase ?? null;
  const inst = data?.instructoras.find((i) => i.id === clase?.instructoraId);
  const disp = clase ? disponibilidad(clase, data?.reservas ?? [], estudio.soportaListaEspera) : 'disponible';
  const bono = data?.bonos.find((b) => b.estado === 'activo' && b.creditosUsados < b.creditosTotales) ?? null;
  const aviso = clase ? avisoCancelacion(clase, estudio.politicaCancelacionHoras) : null;
  const favorita = favoritaLocal ?? (clase ? (data?.favoritos.has(clase.tipoClaseId) ?? false) : false);

  /** Cambia de estado solo si la máquina lo permite. */
  const ir = useCallback((a: BookingState) => {
    // El mensaje pertenece a la respuesta que lo trajo: al cambiar de estado
    // por nuestra cuenta (reintentar, volver a la revisión) deja de valer.
    setBkMensaje(undefined);
    setBk((de) => (transicionValida(de, a) ? a : de));
  }, []);

  const confirmar = useCallback(async () => {
    if (!clase) return;
    if (!online) { ir('offline'); return; }
    ir('submitting');
    // `confirmarReserva` no lanza nunca: traduce cualquier fallo a un estado
    // que esta pantalla sabe pintar. Si lanzara, el sheet se quedaría en
    // «Confirmando…» para siempre, que es la peor pantalla posible.
    const r = await confirmarReserva(estudio.slug, clase.id, estudio.id, {
      online,
    });
    setBk(r.state);
    setBkMensaje(r.mensaje);
    // Los datos han cambiado: la clase tiene una plaza menos y ella una reserva
    // más. Sin recargar, volver atrás enseña el aforo de antes.
    if (r.state === 'confirmed' || r.state === 'waitlisted') reintentar();
  }, [clase, online, estudio.slug, estudio.id, ir, reintentar]);

  const cerrar = useCallback(() => {
    // Durante el envío la hoja no se cierra: cerrarla dejaría a la alumna sin
    // saber en qué acabó una operación que ya está en marcha.
    if (bk === 'submitting') return;
    setBkMensaje(undefined);
    setBk('idle');
  }, [bk]);

  const finalizar = useCallback(() => {
    if (bk === 'confirmed' || bk === 'waitlisted') router.push(href('/mis-reservas'));
    else if (bk === 'session-expired') router.push(href('/acceso/login'));
    else { setBkMensaje(undefined); setBk('idle'); }
  }, [bk, router, href]);

  if (estado === 'loading') {
    return (
      <StudentShell>
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton h={280} r={20} style={{ marginTop: -56 }} />
          <Skeleton h={22} w="60%" />
          <Skeleton h={12} w="80%" />
          <Skeleton h={74} r={14} />
          <Skeleton h={74} r={14} />
        </div>
      </StudentShell>
    );
  }

  if (estado === 'error' || !clase) {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState
            titulo="No encontramos esta clase"
            cuerpo="Puede que se haya cancelado o movido de hora."
            onRetry={reintentar}
          />
        </div>
      </StudentShell>
    );
  }

  const enSheet = bk !== 'idle';
  const esFinal = enSheet && bk !== 'reviewing' && bk !== 'submitting';

  return (
    <StudentShell>
      {/* ⚠️ `background` no está en el paquete: allí `clase.fotoUrl` SIEMPRE
          existe (es un mock). Aquí puede no haberla, y sin tinta detrás el
          héroe degradaba a crema: el degradado del paquete arranca en
          `rgba(15,15,15,.36)`, que sobre crema deja el título y la cabecera
          transparente en blanco sobre claro — ilegibles. `#0F0F0C` es la misma
          tinta que el propio paquete pone bajo la foto del layout de acceso
          (`.st-auth-hero`), así que sin foto se ve como el diseño espera. */}
      <section style={{ position: 'relative', height: 290, marginTop: -56, overflow: 'hidden', background: '#0F0F0C' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={clase.fotoUrl}
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', animation: 'apKen 18s ease-in-out infinite' }}
        />
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,15,.36), rgba(15,15,15,0) 36%, rgba(15,15,15,0) 55%, rgba(15,15,15,.64))' }}
        />
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          style={{ position: 'absolute', top: 'calc(56px + var(--safe-top))', left: 14, width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', fontSize: 15 }}
        >
          ←
        </button>
        <FavoritoButton
          slug={estudio.slug} studioId={estudio.id} tipoClaseId={clase.tipoClaseId}
          marcada={favorita} onCambio={setFavoritaLocal}
          style={{ position: 'absolute', top: 'calc(56px + var(--safe-top))', right: 14 }}
        />
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, color: '#fff' }}>
          <p className="t-label" style={{ color: 'rgba(255,255,255,.82)' }}>{clase.tipo} · nivel {clase.nivel.toLowerCase()}</p>
          <h1 style={{ margin: '3px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>{clase.nombre}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[`${etiquetaDia(clase.fecha)} · ${clase.hora}`, `${clase.duracionMin} min`, clase.sala].map((t) => (
              <span key={t} className="badge" style={{ background: 'rgba(250,249,245,.2)', border: '1px solid rgba(255,255,255,.45)', color: '#fff' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 14, paddingBottom: 90 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <AvailabilityBadge estado={disp} plazas={clase.plazasLibres} />
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--muted-foreground)' }}>
            {bono ? 'Con tu bono · 1 sesión' : (clase.sinPrecioSuelto ? 'Solo con bono' : `${euros(clase.precioSuelto)} clase suelta`)}
          </span>
        </div>

        {inst && <InstructorCard i={inst} />}

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
          {clase.descripcion ?? `Grupo reducido de ${clase.capacidad} personas. Ven con calcetines antideslizantes; si es tu primera vez, llega 10 minutos antes.`}
        </p>

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Fila k="Cuándo" v={`${etiquetaDia(clase.fecha)} · ${clase.hora} – ${horaFin(clase.hora, clase.duracionMin)}`} />
          <Fila k="Dónde" v={`${estudio.direccion} · ${clase.sala}`} />
          <Fila k="Capacidad" v={`${clase.capacidad} personas · ${clase.plazasLibres} libres`} />
          <Fila
            k="Cancelación"
            v={aviso?.devolveriaCredito
              ? `Gratis hasta ${estudio.politicaCancelacionHoras} h antes`
              : 'Ya no devuelve la sesión'}
          />
        </div>

        {!online && <OfflineState cuerpo="Puedes ver la clase, pero reservar necesita conexión." />}
      </div>

      {/* CTA persistente sobre la nav */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--nav-height) + var(--safe-bottom))',
          zIndex: 39, padding: '10px 16px 12px',
          background: 'linear-gradient(180deg, rgba(250,249,245,0), var(--background) 40%)',
          maxWidth: 640, margin: '0 auto',
        }}
      >
        <BookingButton
          estado={disp}
          online={online}
          onReservar={() => ir('reviewing')}
          onEspera={() => ir('reviewing')}
          onCancelar={() => router.push(href('/mis-reservas'))}
        />
      </div>

      <Sheet open={enSheet} onClose={cerrar} label="Reservar clase">
        {(bk === 'reviewing' || bk === 'submitting') && (
          <>
            <h3 className="t-h2" style={{ fontSize: 18 }}>
              {disp === 'completa' ? 'Clase llena — lista de espera' : 'Confirma tu plaza'}
            </h3>
            <div style={{ marginTop: 12 }}>
              <BookingSummary
                clase={clase}
                instructora={inst}
                bono={disp === 'completa' ? null : bono}
                politicaHoras={estudio.politicaCancelacionHoras}
              />
            </div>
            {disp === 'completa' && (
              <p className="t-meta" style={{ marginTop: 8, textAlign: 'center' }}>
                Sin coste — solo reservas si se libera y tú confirmas.
              </p>
            )}
            <Button full loading={bk === 'submitting'} onClick={confirmar} style={{ marginTop: 14, height: 50, fontSize: 14 }}>
              {disp === 'completa'
                ? 'Unirme a la lista de espera'
                : `Confirmar ${clase.hora}${bono ? ' con bono' : ` · ${precioClaseTexto(clase)}`}`}
            </Button>
            {bk === 'submitting' && (
              <p className="t-meta" style={{ marginTop: 8, textAlign: 'center' }}>
                Confirmando con el estudio… no cierres la app.
              </p>
            )}
          </>
        )}

        {esFinal && (
          <BookingStatus
            state={bk as Exclude<BookingState, 'idle' | 'reviewing' | 'submitting'>}
            mensaje={bkMensaje}
            onRetry={() => ir('reviewing')}
            onWaitlist={() => ir('reviewing')}
            onClose={finalizar}
          />
        )}
      </Sheet>
    </StudentShell>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5 }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
