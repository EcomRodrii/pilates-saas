'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { getAlumnasInstructora } from '@/lib/student/datos-instructora';
import type { AlumnaResumen } from '@/lib/student/alumnas-instructora';
import { ALUMNAS_PARA_BUSCADOR, agruparAlumnas } from '@/lib/student/alumnas-vista';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Badge } from '@/components/student/ui/Badge';
import { Icono } from '@/components/student/ui/Icono';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Tus alumnas»: las de sus clases de los últimos 30 días y los próximos 30 (la
// misma regla que decide si puede ver su salud). Lo mínimo para dar clase:
// nombre, foto, su próxima clase con ella y si es su primera vez. Nada de
// contacto, pagos ni bonos (decisión del 14-sep-2026).
//
// Primero las que vienen pronto, por fecha, y después las demás: antes era una
// sola lista en el orden en que llegaban, y para preparar la semana había que
// leerla entera. Con muchas, un buscador.

export default function AlumnasInstructoraPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();
  const [busqueda, setBusqueda] = useState('');

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getAlumnasInstructora(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const total = data?.length ?? 0;
  const { conProxima, sinProxima } = agruparAlumnas(data ?? [], busqueda);
  const sinResultados = total > 0 && conProxima.length + sinProxima.length === 0;

  return (
    <StudentShell modo="instructora">
      {/* Sin «Volver»: es una pestaña de la barra, no una pantalla dentro de Perfil. */}
      <PageHeader
        titulo="Tus alumnas"
        sub={total > 0
          ? `${total} ${total === 1 ? 'alumna' : 'alumnas'} · de tus clases de los últimos 30 días y los próximos 30`
          : 'De tus clases de los últimos 30 días y los próximos 30'}
      />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, paddingBottom: 24 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={64} />}
        {estado === 'error' && <ErrorState cuerpo="No hemos podido cargar tus alumnas." onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Para ver a tus alumnas necesitas conexión." />}

        {data && data.length === 0 && (
          <EmptyState
            ilustracion="calendario"
            titulo="Todavía no tienes alumnas"
            cuerpo="Aparecerán cuando alguien reserve una de tus clases."
          />
        )}

        {total >= ALUMNAS_PARA_BUSCADOR && (
          <div style={{ position: 'relative' }}>
            <span aria-hidden style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-foreground)', display: 'flex' }}>
              <Icono nombre="buscar" tamano={18} />
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre"
              aria-label="Buscar alumna"
              // 16 px: por debajo, iOS amplía la página al enfocar y no vuelve.
              style={{ width: '100%', height: 48, paddingLeft: 43, paddingRight: 15, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', boxShadow: 'var(--shadow-card)', fontSize: 16, fontFamily: 'inherit', color: 'var(--foreground)' }}
            />
          </div>
        )}

        {sinResultados && <p className="t-small t-dim" style={{ margin: 0 }}>Ninguna de tus alumnas se llama así.</p>}

        {conProxima.length > 0 && (
          <Grupo titulo="Con clase próxima contigo" alumnas={conProxima} hoy={hoy} href={href} />
        )}
        {sinProxima.length > 0 && (
          <Grupo titulo="Sin clase próxima contigo" alumnas={sinProxima} hoy={hoy} href={href} />
        )}
      </div>
    </StudentShell>
  );
}

function Grupo({ titulo, alumnas, hoy, href }: {
  titulo: string; alumnas: AlumnaResumen[]; hoy: string; href: (ruta: string) => string;
}) {
  return (
    <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-label={titulo}>
      <h2 className="t-label" style={{ margin: 0 }}>{titulo} · {alumnas.length}</h2>
      {alumnas.map((a) => (
        <Link
          key={a.socioId}
          href={href(`/equipo/alumnas/${encodeURIComponent(a.socioId)}`)}
          className="card card--tap"
          data-testid="alumna"
          style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <AvatarSocia nombre={a.nombre} fotoUrl={a.fotoUrl} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <p className="t-card-title trunc">{a.nombre}</p>
              {a.primeraClase && a.proxima && <Badge tone="ok">Primera clase</Badge>}
            </div>
            <p className="t-meta trunc" style={{ marginTop: 2 }}>
              {a.proxima
                ? `${etiquetaDia(a.proxima.fecha, hoy)} · ${a.proxima.hora} · ${a.proxima.tipo}`
                : 'Sin clases próximas contigo'}
            </p>
          </div>
          <span aria-hidden className="t-faint" style={{ display: 'flex', flexShrink: 0 }}>
            <Icono nombre="chevron-derecha" tamano={18} />
          </span>
        </Link>
      ))}
    </section>
  );
}
