'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { fechaLarga, hoyISO, saludo } from '@/lib/student/formato';
import { NextClassCard } from '@/components/student/domain/NextClassCard';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { CreditCard } from '@/components/student/domain/CreditCard';
import { EmptyState, ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';

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
  const { socia } = useSesionStudent(estudio.slug);
  const hoy = hoyISO();

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

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

  const huecos = (data?.clases ?? [])
    .filter((c) => c.fecha === hoy)
    .filter((c) => disponibilidad(c, data?.reservas ?? [], estudio.soportaListaEspera) !== 'reservada')
    .filter((c) => c.plazasLibres > 0)
    .slice(0, 3);

  return (
    <StudentShell headerTransparente>
      {/* Héroe fotográfico. `marginTop: -56` mete la foto DEBAJO de la cabecera
          transparente: es lo que hace que no parezca una web con barra encima. */}
      <section style={{ position: 'relative', height: 250, marginTop: -56, overflow: 'hidden' }}>
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

      <div className="px grid-lg-2" style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 4 }}>
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

            {bonoActivo ? (
              <CreditCard bono={bonoActivo} compacta />
            ) : (
              <Link
                href={href('/bonos')}
                className="card card--tap"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 15px' }}
              >
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700 }}>Sin bono activo</p>
                <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--accent)' }}>Ver bonos →</span>
              </Link>
            )}

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
