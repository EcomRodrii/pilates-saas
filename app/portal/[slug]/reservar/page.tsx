'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useVolver } from '@/components/student/shell/volver';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { getBonos, getClasesFrescas, getInstructoras, getReservas } from '@/lib/student/datos';
import { getFavoritos } from '@/lib/student/favoritos';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { addDias, hoyISO } from '@/lib/student/formato';
import { estadoTemporalDeFila } from '@/lib/student/fila-horario';
import {
  avisoDeSalto, diasConClases, diasConReserva, filtrarHorario, leerFiltrosGuardados, primerDiaConClases, salasDelHorario, type Franja,
} from '@/lib/student/horario-dias';
import { DateSelector } from '@/components/student/domain/DateSelector';
import { FilaHorario } from '@/components/student/domain/FilaHorario';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { Sheet } from '@/components/student/ui/Sheet';
import { Icono } from '@/components/student/ui/Icono';
import { tiposDeLasClases } from '@/lib/student/mapeo';
import { invalidarCatalogo } from '@/lib/student/catalogo';
import { TirarParaActualizar } from '@/components/student/ui/TirarParaActualizar';

// El día que estaba mirando, por estudio, para volver a él al cambiar de
// pestaña (con su scroll, que pone el marco). En memoria: se va al recargar. Un
// día que ya pasó no se recupera: se vuelve a hoy.
const ultimoDia = new Map<string, string>();

/** Días de la tira: dos semanas (P13). */
const DIAS_TIRA = 14;

// La franja y la sala que ella dejó puestas, en ESTE móvil: una comodidad suya, nunca algo que decida qué se puede
// reservar. Se leen con `useSyncExternalStore` (la CADENA guardada: una primitiva estable; un objeto nuevo en cada
// lectura entraría en bucle) y se parsean fuera. `localStorage` puede lanzar o venir vacío: todo con try/catch.
const claveFiltros = (slug: string) => `alumna:${slug}:horario-filtros`;
const EVENTO_FILTROS = 'alumna:horario-filtros';
function suscribirFiltros(aviso: () => void) {
  window.addEventListener('storage', aviso);
  window.addEventListener(EVENTO_FILTROS, aviso);
  return () => { window.removeEventListener('storage', aviso); window.removeEventListener(EVENTO_FILTROS, aviso); };
}
function guardarFiltros(slug: string, f: { franja: Franja; sala: string | null }) {
  try { localStorage.setItem(claveFiltros(slug), JSON.stringify(f)); } catch { /* sin almacenamiento: no se recuerda */ }
  window.dispatchEvent(new Event(EVENTO_FILTROS));
}

const FRANJAS: Array<[Franja, string]> = [['todo', 'Todo el día'], ['manana', 'Mañanas'], ['tarde', 'Tardes']];

// Horario (§A.6): días + filtros + lista de clases.
//
// ⚠️ El filtrado por día se hace en CLIENTE, igual que en el paquete, y aquí eso
// es una decisión con coste conocido: `getClases` sirve del catálogo que ya está
// en memoria, así que cambiar de día no dispara una petición — la pantalla
// responde al instante y sin red. Lo que NO se hace es pedir el catálogo entero
// por cada día.
//
// El catálogo trae las sesiones del estudio con cota por ABAJO (`fin >= ahora`,
// I-11) y sin cota por arriba: las ya terminadas no llegan (por eso no hay un pliegue
// de «ya terminadas»: saldría casi siempre vacío). Este comentario decía «sin cota
// de fecha»; no era así.
//
// P11–P13 (5-oct-2026): la fila lleva la foto propia de la clase y «Reservar» cuando la hoja diría «No pagas nada hoy»
// (abre LA MISMA hoja que la ficha y va por el mismo POST); la tira es de dos semanas, con un punto en sus días; si hoy
// ya no queda nada por empezar, abre el siguiente día con clases y lo dice; y se puede filtrar por franja y por sala.
export default function HorarioPage() {
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const sp = useSearchParams();
  const ahoraMs = useAhoraMs();
  // El instante en que se abrió la pantalla, para el día automático (el patrón de `useAsync`): nada de `setState` en
  // render ni en un efecto.
  const [abiertoEn] = useState<number | null>(() => (typeof window === 'undefined' ? null : Date.now()));
  // El día que ELIGIÓ (o el que miraba al volver). `null` = el automático.
  const [elegido, setElegido] = useState<string | null>(() => {
    const hoy = hoyISO();
    const antes = typeof window !== 'undefined' ? ultimoDia.get(estudio.slug) : undefined;
    return antes && antes >= hoy ? antes : null;
  });
  const setDia = useCallback((d: string) => {
    ultimoDia.set(estudio.slug, d);
    setElegido(d);
  }, [estudio.slug]);
  // `?filtro=` — lo usan la baldosa «Mis favoritas» y la hoja de filtros de
  // Inicio, que si no llevarían a un horario sin filtrar y dejarían a la alumna
  // buscando ella misma la píldora.
  //
  // ⚠️ Aquí se acepta CUALQUIER valor a propósito, porque quien decide es
  // `filtroReal` (abajo): solo vale si está en las píldoras que esta alumna
  // tiene de verdad.
  const [filtro, setFiltro] = useState(sp.get('filtro') ?? 'Todo');
  // Búsqueda por texto, que el paquete no tenía. Llega desde el buscador de la
  // Home como `?q=`, y se puede editar aquí.
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [verFiltros, setVerFiltros] = useState(false);
  const volver = useVolver();

  const cargar = useCallback(async () => {
    const [clases, reservas, bonos, instructoras, favoritos] = await Promise.all([
      getClasesFrescas(estudio.slug), getReservas(estudio.slug), getBonos(estudio.slug), getInstructoras(estudio.slug), getFavoritos(estudio.slug),
    ]);
    return { clases, reservas, bonos, instructoras, favoritos };
  }, [estudio.slug]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false, `alumna:${estudio.slug}:horario`);
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);
  const actualizar = useCallback(async () => {
    invalidarCatalogo(estudio.slug, { conservarVistas: true });
    await refrescar();
  }, [estudio.slug, refrescar]);

  // Al volver a la app (otra pestaña, el móvil bloqueado) las plazas pueden
  // haber cambiado: se relee el aforo ligero, no el payload entero, y en
  // silencio — sin esqueleto sobre una lista que ya se ve.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') void refrescar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [refrescar]);

  // ── La hoja de reserva de la fila (P12): la MISMA que la ficha ──
  // La clase elegida se busca en los datos VIVOS (aforo en vivo incluido); si desaparece, la hoja pinta la última
  // conocida con «ya no está en el horario» y no deja confirmar.
  const hoy = hoyISO();
  const hasta = addDias(hoy, DIAS_TIRA - 1);
  const salas = useMemo(() => (data ? salasDelHorario(data.clases, hoy, hasta) : []), [data, hoy, hasta]);
  const leerGuardado = useCallback(() => {
    try { return localStorage.getItem(claveFiltros(estudio.slug)); } catch { return null; }
  }, [estudio.slug]);
  const guardado = useSyncExternalStore(suscribirFiltros, leerGuardado, () => null);
  // Un filtro recordado que ya no vale (una sala que no está, algo roto) no filtra.
  const { franja, sala } = leerFiltrosGuardados(guardado, salas);
  const salaVisible = salas.length >= 2 ? sala : null;
  const nombreSala = salas.find((s) => s.id === salaVisible)?.nombre ?? null;

  const tipos = useMemo(
    // «Favoritas» solo aparece cuando hay alguna: una píldora que filtra a
    // vacío para todo el mundo es ruido.
    // Los tipos, en el orden que decidió el estudio (no en el de su primera clase).
    () => ['Todo', ...(data?.favoritos.size ? ['Favoritas'] : []), ...tiposDeLasClases(data?.clases ?? []), 'Con hueco'],
    [data],
  );
  // Las píldoras de la maqueta: «Todos» y los tipos de clase. «Favoritas» y «Con hueco» siguen valiendo (la baldosa de
  // Inicio abre `?filtro=Favoritas`), pero se eligen en la hoja de filtros.
  const pildoras = useMemo(() => ['Todo', ...tiposDeLasClases(data?.clases ?? [])], [data]);

  // ⚠️ Si el filtro que pide la URL no existe para ESTA alumna, vale «Todo».
  const filtroReal = tipos.includes(filtro) ? filtro : 'Todo';
  const consulta = q.trim();

  // El día con el que abre (P13): hoy, o el siguiente con clases si hoy ya no queda ninguna por empezar. Con búsqueda,
  // ni salto ni aviso (busca en todo el horario). Lo que ella eligió manda.
  const automatico = data && !consulta
    ? primerDiaConClases(data.clases, { hoy, ahoraMs: abiertoEn, dias: DIAS_TIRA, reservas: data.reservas })
    : { dia: hoy, saltado: false };
  const dia = elegido ?? automatico.dia;
  const aviso = !elegido && !consulta && automatico.saltado ? avisoDeSalto(hoy, automatico.dia) : null;

  const nombreInstructora = (id: string) => data?.instructoras.find((i) => i.id === id)?.nombre ?? '';
  const lista = filtrarHorario(data?.clases ?? [], {
    dia, consulta, tipo: filtroReal, favoritos: data?.favoritos ?? new Set<string>(), franja, sala: salaVisible,
    salasVisibles: salas.length, nombreInstructora,
  });
  const hayFiltro = filtroReal !== 'Todo' || franja !== 'todo' || salaVisible !== null;
  const quitarFiltros = () => { setFiltro('Todo'); guardarFiltros(estudio.slug, { franja: 'todo', sala: null }); };
  const vacioDelDia = (() => {
    const que = filtroReal === 'Todo' ? 'clases' : filtroReal === 'Con hueco' ? 'clases con hueco' : filtroReal === 'Favoritas' ? 'favoritas' : filtroReal.toLowerCase();
    const donde = nombreSala ? ` en ${nombreSala}` : '';
    const cuando = franja === 'manana' ? ' por la mañana' : franja === 'tarde' ? ' por la tarde' : '';
    return `No hay ${que}${donde}${cuando} este día`;
  })();

  const filtrosActivos = (filtroReal === 'Favoritas' || filtroReal === 'Con hueco' ? 1 : 0) + (franja !== 'todo' ? 1 : 0) + (salaVisible ? 1 : 0) + (consulta ? 1 : 0);

  return (
    // Copia de la maqueta de los cuatro iPhones (fundador, 19-oct-2026): sin la barra del estudio; volver, «Reservar»
    // centrado y el botón de filtros; las píldoras de tipos; la tira de días; las filas con foto. El buscador, la franja,
    // la sala, «Con hueco», «Favoritas» y el calendario no se pierden: viven en la hoja del botón de filtros.
    <StudentShell sinCabecera>
      <TirarParaActualizar onRefrescar={actualizar} />
      <header className="px cabecera-pantalla">
        <button type="button" onClick={volver} aria-label="Volver" className="tap tap--icono cabecera-pantalla__boton">
          <Icono nombre="chevron-izquierda" tamano={22} />
        </button>
        <h1 className="cabecera-pantalla__titulo">Reservar</h1>
        <button type="button" onClick={() => setVerFiltros(true)} aria-label={filtrosActivos ? `Filtros, ${filtrosActivos} activos` : 'Filtros'} data-testid="abrir-filtros" className="tap tap--icono cabecera-pantalla__boton cabecera-pantalla__boton--caja">
          <Icono nombre="filtros" tamano={20} />
          {filtrosActivos > 0 && <span aria-hidden className="cabecera-pantalla__punto" />}
        </button>
      </header>

      <div className="px no-scrollbar" style={{ display: 'flex', gap: 7, overflowX: 'auto', marginTop: 8 }}>
        {pildoras.map((t) => (
          <button key={t} type="button" className="pill pill--maqueta" aria-pressed={filtroReal === t} onClick={() => setFiltro(t)} style={{ flexShrink: 0 }}>
            {t === 'Todo' ? 'Todos' : t}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14 }}>
        <DateSelector
          value={dia}
          onChange={setDia}
          dias={DIAS_TIRA}
          formato="semana"
          marcados={data ? diasConReserva(data.reservas, data.clases) : undefined}
          habilitados={data ? diasConClases(data.clases) : undefined}
        />
      </div>

      {consulta && <p className="t-meta px" style={{ margin: '10px 0 0' }}>Buscando «{consulta}» en todo el horario</p>}
      {aviso && <p className="t-meta px" role="status" data-testid="aviso-salto" style={{ margin: '8px 0 0' }}>{aviso}</p>}
      <div style={{ height: 12 }} />

      <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={96} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && !data && <OfflineState />}

        {data && estado !== 'loading' && estado !== 'error' && (
          lista.length === 0 ? (
            consulta ? (
              <EmptyState
                ilustracion="busqueda"
                titulo={`Nada para «${consulta}»`}
                cuerpo="Hemos buscado en todo el horario, no solo en este día."
                accion="Borrar la búsqueda"
                onAccion={() => setQ('')}
              />
            ) : (
              <EmptyState
                ilustracion="calendario"
                titulo={vacioDelDia}
                cuerpo={hayFiltro ? 'Prueba otro día o quita el filtro.' : 'Prueba otro día.'}
                accion={hayFiltro ? 'Quitar filtro' : undefined}
                onAccion={quitarFiltros}
              />
            )
          ) : (
            lista.map((c, i) => {
              const disp = disponibilidad(c, data.reservas, estudio.soportaListaEspera);
              return (
                <FilaHorario
                  key={c.id}
                  clase={c}
                  instructora={data.instructoras.find((x) => x.id === c.instructoraId)}
                  estado={disp}
                  temporal={estadoTemporalDeFila(c, disp, ahoraMs)}
                  delay={i * 55}
                />
              );
            })
          )
        )}
      </div>

      {/* La hoja de filtros: lo que la maqueta no enseña en la pantalla, a un toque. */}
      <Sheet open={verFiltros} onClose={() => setVerFiltros(false)} label="Filtros">
        <h3 className="t-h2">Filtros</h3>
        <div style={{ position: 'relative', marginTop: 12 }}>
          <span aria-hidden style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--subtle-foreground)', display: 'flex' }}>
            <Icono nombre="buscar" tamano={18} />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clases, instructoras…"
            aria-label="Buscar clases o instructoras"
            style={{ width: '100%', height: 44, paddingLeft: 40, paddingRight: q ? 40 : 14, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', fontSize: 'max(16px, var(--t-body))', fontFamily: 'inherit', color: 'var(--foreground)' }}
          />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label="Borrar búsqueda"
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, borderRadius: 999, border: 'none', background: 'var(--muted)', color: 'var(--muted-foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icono nombre="cerrar" tamano={16} /></button>
          )}
        </div>
        <p className="t-label" style={{ margin: '16px 0 8px' }}>Mostrar</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['Todo', ...(data?.favoritos.size ? ['Favoritas'] : []), 'Con hueco'] as const).map((t) => (
            <button key={t} type="button" className="pill" aria-pressed={t === 'Todo' ? filtroReal !== 'Favoritas' && filtroReal !== 'Con hueco' : filtroReal === t} onClick={() => setFiltro(t)}>
              {t === 'Todo' ? 'Todas las clases' : t}
            </button>
          ))}
        </div>
        <p className="t-label" style={{ margin: '16px 0 8px' }}>Hora</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="filtros-franja">
          {FRANJAS.map(([f, rotulo]) => (
            <button key={f} type="button" className="pill" aria-pressed={franja === f} onClick={() => guardarFiltros(estudio.slug, { franja: f, sala: salaVisible })}>
              {rotulo}
            </button>
          ))}
        </div>
        {salas.length >= 2 && (
          <>
            <p className="t-label" style={{ margin: '16px 0 8px' }}>Sala</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} data-testid="filtro-sala">
              <button type="button" className="pill" aria-pressed={salaVisible === null} onClick={() => guardarFiltros(estudio.slug, { franja, sala: null })}>Todas</button>
              {salas.map((s) => (
                <button key={s.id} type="button" className="pill" aria-pressed={salaVisible === s.id} onClick={() => guardarFiltros(estudio.slug, { franja, sala: s.id })}>
                  {s.nombre}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Link href={href('/calendario')} className="btn btn--secondary" style={{ flex: 1 }}>Ver calendario</Link>
          <button type="button" className="btn btn--primary" style={{ flex: 1 }} onClick={() => setVerFiltros(false)}>
            {lista.length === 1 ? 'Ver 1 clase' : `Ver ${lista.length} clases`}
          </button>
        </div>
      </Sheet>
    </StudentShell>
  );
}
