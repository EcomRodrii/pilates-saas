'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { compararPorCaducidad } from '@/lib/student/bono-cubre';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { getBonos, getClases, getInstructoras, getPlazaFija, getMinimoRacha, getReservas } from '@/lib/student/datos';
import { bonoParaClase } from '@/lib/student/bono-cubre';
import { getGamificacion } from '@/lib/student/gamificacion-datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { NextClassCard } from '@/components/student/domain/NextClassCard';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso, yaTermino } from '@/lib/student/estado-clase';
import { EmptyState, ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { añadirAlCalendario, urlComoLlegar } from '@/lib/student/enlaces-clase';
import { TuRitmo } from '@/components/student/domain/TuRitmo';
import { PlazaFijaCard } from '@/components/student/domain/PlazaFijaCard';
import { NivelCard } from '@/components/student/domain/NivelCard';
import { DelEstudio } from '@/components/student/domain/DelEstudio';
import { MensajesCard } from '@/components/student/domain/MensajesCard';
import { ValoracionCard } from '@/components/student/domain/ValoracionCard';
import { semanaDe, hechasEstaSemana, rachaSemanas } from '@/lib/student/ritmo';
import { useRouter } from 'next/navigation';

// Inicio (§A.5 del handoff): héroe fotográfico, próxima clase, bono y huecos de
// hoy. Estructura y medidas literales del paquete.
//
// ⚠️ «Huecos de hoy» no promete plaza. El paquete filtra por `plazasLibres > 0`
// con el aforo que el cliente cree tener, y ese número es ORIENTATIVO: no resta
// las máquinas averiadas, que no viajan en ningún payload público. Se enseña
// igual —es un atajo útil al horario— pero quien decide es el servidor al
// reservar, y por eso su rechazo tiene pantalla propia (`full`).
export default function InicioPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const router = useRouter();
  const { socia } = useSesionStudent(estudio.slug);
  const hoy = hoyISO();
  // `null` hasta que hidrata; los filtros que lo usan lo tratan como «todavía no».
  const ahoraMs = useAhoraMs();

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras, plazaFija, gamificacion, minimoRacha] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getPlazaFija(estudio.slug), getGamificacion(estudio.slug), getMinimoRacha(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras, plazaFija, gamificacion, minimoRacha };
  }, [estudio.slug]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false);
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);
  const plazaFija = data?.plazaFija ?? null;
  const gamificacion = data?.gamificacion ?? null;

  // ⚠️ El que el servidor gastaría primero, no «el primero del array».
  // `.find()` devolvía el que viniera antes en la respuesta, así que la tarjeta
  // de inicio podía anunciar un bono y el servidor descontar otro.
  const bonoActivo = [...(data?.bonos ?? [])]
    .filter((b) => b.estado === 'activo')
    .sort(compararPorCaducidad)[0] ?? null;

  // La próxima: de sus reservas confirmadas, la primera que aún no ha pasado.
  // El paquete no filtra por fecha porque sus datos de ejemplo son siempre
  // futuros; con datos reales, sin ese filtro «tu próxima clase» sería la
  // primera de su historial.
  //
  // ⚠️ El filtro por DÍA (`fecha >= hoy`) no bastaba, y era un bug visible: a las
  // 16:30 seguía anunciando como «tu próxima clase» la de las 09:00 que ya había
  // terminado, porque las dos son de hoy. Con el instante de fin a mano
  // (`Clase.fin`) se descarta la terminada — y la que se está DANDO se queda, que
  // es justo la que hay que enseñar, con su etiqueta de «en curso».
  //
  // El filtro por día se mantiene delante: es barato y descarta el historial sin
  // mirar el reloj, así que antes de hidratar (`ahoraMs === null`) la tarjeta
  // sigue saliendo igual que siempre en vez de desaparecer.
  const proxima = data?.reservas
    .filter((r) => r.estado === 'confirmada')
    .map((r) => ({ r, c: data.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c))
    .filter((x) => x.c.fecha >= hoy)
    .filter((x) => !yaTermino(x.c, ahoraMs))
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))[0];

  // ── Tu ritmo ──────────────────────────────────────────────────────────────
  // Sus clases con fecha, que es lo único que necesita `lib/student/ritmo.ts`.
  const clasesHechas = (data?.reservas ?? [])
    .map((r) => ({ r, c: data?.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c))
    .map((x) => ({ fecha: x.c.fecha, estado: x.r.estado }));

  const semana = semanaDe(clasesHechas, hoy);
  const estaSemana = hechasEstaSemana(clasesHechas, hoy);
  // El mínimo lo decide el estudio: «al menos una» no mide lo mismo donde se da
  // clase una vez por semana que donde se da tres.
  const racha = rachaSemanas(clasesHechas, hoy, data?.minimoRacha ?? 1);
  // Aquí se calculaba la MEJOR semana conocida, que era el eje de la barra de
  // «Mi progreso». Esa barra se ha ido: medía exactamente lo mismo que los
  // siete puntos de la semana justo encima, y contra una referencia que la
  // propia app se inventaba. Con la barra fuera, el cálculo sobra.

  // «Huecos de hoy» es un atajo para RESERVAR, así que una clase ya empezada no
  // es un hueco: el servidor la rechaza (`sesionYaEmpezada`). Antes salía toda la
  // mañana ofreciendo plazas de clases que ya se estaban dando o que habían
  // acabado, porque el filtro era del día entero.
  const huecos = (data?.clases ?? [])
    .filter((c) => c.fecha === hoy)
    .filter((c) => !estaEnCurso(c, ahoraMs) && !yaTermino(c, ahoraMs))
    .filter((c) => disponibilidad(c, data?.reservas ?? [], estudio.soportaListaEspera) !== 'reservada')
    .filter((c) => c.plazasLibres > 0)
    .slice(0, 3);

  return (
    <StudentShell>
      {/* Héroe fotográfico. `marginTop: -56` mete la foto DEBAJO de la cabecera
          transparente: es lo que hace que no parezca una web con barra encima. */}
      {/* `background`: mismo motivo que en la ficha de clase — un estudio puede
          no haber subido portada, y sin tinta detrás el héroe degrada a crema y
          se lleva por delante saludo, titular y cabecera transparente. */}
      <section style={{ position: 'relative', height: 250, marginTop: -56, overflow: 'hidden', background: '#0F0F0C' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={estudio.fotoPortada}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            objectPosition: 'center 32%', animation: 'apKen 22s ease-in-out infinite',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0,
            // ⚠️ DESIGN CONFLICT · la rampa INTERMEDIA no es la del paquete.
            //
            // El paquete aclara a `rgba(8,8,8,.06)` en el 58% y empieza a virar
            // a crema en el 86%. Medido en el navegador con datos reales: el
            // ojal cae en el 64% y el titular ocupa del 82% al 94% — es decir,
            // TODO el bloque de texto vive en la zona donde ya casi no hay
            // velo, y el titular termina sobre crema al 72%. Con la foto que
            // sube un estudio real —una sala luminosa, no la foto oscura del
            // mock— el texto blanco desaparece.
            //
            // Se conservan los dos extremos del paquete (arranque .58 y la
            // disolución final a `--background`, que es lo que cose el héroe
            // con la página) y solo se sostiene el velo entre el 62% y el 88%,
            // donde está el texto. La composición no se toca: mismo alto, misma
            // posición, mismos tamaños.
            background: 'linear-gradient(185deg, rgba(8,8,8,.58), rgba(8,8,8,.18) 42%, rgba(8,8,8,.06) 58%, rgba(250,249,245,.35) 86%, var(--background))',
          }}
        />
        {/* ⚠️ VELO PROPIO DEL TEXTO, medido en el render y no deducido.
            El degradado de arriba termina virando a CREMA (`rgba(250,249,245,.35)`
            al 86% y `--background` al 100%) para coser el héroe con la página —
            y este bloque de texto, anclado a `bottom: 14`, vive ENTERO dentro de
            ese tramo. O sea: texto crema sobre velo crema. Medido sobre la
            captura con una foto de sala luminosa (la que sube un estudio real,
            no la del mock): kicker **1,77:1**, saludo **2,66:1** y el titular
            **1,00:1** — literalmente invisible donde la foto es clara.
            El comentario de arriba ya arregló el tramo MEDIO por este mismo
            motivo; lo que quedaba sin cubrir era el tramo final, que es donde
            de verdad está el texto.
            Se resuelve con un velo local en el propio contenedor en vez de
            oscurecer el degradado del héroe: así la disolución a crema sigue
            existiendo en los últimos 14 px y la composición no se mueve ni un
            píxel — mismo alto, misma posición, mismos tamaños. */}
        <div
          className="px"
          style={{
            position: 'absolute', left: 0, right: 0, bottom: 14, color: '#FAF9F5',
            paddingTop: 34, paddingBottom: 4,
            background: 'linear-gradient(to top, rgba(8,8,8,.70), rgba(8,8,8,.62) 42%, rgba(8,8,8,.50) 70%, rgba(8,8,8,.28) 88%, transparent)',
          }}
        >
          {/* ⚠️ DESIGN CONFLICT · el paquete pinta esta línea con
              `--accent-deep-muted`, que es el token de las etiquetas sobre la
              superficie OSCURA (`--accent-deep`, la tarjeta «Tu próxima
              clase»). Sobre una FOTO no funciona, y bajo white-label menos: el
              token se deriva de la marca del estudio, así que con una marca
              azul sale un lila pálido. Medido aquí: el fondo bajo esta línea
              tiene luminancia 90/255 y el contraste queda en ~2,4:1, por
              debajo del 4,5:1 exigido — en la captura, la línea no se lee.
              Se pasa a la MISMA familia crema que el saludo y el titular, un
              punto por debajo en opacidad para conservar la jerarquía. Así la
              legibilidad no depende ni de la foto que suba el estudio ni de su
              color de marca. */}
          {/* ⚠️ El .72 de opacidad era lo último que quedaba por debajo de AA
              en el héroe: sobre el punto más claro de una foto de sala luminosa
              da 3,63:1 con el velo puesto, y hacen falta 4,5:1 a 11 px. Sube a
              .9 (4,65:1 medido). No pierde jerarquía porque aquí la marcan el
              TAMAÑO y las VERSALES —11 px en mayúsculas frente a 13 px—, no la
              opacidad; y la opacidad, sobre una foto que sube cada estudio, es
              justo la herramienta que no controlamos. */}
          <p className="t-label a-up" style={{ color: 'rgba(250,249,245,.9)' }}>
            {estudio.nombre} · {fechaLarga(hoy)}
          </p>
          <p className="a-up" style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'rgba(250,249,245,.9)', animationDelay: '60ms' }}>
            {saludo(socia?.nombre ?? '')} 👋
          </p>
          <h1 className="a-up" style={{ margin: '2px 0 0', fontSize: 32, fontWeight: 800, letterSpacing: '-.035em', lineHeight: 1, animationDelay: '120ms' }}>
            ¿Qué te apetece hoy?
          </h1>
        </div>
      </section>

      {/* Buscador. No decora: lleva a `/reservar?q=`, que busca en TODO el
          horario por nombre de clase, tipo o instructora, ignorando acentos. */}
      <form
        className="px a-up"
        style={{ marginTop: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get('q');
          const texto = typeof q === 'string' ? q.trim() : '';
          router.push(texto ? `${href('/reservar')}?q=${encodeURIComponent(texto)}` : href('/reservar'));
        }}
      >
        <div style={{ position: 'relative' }}>
          <span aria-hidden style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-foreground)', display: 'flex' }}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21" /></svg>
          </span>
          <input
            name="q"
            type="search"
            placeholder="Buscar clases, instructoras…"
            aria-label="Buscar clases o instructoras"
            style={{ width: '100%', height: 48, paddingLeft: 43, paddingRight: 15, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', boxShadow: 'var(--shadow-card)', fontSize: 'var(--t-body)', fontFamily: 'inherit', color: 'var(--foreground)' }}
          />
        </div>
      </form>

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '13px', marginTop: 14 }}>
        {estado === 'loading' && (
          <>
            <Skeleton h={118} r={20} />
            <Skeleton h={62} r={16} />
            <Skeleton h={74} r={16} />
            <Skeleton h={74} r={16} />
          </>
        )}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          <>
            {proxima ? (
              <NextClassCard
                reserva={proxima.r}
                clase={proxima.c}
                instructora={data.instructoras.find((i) => i.id === proxima.c.instructoraId)}
                // ⚠️ Sin estos dos manejadores la tarjeta pintaba «+ Calendario»
                // y «Cómo llegar» MUERTOS: el paquete los resuelve con un toast
                // de maqueta y al copiarlo se quedaron sin nada detrás.
                onCalendario={() => añadirAlCalendario(proxima.c, estudio.nombre, estudio.direccion, data.instructoras.find((i) => i.id === proxima.c.instructoraId)?.nombre)}
                onComoLlegar={() => window.open(urlComoLlegar(estudio.direccion, estudio.nombre), '_blank', 'noopener')}
              />
            ) : (
              <EmptyState
                icono="🧘"
                titulo="No tienes clases próximas"
                cuerpo={huecos.length > 0
                  ? `Hay ${huecos.length} ${huecos.length === 1 ? 'clase' : 'clases'} hoy con plaza libre.`
                  : 'Mira el horario para encontrar tu próxima clase.'}
                accion="Ver el horario"
                href={href('/reservar')}
              />
            )}

            {/* ── TU RITMO ─────────────────────────────────────────────────
                Todo lo que enseña sale de sus reservas reales
                (`lib/student/ritmo.ts`, 16 tests): los días de la semana, la
                racha y lo que lleva hecho. Lo que el backend no tiene —una meta
                semanal configurable, retos— no se rellena con cifras a dedo.

                Era un rótulo suelto + tres tarjetas; ahora es UNA. El detalle
                de por qué, en el componente. */}
            <TuRitmo
              dias={semana}
              racha={racha}
              estaSemana={estaSemana}
              bono={bonoActivo ?? null}
              hrefBono={bonoActivo ? href(`/bonos/${bonoActivo.id}`) : href('/bonos')}
              hrefBonos={href('/bonos')}
            />


            {/* ── VALORACIÓN INICIAL ──────────────────────────────────────
                Va ARRIBA, justo debajo de la próxima clase, y solo mientras
                esté pendiente. Es lo único de esta pantalla que el estudio
                está esperando de ella; enterrarlo entre el bono y el muro
                sería ofrecerlo sin ofrecerlo. Desaparece al completarla. */}
            <ValoracionCard studioId={estudio.id} href={href('/valoracion')} />

            {/* ── PLAZA FIJA / RECUPERACIONES (F2) ────────────────────────
                Solo si tiene: sin plaza ni recuperaciones no se pinta nada. */}
            {plazaFija && <PlazaFijaCard compacta plaza={plazaFija.plaza} recuperaciones={plazaFija.recuperaciones} hrefHorario={href('/reservar')} />}

            {/* Nivel y créditos: solo si el estudio usa gamificación. */}
            {gamificacion && <NivelCard g={gamificacion} href={href('/logros')} creditosNombre={estudio.creditosNombre} />}
            {/* ── DEL ESTUDIO ──────────────────────────────────────────────
                Lo último que ha publicado el estudio en su tablón. Una sola
                petición (`limite=1`); si no hay nada o falla, no se pinta. */}
            <DelEstudio studioId={estudio.id} href={href('/comunidad')} />

            {/* ── MENSAJES ─────────────────────────────────────────────────
                Al contrario que "Del estudio", esta SIEMPRE se pinta si la
                petición fue bien (ver MensajesCard): es la única puerta de
                entrada al chat con el estudio para una socia nueva. */}
            <MensajesCard studioId={estudio.id} nombreEstudio={estudio.nombre} href={href('/mensajes')} />

            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                <h2 className="t-h2">Huecos de hoy</h2>
                <Link href={href('/reservar')} className="tap" style={{ fontSize: 'var(--t-small)', fontWeight: 800, color: 'var(--accent)' }}>
                  Ver horario →
                </Link>
              </div>
              {huecos.length === 0 ? (
                <EmptyState
                  icono="📅"
                  titulo="Hoy ya no quedan huecos"
                  cuerpo="Mira mañana — suele haber más plazas por la mañana."
                  accion="Ver el horario"
                  href={href('/reservar')}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {huecos.map((c, i) => (
                    <ClassCard
                      key={c.id}
                      clase={c}
                      instructora={data.instructoras.find((x) => x.id === c.instructoraId)}
                      estado={disponibilidad(c, data.reservas, estudio.soportaListaEspera)}
                      conBono={Boolean(bonoParaClase(data?.bonos ?? [], c.tipoClaseId))}
                      delay={i * 55}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </StudentShell>
  );
}
