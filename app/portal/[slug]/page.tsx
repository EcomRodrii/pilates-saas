'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getInstructoras, getPlazaFija, getReservas } from '@/lib/student/datos';
import { getGamificacion } from '@/lib/student/gamificacion-datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { NextClassCard } from '@/components/student/domain/NextClassCard';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { EmptyState, ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { urlCalendario, urlComoLlegar } from '@/lib/student/enlaces-clase';
import { BonoRitmo, TuSemana, MiProgreso } from '@/components/student/domain/TuRitmo';
import { PlazaFijaCard } from '@/components/student/domain/PlazaFijaCard';
import { NivelCard } from '@/components/student/domain/NivelCard';
import { DelEstudio } from '@/components/student/domain/DelEstudio';
import { semanaDe, hechasEstaSemana, rachaSemanas, lunesDe, cuentaComoHecha } from '@/lib/student/ritmo';
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

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras, plazaFija, gamificacion] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getPlazaFija(estudio.slug), getGamificacion(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras, plazaFija, gamificacion };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);
  const plazaFija = data?.plazaFija ?? null;
  const gamificacion = data?.gamificacion ?? null;

  const bonoActivo = data?.bonos.find((b) => b.estado === 'activo') ?? null;

  // La próxima: de sus reservas confirmadas, la primera que aún no ha pasado.
  // El paquete no filtra por fecha porque sus datos de ejemplo son siempre
  // futuros; con datos reales, sin ese filtro «tu próxima clase» sería la
  // primera de su historial.
  const proxima = data?.reservas
    .filter((r) => r.estado === 'confirmada')
    .map((r) => ({ r, c: data.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c))
    .filter((x) => x.c.fecha >= hoy)
    .sort((a, b) => (a.c.fecha + a.c.hora).localeCompare(b.c.fecha + b.c.hora))[0];

  // ── Tu ritmo ──────────────────────────────────────────────────────────────
  // Sus clases con fecha, que es lo único que necesita `lib/student/ritmo.ts`.
  const clasesHechas = (data?.reservas ?? [])
    .map((r) => ({ r, c: data?.clases.find((c) => c.id === r.claseId) }))
    .filter((x): x is { r: (typeof x)['r']; c: NonNullable<(typeof x)['c']> } => Boolean(x.c))
    .map((x) => ({ fecha: x.c.fecha, estado: x.r.estado }));

  const semana = semanaDe(clasesHechas, hoy);
  const estaSemana = hechasEstaSemana(clasesHechas, hoy);
  const racha = rachaSemanas(clasesHechas, hoy);
  // Referencia de la barra: su MEJOR semana, no una meta inventada. Se agrupa
  // por el lunes de cada clase — agrupar por mes+día, como hacía la primera
  // versión de esto, no agrupa por semana en absoluto.
  const porSemana = clasesHechas
    .filter((c) => cuentaComoHecha(c, hoy))
    .reduce<Record<string, number>>((acc, c) => {
      const k = lunesDe(c.fecha);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
  const mejorSemana = Math.max(1, ...Object.values(porSemana), estaSemana);

  const huecos = (data?.clases ?? [])
    .filter((c) => c.fecha === hoy)
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
        <div className="px" style={{ position: 'absolute', left: 0, right: 0, bottom: 14, color: '#FAF9F5' }}>
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
          <p className="t-label a-up" style={{ color: 'rgba(250,249,245,.72)' }}>
            {estudio.nombre} · {fechaLarga(hoy)}
          </p>
          <p className="a-up" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 700, color: 'rgba(250,249,245,.9)', animationDelay: '60ms' }}>
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
            style={{ width: '100%', height: 48, paddingLeft: 43, paddingRight: 15, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', boxShadow: 'var(--shadow-card)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--foreground)' }}
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
                onCalendario={() => window.open(urlCalendario(proxima.c, estudio.nombre, estudio.direccion), '_blank', 'noopener')}
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
                Bloque nuevo. Todo lo que enseña sale de sus reservas reales
                (`lib/student/ritmo.ts`, 16 tests): los días de la semana, la
                racha y lo que lleva hecho. Lo que el backend no tiene —una meta
                semanal configurable, retos— no se rellena con cifras a dedo. */}
            <p className="t-label" style={{ marginTop: 4 }}>Tu ritmo</p>

            <TuSemana dias={semana} racha={racha} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <MiProgreso estaSemana={estaSemana} referencia={mejorSemana} />
              {bonoActivo
                ? <BonoRitmo bono={bonoActivo} href={href(`/bonos/${bonoActivo.id}`)} />
                : (
                  <Link href={href('/bonos')} className="card card--tap" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '13px 15px' }}>
                    <p className="t-label">Bonos</p>
                    <p style={{ margin: '7px 0 0', fontSize: 13.5, fontWeight: 800 }}>Sin bono activo</p>
                    <p className="t-meta" style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--accent)' }}>Ver bonos →</p>
                  </Link>
                )}
            </div>


            {/* ── PLAZA FIJA / RECUPERACIONES (F2) ────────────────────────
                Solo si tiene: sin plaza ni recuperaciones no se pinta nada. */}
            {plazaFija && <PlazaFijaCard compacta plaza={plazaFija.plaza} recuperaciones={plazaFija.recuperaciones} hrefHorario={href('/reservar')} />}

            {/* Nivel y créditos: solo si el estudio usa gamificación. */}
            {gamificacion && <NivelCard g={gamificacion} href={href('/logros')} />}
            {/* ── DEL ESTUDIO ──────────────────────────────────────────────
                Lo último que ha publicado el estudio en su tablón. Una sola
                petición (`limite=1`); si no hay nada o falla, no se pinta. */}
            <DelEstudio studioId={estudio.id} href={href('/comunidad')} />

            <section>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                <h2 className="t-h2">Huecos de hoy</h2>
                <Link href={href('/reservar')} style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>
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
                      conBono={Boolean(bonoActivo)}
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
