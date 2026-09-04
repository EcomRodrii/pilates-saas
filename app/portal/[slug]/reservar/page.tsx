'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getBonos, getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { getFavoritos } from '@/lib/student/favoritos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { DateSelector } from '@/components/student/domain/DateSelector';
import { ClassCard } from '@/components/student/domain/ClassCard';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Horario (§A.6): días + filtros + lista de clases.
//
// ⚠️ El filtrado por día se hace en CLIENTE, igual que en el paquete, y aquí eso
// es una decisión con coste conocido: `getClases` sirve del catálogo que ya está
// en memoria, así que cambiar de día no dispara una petición — la pantalla
// responde al instante y sin red. Lo que NO se hace es pedir el catálogo entero
// por cada día.
//
// La deuda real está un nivel más abajo y queda anotada: el endpoint público
// devuelve las sesiones del estudio SIN cota de fecha (`fetchPublicStudioData`
// pagina la tabla entera). Acotarlo en servidor es trabajo de backend y no de
// esta pantalla; mientras tanto, el catálogo se comparte entre todas las vistas
// y se pide una sola vez.
export default function HorarioPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const sp = useSearchParams();
  const [dia, setDia] = useState(hoyISO());
  const [filtro, setFiltro] = useState('Todo');
  // Búsqueda por texto, que el paquete no tenía. Llega desde el buscador de la
  // Home como `?q=`, y se puede editar aquí.
  const [q, setQ] = useState(sp.get('q') ?? '');

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras, favoritos] = await Promise.all([
      getClases(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getFavoritos(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras, favoritos };
  }, [estudio.slug]);

  const { data, estado, reintentar } = useAsync(cargar, () => false);

  const tipos = useMemo(
    // «Favoritas» solo aparece cuando hay alguna: una píldora que filtra a
    // vacío para todo el mundo es ruido.
    () => ['Todo', ...(data?.favoritos.size ? ['Favoritas'] : []), ...Array.from(new Set(data?.clases.map((c) => c.tipo) ?? [])), 'Con hueco'],
    [data],
  );

  // Buscar ignora acentos y mayúsculas: quien teclea «yoga» espera encontrar
  // «Yoga Flow», y quien teclea «maria» espera a «María».
  const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const consulta = normalizar(q.trim());
  const nombreInstructora = (id: string) => data?.instructoras.find((i) => i.id === id)?.nombre ?? '';

  const lista = (data?.clases ?? [])
    // Con búsqueda activa se busca en TODO el horario, no solo en el día
    // elegido: buscar «yoga» y que no salga nada porque hoy no hay es la peor
    // respuesta posible a una búsqueda.
    .filter((c) => (consulta ? true : c.fecha === dia))
    .filter((c) => filtro === 'Todo'
      || (filtro === 'Con hueco' ? c.plazasLibres > 0
        : filtro === 'Favoritas' ? (data?.favoritos.has(c.tipoClaseId) ?? false)
          : c.tipo === filtro))
    .filter((c) => !consulta
      || normalizar(c.nombre).includes(consulta)
      || normalizar(c.tipo).includes(consulta)
      || normalizar(nombreInstructora(c.instructoraId)).includes(consulta))
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const bono = data?.bonos.find((b) => b.estado === 'activo');

  return (
    <StudentShell>
      <PageHeader
        titulo="Horario"
        sub={estudio.nombre}
        accion={<Link href={href('/calendario')} className="btn btn--secondary btn--sm">Calendario</Link>}
      />

      <div style={{ marginTop: 14 }}>
        <DateSelector value={dia} onChange={setDia} />
      </div>

      <div className="px" style={{ marginTop: 12 }}>
        <div style={{ position: 'relative' }}>
          <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-foreground)', display: 'flex' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16.5 16.5 21 21" /></svg>
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clases, instructoras…"
            aria-label="Buscar clases o instructoras"
            style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: q ? 40 : 14, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', fontSize: 13.5, fontFamily: 'inherit', color: 'var(--foreground)' }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda"
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 999, border: 'none', background: 'var(--muted)', color: 'var(--muted-foreground)', fontSize: 13 }}>×</button>
          )}
        </div>
      </div>

      <div className="px no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 10 }}>
        {tipos.map((t) => (
          <button key={t} type="button" className="pill" aria-pressed={filtro === t} onClick={() => setFiltro(t)} style={{ flexShrink: 0 }}>
            {t}
          </button>
        ))}
      </div>

      <p className="t-label px" style={{ margin: '12px 0 9px' }}>
        {estado === 'loading'
          ? 'Cargando…'
          // Con búsqueda activa la lista abarca TODO el horario, así que
          // rotularla «· HOY» sería mentir sobre lo que se está viendo.
          : consulta
            ? `${lista.length} ${lista.length === 1 ? 'clase' : 'clases'} · todo el horario`
            : `${lista.length} ${lista.length === 1 ? 'clase' : 'clases'} · ${etiquetaDia(dia)}`}
      </p>

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {estado === 'loading' && <ListSkeleton n={4} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          lista.length === 0 ? (
            <EmptyState
              icono="🔍"
              titulo={filtro === 'Todo' ? 'No hay clases este día' : `No hay ${filtro.toLowerCase()} este día`}
              cuerpo="Prueba otro día o quita el filtro."
              accion={filtro !== 'Todo' ? 'Quitar filtro' : undefined}
              onAccion={() => setFiltro('Todo')}
            />
          ) : (
            lista.map((c, i) => (
              <ClassCard
                key={c.id}
                clase={c}
                instructora={data.instructoras.find((x) => x.id === c.instructoraId)}
                estado={disponibilidad(c, data.reservas, estudio.soportaListaEspera)}
                conBono={Boolean(bono)}
                delay={i * 55}
              />
            ))
          )
        )}
      </div>
    </StudentShell>
  );
}
