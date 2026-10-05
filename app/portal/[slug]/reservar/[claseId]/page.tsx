'use client';

import { nombreCreditos } from '@/lib/creditos-nombre';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { useOnline } from '@/lib/student/useOnline';
import { getBonos, getClases, getClasesFrescas, getInstructoras, getReservas } from '@/lib/student/datos';
import { getFavoritos } from '@/lib/student/favoritos';
import { bonoParaClase, tieneBonoQueNoCubre } from '@/lib/student/bono-cubre';
import { catalogo } from '@/lib/student/catalogo';
import { avisoCancelacion, disponibilidad } from '@/lib/student/maquina-reserva';
import { etiquetaDia, horaFin } from '@/lib/student/formato';
import { textoPagoCorto } from '@/lib/student/como-se-paga';
import { useHojaReserva } from '@/lib/student/use-hoja-reserva';
import { AvailabilityBadge, EnCursoBadge, TerminadaBadge } from '@/components/student/ui/Badge';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso, yaTermino } from '@/lib/student/estado-clase';
import { etiquetaAperturaSuave } from '@/lib/opening/apertura-suave-texto';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { BookingButton } from '@/components/student/domain/BookingButton';
import { huecosDeClase } from '@/components/student/domain/ElegirHueco';
import { HojaReserva } from '@/components/student/domain/HojaReserva';
import { InstructorCard } from '@/components/student/domain/InstructorCard';
import { FavoritoButton } from '@/components/student/domain/FavoritoButton';
import { FichaClaseHero } from '@/components/student/domain/FichaClaseHero';
import { AutoReservable } from '@/components/student/domain/AutoReservable';
import { InstructoraSheet } from '@/components/student/domain/InstructoraSheet';
import { cuandoSeAbre, etiquetaSeAbre } from '@/lib/reservar/apertura-texto';
import { useAunNoAbre } from '@/lib/reservar/use-aun-no-abre';
import { CompartirClase } from '@/components/student/domain/CompartirClase';

// Ficha de clase + hoja de reserva (§A.7). Es la pantalla donde la máquina de
// estados del paquete se conecta al servidor real.
//
// La acción principal es RESERVAR (el botón fijo de abajo). La clase fija se pide
// aquí también, pero con el interruptor «Clase fija» (`AutoReservable`), una
// tarjeta y no un segundo botón: el 23-sep, con dos botones iguales, las alumnas no
// sabían cuál tocar. Es el ÚNICO sitio donde se pide (4-oct-2026).
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
  // Corazón optimista: `null` = lo que diga el payload; true/false = lo que
  // acaba de pulsar la alumna (y se revierte si el servidor dice que no).
  const [favoritaLocal, setFavoritaLocal] = useState<boolean | null>(null);
  const [verInstructora, setVerInstructora] = useState(false);

  const cargar = useCallback(async () => {
    // `getClases` sale del MISMO payload que `getClase`: la ficha de la
    // instructora enseña sus próximas clases sin una petición más.
    const [clase, reservas, bonos, instructoras, favoritos, clases, payload] = await Promise.all([
      getClasesFrescas(estudio.slug).then((cs) => cs.find((c) => c.id === claseId) ?? null), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getFavoritos(estudio.slug), getClases(estudio.slug),
      // Los huecos de la sala y quién los ocupa. Son los ÚNICOS dos campos que
      // esta pantalla necesita en crudo: no tienen proyección propia porque
      // hasta ahora nadie los usaba en la app de la alumna. `catalogo` está
      // cacheado, así que no es una petición más.
      catalogo(estudio.slug),
    ]);
    return {
      clase, reservas, bonos, instructoras, favoritos, clases,
      spots: payload?.spots, aforoReservas: payload?.aforoReservas,
    };
  }, [estudio.slug, claseId]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.clase);
  // La hoja de reserva: la MISMA que abre «Reservar» desde la fila del horario (`useHojaReserva` + `HojaReserva`).
  // Tras confirmar relee con `refrescar` (sin esqueleto): con `reintentar` el esqueleto desmontaba la hoja a mitad de la
  // celebración. Una hoja a la vez: al abrir esta se cierra la de la instructora.
  const cerrarInstructora = useCallback(() => setVerInstructora(false), []);
  const hoja = useHojaReserva({ slug: estudio.slug, studioId: estudio.id, online, onCambio: refrescar, alCambiarDeEstado: cerrarInstructora });
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);

  const clase = data?.clase ?? null;

  const inst = data?.instructoras.find((i) => i.id === clase?.instructoraId);
  const disp = clase ? disponibilidad(clase, data?.reservas ?? [], estudio.soportaListaEspera) : 'disponible';
  // RES-11: `disponibilidad()` no sabe nada del reloj. Sobre una clase que ya
  // empezó o terminó ofrecía «Reservar» y el servidor la rechazaba
  // (`sesionYaEmpezada`). Solo se cierra la reserva NUEVA: quien ya tiene su
  // plaza o su sitio en la lista sigue viendo «Gestionar».
  const ahoraMs = useAhoraMs();
  const enCurso = clase ? estaEnCurso(clase, ahoraMs) : false;
  const terminada = clase ? yaTermino(clase, ahoraMs) : false;
  const yaNoSeReserva = (enCurso || terminada) && disp !== 'reservada' && disp !== 'lista-espera';
  // Hora fija del estudio: hasta que se abra, el botón espera y dice cuándo, y
  // se enciende solo a la hora exacta (`useAunNoAbre`, un temporizador).
  const aunNoAbre = useAunNoAbre(clase && disp !== 'reservada' && disp !== 'lista-espera' ? clase.seAbreEl : null);
  // El bono que de VERDAD cubre esta clase: un plan puede estar acotado a
  // ciertos tipos, y el servidor lo aplica al reservar. Elegir «el primero con
  // saldo» hacía que la hoja prometiera «no pagas nada hoy» y el servidor
  // rechazara la reserva.
  const bono = clase ? bonoParaClase(data?.bonos ?? [], clase.tipoClaseId) : null;
  const bonoNoCubre = clase ? tieneBonoQueNoCubre(data?.bonos ?? [], clase.tipoClaseId) : false;
  const aviso = clase ? avisoCancelacion(clase, estudio.politicaCancelacionHoras) : null;
  const favorita = favoritaLocal ?? (clase ? (data?.favoritos.has(clase.tipoClaseId) ?? false) : false);

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

  const huecos = clase ? huecosDeClase(data?.spots, data?.aforoReservas, clase.salaId, clase.id) : null;

  return (
    // `headerTransparente`, igual que Inicio: esta pantalla también abre con
    // una foto a sangre y la cabecera iba SÓLIDA encima. No era solo una
    // incoherencia — el `marginTop: -56` de la sección metía los primeros
    // 56 px de la foto DETRÁS de una barra crema opaca, así que la foto se
    // recortaba sola. Con la cabecera flotando se ve entera y la geometría no
    // cambia: `.page` pierde su relleno superior justo en los mismos 56 px que
    // compensaba ese margen negativo.
    //
    // El velo va DENTRO de `StudioHeader` (medido: el nombre a 8,53:1 sobre la
    // portada más clara), así que no hace falta ninguno aquí.
    <StudentShell headerTransparente>
      <FichaClaseHero
        clase={clase}
        chips={[`${etiquetaDia(clase.fecha)} · ${clase.hora}`, `${clase.duracionMin} min`, clase.sala]}
        derecha={<FavoritoButton slug={estudio.slug} studioId={estudio.id} tipoClaseId={clase.tipoClaseId} marcada={favorita} onCambio={setFavoritaLocal} />}
      />

      {/* El margen de abajo deja leer y tocar lo último (el bloque de reservar varias semanas con bono termina en su propio
          botón) por encima de la barra fija de «Reservar»: con 90 px quedaba debajo y no se llegaba con el scroll. */}
      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 14, paddingBottom: 150 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {yaNoSeReserva
            ? (enCurso ? <EnCursoBadge terminaA={horaFin(clase.hora, clase.duracionMin)} /> : <TerminadaBadge />)
            // Sin reloj todavía (hidratación) no se dice «hoy» ni «mañana»: la fecha sola.
            : aunNoAbre
              ? <span data-se-abre="" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)' }}>{ahoraMs === null ? etiquetaSeAbre(aunNoAbre) : `La reserva se abre ${cuandoSeAbre(new Date(aunNoAbre), new Date(ahoraMs))}`}</span>
              : <AvailabilityBadge estado={disp} plazas={clase.plazasLibres} />}
          <span style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)' }}>
            {textoPagoCorto(clase, bono)}
          </span>
        </div>

        {/* Apertura suave: solo avisa. Una fundadora o invitada sí puede
            reservarla; eso lo decide el servidor (crearReservaPublica). */}
        {(() => {
          const suave = etiquetaAperturaSuave(clase.inicio, estudio.aperturaSuaveHasta);
          return suave && <p style={{ fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{suave}</p>;
        })()}

        {inst && <InstructorCard i={inst} onClick={() => setVerInstructora(true)} />}

        {/* Solo la descripción que escribió el estudio. Sin ella no se pinta
            nada: antes se INVENTABA una («Grupo reducido de N personas. Ven con
            calcetines antideslizantes; si es tu primera vez, llega 10 minutos
            antes»), con normas que ese estudio quizá no tiene. El aforo real ya
            está en la tarjeta de abajo («Capacidad»). */}
        {clase.descripcion?.trim() && (
          <p style={{ margin: 0, fontSize: 'var(--t-small)', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
            {clase.descripcion}
          </p>
        )}

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Fila k="Cuándo" v={`${etiquetaDia(clase.fecha)} · ${clase.hora} – ${horaFin(clase.hora, clase.duracionMin)}`} />
          <Fila k="Dónde" v={`${estudio.direccion} · ${clase.sala}`} />
          <Fila k="Capacidad" v={`${clase.capacidad} personas · ${clase.plazasLibres} libres`} />
          <Fila
            k="Cancelación"
            v={aviso?.devolveriaCredito
              ? `Gratis hasta ${aviso.horasVentana} h antes`
              : 'Ya no devuelve la sesión'}
          />
          {/* Lo que da venir a ESTA clase, solo si el estudio premia la
              asistencia. Se gana al registrar la asistencia, no al reservar. */}
          {clase.creditosAlAsistir != null && (
            <Fila k={mayuscula(nombreCreditos(estudio.creditosNombre))} v={`+${clase.creditosAlAsistir} al asistir`} />
          )}
        </div>

        {/* El interruptor «Clase fija»: no se mueve al tocarlo, abre lo que toque y sigue lo que conteste el servidor. Se carga aparte: no frena la reserva. */}
        <AutoReservable
          claseId={clase.id} fecha={clase.fecha} hora={clase.hora} salaId={clase.salaId} tipoClaseId={clase.tipoClaseId}
          ventanaCancelacionHoras={clase.ventanaCancelacionHoras ?? estudio.politicaCancelacionHoras}
          onCambio={refrescar}
        />

        {/* Una clase que ya terminó no se ofrece a nadie. */}
        {!terminada && <CompartirClase clase={clase} />}

        {!online && <OfflineState cuerpo="Puedes ver la clase, pero reservar necesita conexión." />}
      </div>

      {/* CTA persistente sobre la nav */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 'var(--nav-total)',
          zIndex: 39, padding: '10px 16px 12px',
          // Del fondo del ESTILO del estudio, no un crema fijo: con «Carbón» era
          // una franja crema sobre una app oscura.
          background: 'linear-gradient(180deg, transparent, var(--background) 40%)',
          maxWidth: 640, margin: '0 auto',
        }}
      >
        {yaNoSeReserva ? (
          <Button full disabled data-testid="reserva-cerrada">
            {enCurso ? 'La clase ya ha empezado' : 'La clase ya ha terminado'}
          </Button>
        ) : aunNoAbre ? (
          <Button full disabled data-testid="reserva-aun-no-abre">
            {etiquetaSeAbre(aunNoAbre)}
          </Button>
        ) : (
          <BookingButton
            estado={disp}
            online={online}
            onReservar={hoja.abrir}
            onEspera={hoja.abrir}
            onCancelar={() => router.push(href('/mis-reservas'))}
          />
        )}
      </div>

      <InstructoraSheet
        instructora={inst ?? null} clases={data?.clases ?? []} reservas={data?.reservas ?? []} soportaEspera={estudio.soportaListaEspera} href={href}
        open={verInstructora} onClose={() => setVerInstructora(false)}
      />

      <HojaReserva
        hoja={hoja}
        clase={clase}
        instructora={inst}
        disp={disp}
        bono={bono}
        bonoNoCubre={bonoNoCubre}
        politicaHoras={aviso?.horasVentana ?? estudio.politicaCancelacionHoras}
        huecos={huecos}
        yaEmpezo={enCurso || terminada}
        contexto="ficha"
      />
    </StudentShell>
  );
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--t-small)' }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
