'use client';

import { nombreCreditos } from '@/lib/creditos-nombre';

import { useCallback, useState } from 'react';
import Link from 'next/link';
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
import { horaFin, hoyISO } from '@/lib/student/formato';
import { textoPagoCorto } from '@/lib/student/como-se-paga';
import { comoVienes } from '@/lib/student/como-vienes';
import {
  antetituloClase, consultaMapa, textoCancelacion, textoCreditosAlAsistir, textoCuando, textoDonde, textoPlazas,
} from '@/lib/student/ficha-clase-textos';
import { urlComoLlegar } from '@/lib/student/enlaces-clase';
import { useHojaReserva } from '@/lib/student/use-hoja-reserva';
import { AvailabilityBadge, EnCursoBadge, TerminadaBadge } from '@/components/student/ui/Badge';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso, yaTermino } from '@/lib/student/estado-clase';
import { etiquetaAperturaSuave } from '@/lib/opening/apertura-suave-texto';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { FilaDato } from '@/components/student/ui/FilaDato';
import { Icono } from '@/components/student/ui/Icono';
import { BookingButton } from '@/components/student/domain/BookingButton';
import { huecosDeClase } from '@/components/student/domain/ElegirHueco';
import { HojaReserva } from '@/components/student/domain/HojaReserva';
import { InstructorCard } from '@/components/student/domain/InstructorCard';
import { FavoritoButton } from '@/components/student/domain/FavoritoButton';
import { FichaClaseHero } from '@/components/student/domain/FichaClaseHero';
import { AutoReservable } from '@/components/student/domain/AutoReservable';
import { InstructoraSheet } from '@/components/student/domain/InstructoraSheet';
import { ComoVienes } from '@/components/student/domain/ComoVienes';
import { CompartirClase, InvitarAClaseFila } from '@/components/student/domain/CompartirClase';
import { formasDeGanar, premioPorInvitar } from '@/lib/student/gamificacion';
import { cuandoSeAbre, etiquetaSeAbre } from '@/lib/reservar/apertura-texto';
import { useAunNoAbre } from '@/lib/reservar/use-aun-no-abre';

// Ficha de clase + hoja de reserva (§A.7). Es la pantalla donde la máquina de
// estados del paquete se conecta al servidor real.
//
// La acción principal es RESERVAR (el botón fijo de abajo). La clase fija se pide
// aquí también, pero con el interruptor «Clase fija» (`AutoReservable`), una
// tarjeta y no un segundo botón: el 23-sep, con dos botones iguales, las alumnas no
// sabían cuál tocar. Es el ÚNICO sitio donde se pide (4-oct-2026).
//
// Rediseño P10 (5-oct-2026): la foto se ve entera y el título va DEBAJO; los datos van en filas con icono («Cómo llegar»
// y «Escribe al estudio» incluidos), y «Cómo vienes» (P02) le dice con SUS datos con qué viene. Compartir pasa a un
// icono sobre la foto (P04). Nada de lo de antes se ha quitado: ver el inventario del PR.
//
// ⚠️ Lo que NO se hace aquí, y es el punto entero de la fase:
//   · No se decide si hay plaza. Se pide, y el servidor contesta.
//   · No se pinta `confirmed` optimistamente ni «mientras carga».
//   · `?outcome=` del paquete NO existe: era una ayuda de revisión para forzar
//     el desenlace, y en producción es una vía para enseñarle a una alumna una
//     confirmación que nadie ha confirmado (§K.8 del handoff pide quitarlo).
//   · ⚠️ Antes de la barra fija no puede haber ningún BOTÓN con «reservar» en su nombre: es el que buscan las guardas.
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
      // Del mismo payload, 0 peticiones: quién es (el enlace de compartir lleva quién invita), qué vende el estudio
      // («Ver bonos y cuotas» solo si algo la cubre) y los nombres de los tipos (los topes por actividad).
      socioId: payload?.socia?.socio?.id ?? null,
      // Cómo premia el estudio (sus reglas activas): la fila de invitar dice lo que gana, o no sale.
      formasDeGanar: formasDeGanar(payload?.rewardRules ?? []),
      planesTarifa: payload?.planesTarifa ?? [],
      nombresTipo: Object.fromEntries((payload?.tiposClase ?? []).map((t) => [t.id, t.nombre])) as Record<string, string>,
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
  const empezada = enCurso || terminada;
  const yaNoSeReserva = empezada && disp !== 'reservada' && disp !== 'lista-espera';
  // Hora fija del estudio: hasta que se abra, el botón espera y dice cuándo, y
  // se enciende solo a la hora exacta (`useAunNoAbre`, un temporizador).
  const aunNoAbre = useAunNoAbre(clase && disp !== 'reservada' && disp !== 'lista-espera' ? clase.seAbreEl : null);
  // El que de VERDAD paga esta clase: la cuota que la cubre, si la hay («la mensual gana», como el servidor), o el bono
  // que gastaría. Un plan puede estar acotado a ciertos tipos, y el servidor lo aplica al reservar.
  const bono = clase ? bonoParaClase(data?.bonos ?? [], clase.tipoClaseId) : null;
  const bonoNoCubre = clase ? tieneBonoQueNoCubre(data?.bonos ?? [], clase.tipoClaseId) : false;
  const aviso = clase ? avisoCancelacion(clase, estudio.politicaCancelacionHoras) : null;
  const favorita = favoritaLocal ?? (clase ? (data?.favoritos.has(clase.tipoClaseId) ?? false) : false);

  if (estado === 'loading') {
    return (
      <StudentShell headerTransparente>
        {/* La misma geometría que la ficha: la foto a sangre, el título debajo y las filas. */}
        <Skeleton h={290} r={0} style={{ height: 'calc(290px + var(--safe-top))' }} />
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 18 }}>
          <Skeleton h={12} w="40%" />
          <Skeleton h={30} w="70%" />
          <Skeleton h={18} w="55%" />
          <Skeleton h={64} r={14} />
          <Skeleton h={190} r={14} />
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

  const huecos = huecosDeClase(data?.spots, data?.aforoReservas, clase.salaId, clase.id);
  const hoy = hoyISO();
  const vienes = comoVienes({
    clase, bonos: data?.bonos ?? [], disp, reservas: data?.reservas ?? [], yaNoSeReserva,
    planesTarifa: data?.planesTarifa, nombresTipo: data?.nombresTipo ?? {}, hoy,
  });
  const donde = textoDonde(estudio, clase.sala);
  // «Cómo llegar» abre Mapas con la MISMA búsqueda que la tarjeta de Inicio (`consultaMapa`). Sin dirección no se pinta.
  const comoLlegar = () => window.open(urlComoLlegar(consultaMapa(estudio.direccion, estudio.ciudad), estudio.nombre, navigator.userAgent), '_blank', 'noopener');
  const suave = etiquetaAperturaSuave(clase.inicio, estudio.aperturaSuaveHasta);
  const premio = premioPorInvitar(data?.formasDeGanar ?? [], nombreCreditos(estudio.creditosNombre));

  return (
    // `headerTransparente`, igual que Inicio: esta pantalla también abre con
    // una foto a sangre y la cabecera del estudio flota encima (campana y Perfil
    // siguen ahí). El velo va DENTRO de `StudioHeader`.
    <StudentShell headerTransparente>
      <FichaClaseHero
        clase={clase}
        derecha={(
          <div style={{ display: 'flex', gap: 8 }}>
            <FavoritoButton slug={estudio.slug} studioId={estudio.id} tipoClaseId={clase.tipoClaseId} marcada={favorita} onCambio={setFavoritaLocal} />
            {/* Una clase ya empezada no se ofrece a nadie: el enlace la abriría con «Reservar mi plaza» y el servidor la
                rechazaría. */}
            {!empezada && <CompartirClase clase={clase} socioId={data?.socioId ?? null} />}
          </div>
        )}
      />

      {/* Dos bloques y no una lista plana: en escritorio (`grid-lg-2`) cada hijo es una columna, y suelto se rompía el
          orden. En el móvil van uno debajo del otro, en el orden de P10.
          El margen de abajo deja leer y tocar lo último por encima de la barra fija de «Reservar». */}
      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 16, paddingBottom: 150, alignItems: 'start' }}>
        <div data-bloque="a" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* El LOGO de la clase, junto al título: el banner hereda (tipo → sala → estudio) y el logo es lo que la
                identifica. Sin logo propio no se pinta nada. */}
            {clase.logoUrl && (
              <span
                aria-hidden
                data-testid="logo-clase"
                style={{ display: 'block', flexShrink: 0, width: 32, height: 32, borderRadius: 9, background: `url(${clase.logoUrl}) center/cover`, border: '1px solid var(--border)' }}
              />
            )}
            <p className="t-label" style={{ margin: 0 }}>{antetituloClase(clase.nivel)}</p>
          </div>
          <h1
            className="t-h1"
            style={{ margin: 0, fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.03em', lineHeight: 1.05, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {clase.nombre}
          </h1>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {yaNoSeReserva
              ? (enCurso ? <EnCursoBadge terminaA={horaFin(clase.hora, clase.duracionMin)} /> : <TerminadaBadge />)
              // Sin reloj todavía (hidratación) no se dice «hoy» ni «mañana»: la fecha sola.
              : aunNoAbre
                ? <span data-se-abre="" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)' }}>{ahoraMs === null ? etiquetaSeAbre(aunNoAbre) : `La reserva se abre ${cuandoSeAbre(new Date(aunNoAbre), new Date(ahoraMs))}`}</span>
                : <AvailabilityBadge estado={disp} plazas={clase.plazasLibres} />}
            <span data-testid="pago-corto" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--muted-foreground)', textAlign: 'right' }}>
              {textoPagoCorto(clase, bono)}
            </span>
          </div>

          {/* Apertura suave: solo avisa. Una fundadora o invitada sí puede
              reservarla; eso lo decide el servidor (crearReservaPublica). */}
          {suave && <p style={{ fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>{suave}</p>}

          <ComoVienes vista={vienes} />

          <div className="card" style={{ padding: '2px 16px' }}>
            <FilaDato icono="calendario" fila="cuando">{textoCuando(clase, hoy)}</FilaDato>
            <FilaDato
              icono="ubicacion"
              fila="donde"
              sub={donde.sub}
              accion={donde.sub ? (
                <button type="button" className="tap" onClick={comoLlegar} style={{ border: 'none', background: 'none', padding: 0, fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                  Cómo llegar <Icono nombre="chevron-derecha" tamano={16} />
                </button>
              ) : undefined}
            >
              {donde.linea}
            </FilaDato>
            {/* En vivo con el aforo. Con la clase empezada o terminada, solo el aforo (RES-11). */}
            <FilaDato icono="personas" fila="plazas">{textoPlazas(clase.capacidad, clase.plazasLibres, empezada)}</FilaDato>
            {aviso && <FilaDato icono="reloj" fila="cancelacion">{textoCancelacion(aviso)}</FilaDato>}
            {/* Lo que da venir a ESTA clase, solo si el estudio premia la asistencia. Se gana al registrar la asistencia,
                no al reservar. */}
            {clase.creditosAlAsistir != null && (
              <FilaDato icono="estrella" fila="creditos">{textoCreditosAlAsistir(clase.creditosAlAsistir, nombreCreditos(estudio.creditosNombre))}</FilaDato>
            )}
          </div>
        </div>

        <div data-bloque="b" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {inst && <InstructorCard i={inst} onClick={() => setVerInstructora(true)} />}

          {/* Solo la descripción que escribió el estudio. Sin ella no se pinta nada: antes se INVENTABA una con normas que
              ese estudio quizá no tiene. */}
          {clase.descripcion?.trim() && (
            <p style={{ margin: 0, fontSize: 'var(--t-small)', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
              {clase.descripcion}
            </p>
          )}

          {/* El interruptor «Clase fija»: no se mueve al tocarlo, abre lo que toque y sigue lo que conteste el servidor. Se carga aparte: no frena la reserva. */}
          <AutoReservable
            claseId={clase.id} fecha={clase.fecha} hora={clase.hora} salaId={clase.salaId} tipoClaseId={clase.tipoClaseId}
            ventanaCancelacionHoras={clase.ventanaCancelacionHoras ?? estudio.politicaCancelacionHoras}
            onCambio={refrescar}
          />

          {/* Invitar a una amiga a ESTA clase, con lo que gana: solo si el estudio premia invitar y la clase no ha
              empezado (el enlace la ofrecería con «Reservar mi plaza» y el servidor la rechazaría). */}
          {premio && !empezada && <InvitarAClaseFila clase={clase} socioId={data?.socioId ?? null} premio={premio} />}

          {/* Una duda sobre la clase: al estudio, por la bandeja de siempre (la misma de Perfil → «Escribir al estudio»). */}
          <Link href={href('/mensajes')} className="card card--tap" data-testid="escribe-al-estudio" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
            <span aria-hidden style={{ display: 'flex', color: 'var(--accent)' }}><Icono nombre="mensaje" tamano={20} /></span>
            <span className="t-small" style={{ flex: 1, minWidth: 0 }}>¿Dudas sobre esta clase? <b>Escribe al estudio</b></span>
            <span aria-hidden className="t-faint" style={{ display: 'flex' }}><Icono nombre="chevron-derecha" tamano={18} /></span>
          </Link>

          {!online && <OfflineState cuerpo="Puedes ver la clase, pero reservar necesita conexión." />}
        </div>
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
        yaEmpezo={empezada}
        contexto="ficha"
      />
    </StudentShell>
  );
}
