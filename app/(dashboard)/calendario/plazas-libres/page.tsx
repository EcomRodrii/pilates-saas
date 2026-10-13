'use client';

// «Plazas libres» (P3.9, pieza F): qué clases tienen sitio, por semana o por mes,
// para que recepción conteste en el momento. Entra APAGADA (interruptor
// `CALENDARIO_PLAZAS_LIBRES`): si el servidor dice que no (o un 403), se vuelve
// al Calendario; un fallo de red o un 5xx es un error con «Reintentar», no un
// «apagado». Todo se cuenta en el servidor; aquí solo se navega y se pinta.
//
//  · Es una FOTO: se dice a qué hora se contó y se vuelve a contar al volver a
//    la pestaña. «Hoy» lo da el servidor (un iPad abierto toda la noche no se
//    queda en el día de ayer).
//  · El modo, el periodo y los filtros van en la URL: ir a una clase y volver
//    atrás deja la pantalla donde estaba.

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, DoorOpen, Layers } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { cn, horaEstudio, hoyEnEstudio, masDias } from '@/lib/utils';
import { esFecha, fechaEnFrase, MAX_DIAS_ADELANTE, mesDe, semanaDe } from '@/lib/calendario/plazas-libres';
import { pedirPlazasLibres, type DatosPlazasLibres } from '@/lib/calendario/plazas-libres-cliente';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { FiltroCabecera } from '@/components/calendario/cabecera-calendario';
import { MesPlazasLibres, SemanaPlazasLibres } from '@/components/calendario/vista-plazas-libres';

type Modo = 'semana' | 'mes';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (ymd: string) => MESES[Number(ymd.slice(5, 7)) - 1];

function textoRango(modo: Modo, r: { desde: string; hasta: string }): string {
  if (modo === 'mes') return `${nombreMes(r.desde).replace(/^./, c => c.toUpperCase())} de ${r.desde.slice(0, 4)}`;
  return r.desde.slice(5, 7) === r.hasta.slice(5, 7)
    ? `Del ${Number(r.desde.slice(8, 10))} al ${fechaEnFrase(r.hasta)}`
    : `Del ${fechaEnFrase(r.desde)} al ${fechaEnFrase(r.hasta)}`;
}

export default function PlazasLibresPage() {
  const router = useRouter();
  const { salas, tiposClase } = useStudio();
  const [hoy, setHoy] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>('semana');
  const [referencia, setReferencia] = useState<string | null>(null);
  const [filtroSala, setFiltroSala] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [estado, setEstado] = useState<'cargando' | 'error' | 'listo'>('cargando');
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [datos, setDatos] = useState<DatosPlazasLibres | null>(null);
  // De qué periodo PEDIDO son: el servidor recorta `desde` a hoy, y una semana y
  // un mes pueden acabar el mismo día.
  const [datosDe, setDatosDe] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const urlLeida = useRef(false);

  // Al montar: «hoy» del estudio y lo que traiga la URL (volver atrás desde una clase).
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Guarda de hidratación: la fecha del estudio y la URL, en el navegador.
    setHoy(hoyEnEstudio());
    if (p.get('modo') === 'mes') setModo('mes');
    const ref = p.get('ref');
    if (esFecha(ref)) setReferencia(ref);
    if (p.get('sala')) setFiltroSala(p.get('sala')!);
    if (p.get('tipo')) setFiltroTipo(p.get('tipo')!);
    urlLeida.current = true;
  }, []);
  useEffect(() => {
    if (!urlLeida.current) return;
    const p = new URLSearchParams();
    if (modo === 'mes') p.set('modo', 'mes');
    if (referencia) p.set('ref', referencia);
    if (filtroSala) p.set('sala', filtroSala);
    if (filtroTipo) p.set('tipo', filtroTipo);
    const url = `/calendario/plazas-libres${p.toString() ? `?${p}` : ''}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [modo, referencia, filtroSala, filtroTipo]);

  // Es una foto: al volver a la pestaña (o a la app en el iPad), se vuelve a contar.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') setIntento(i => i + 1); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, []);

  const ref = referencia ?? hoy;
  const rango = ref ? (modo === 'semana' ? semanaDe(ref) : mesDe(ref)) : null;

  useEffect(() => {
    if (!rango) return;
    const ctrl = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Se vuelve a pedir al cambiar de periodo, al reintentar o al volver a la pestaña.
    setEstado('cargando');
    void pedirPlazasLibres(rango.desde, rango.hasta, ctrl.signal).then(r => {
      if (ctrl.signal.aborted) return;
      if (r.ok) {
        setDatos(r.datos);
        setDatosDe(`${rango.desde}|${rango.hasta}`);
        setEstado('listo');
        // «Hoy» manda el del servidor: un iPad abierto toda la noche ya no está en ayer.
        setHoy(h => (h === r.datos.hoy ? h : r.datos.hoy));
        return;
      }
      if (r.apagado) { router.replace('/calendario'); return; }
      setMensajeError(r.mensaje ?? null);
      setEstado('error');
    });
    return () => ctrl.abort();
  }, [rango?.desde, rango?.hasta, intento, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Solo los datos de ESTE periodo: al cambiar, no se pintan un instante los del anterior.
  const datosAlDia = datos && rango && datosDe === `${rango.desde}|${rango.hasta}` ? datos : null;
  const filtrando = !!filtroSala || !!filtroTipo;
  const sesiones = useMemo(
    () => (datosAlDia?.sesiones ?? []).filter(s => (!filtroSala || s.salaId === filtroSala) && (!filtroTipo || s.tipoClaseId === filtroTipo)),
    [datosAlDia, filtroSala, filtroTipo],
  );
  const nombres = useMemo(() => {
    const sala = new Map(salas.map(s => [s.id, s.nombre]));
    const tipo = new Map(tiposClase.map(t => [t.id, t.nombre]));
    return { sala: (id: string) => sala.get(id), tipo: (id: string) => tipo.get(id) };
  }, [salas, tiposClase]);

  if (!hoy || !rango) {
    return <div className="animate-pulse space-y-4 p-1"><div className="h-8 w-56 rounded-lg bg-border" /><div className="h-64 rounded-2xl border border-border bg-card" /></div>;
  }

  const periodoDeHoy = modo === 'semana' ? semanaDe(hoy) : mesDe(hoy);
  const enHoy = rango.desde === periodoDeHoy.desde;
  // No se navega a lo que ya pasó ni más allá de lo que el servidor mira.
  const hayAnterior = rango.desde > hoy;
  const siguienteDesde = masDias(rango.hasta, 1);
  const haySiguiente = siguienteDesde <= masDias(hoy, MAX_DIAS_ADELANTE);
  function mover(paso: -1 | 1) {
    if (paso === 1) setReferencia(siguienteDesde);
    else setReferencia(modo === 'semana' ? masDias(rango!.desde, -7) : mesDe(masDias(rango!.desde, -1)).desde);
  }
  // Al cambiar de modo se queda en el mismo periodo: de noviembre a la semana del 1 de noviembre.
  function cambiarModo(m: Modo) {
    setModo(m);
    setReferencia(rango!.desde > hoy! ? rango!.desde : null);
  }

  const vacio = sesiones.length === 0;
  const futuro = rango.desde > hoy;
  const opcionesSala = [{ valor: '', texto: 'Todas las salas' }, ...salas.map(s => ({ valor: s.id, texto: s.nombre }))];
  const opcionesTipo = [{ valor: '', texto: 'Todos los tipos' }, ...tiposClase.map(t => ({ valor: t.id, texto: t.nombre }))];

  return (
    <div className="space-y-4 pb-24" data-testid="plazas-libres">
      <PageHeader
        title="Plazas libres"
        description="Cuántas plazas quedan en cada clase y dónde cabe otra alumna con clase fija."
        back={{ href: '/calendario', label: 'Volver al calendario' }}
      />

      <details className="max-w-[80ch] text-[12.5px] text-muted-foreground" data-testid="plazas-libres-leyenda">
        <summary className="cursor-pointer text-[13px] font-medium text-foreground underline-offset-2 hover:underline">¿Cómo se cuenta?</summary>
        <div className="mt-2 space-y-1 text-pretty">
          <p>
            <span className="font-semibold text-foreground">Libres: </span>lo que se puede reservar ahora en esa clase. Ya resta las reservas confirmadas y lo
            apartado para ClassPass; la lista de espera y las reservas por aprobar no ocupan plaza
            {datosAlDia?.ofertaOcupa ? ', salvo una plaza ya ofrecida a la lista de espera mientras corre su plazo, como tiene elegido tu estudio' : ''}.
            Si hay una máquina averiada, ya está descontada.
          </p>
          <p>
            <span className="font-semibold text-foreground">Para una clase fija: </span>lo que queda si además guardas el sitio de las alumnas con clase fija
            que aún no tienen esa clase reservada, como las que están en pausa. Solo se enseña cuando es distinto de «libres».
          </p>
          {modo === 'mes' && <p>Cada fila es una franja del horario (día, hora, sala y tipo de clase). Los números son sus clases: rellenos, con sitio para otra clase fija.</p>}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted p-1" role="group" aria-label="Periodo">
          {(['semana', 'mes'] as const).map(m => (
            <button
              key={m} type="button" aria-pressed={modo === m} onClick={() => cambiarModo(m)}
              className={cn(
                'min-h-11 rounded-lg px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-8',
                modo === m ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'semana' ? 'Semana' : 'Mes'}
            </button>
          ))}
        </div>
        {/* ‹ Hoy ›, como el Calendario. */}
        <span className="inline-flex items-center rounded-lg border border-border bg-card">
          <button type="button" onClick={() => mover(-1)} disabled={!hayAnterior} aria-label={modo === 'semana' ? 'Semana anterior' : 'Mes anterior'}
            className="flex size-11 items-center justify-center rounded-l-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:size-9">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => setReferencia(null)} disabled={enHoy}
            className="min-h-11 border-x border-border px-3 text-[13px] font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground disabled:hover:bg-transparent md:min-h-9">
            Hoy
          </button>
          <button type="button" onClick={() => mover(1)} disabled={!haySiguiente} aria-label={modo === 'semana' ? 'Semana siguiente' : 'Mes siguiente'}
            className="flex size-11 items-center justify-center rounded-r-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 md:size-9">
            <ChevronRight size={16} />
          </button>
        </span>
        <span className="text-[13px] font-semibold text-foreground" aria-live="polite" data-testid="plazas-libres-rango">{textoRango(modo, rango)}</span>
        {salas.length > 1 && <FiltroCabecera icono={DoorOpen} etiqueta="Filtrar por sala" valor={filtroSala} onCambio={setFiltroSala} opciones={opcionesSala} />}
        {tiposClase.length > 1 && <FiltroCabecera icono={Layers} etiqueta="Filtrar por tipo de clase" valor={filtroTipo} onCambio={setFiltroTipo} opciones={opcionesTipo} />}
      </div>

      {estado === 'error' ? (
        <div role="alert" className="max-w-3xl rounded-xl border border-border bg-card px-4 py-6 text-center" data-testid="plazas-libres-error">
          <p className="text-[13.5px] font-medium text-foreground">{mensajeError ?? 'No se han podido calcular las plazas libres'}</p>
          {!mensajeError && <p className="mt-1 text-[12.5px] text-muted-foreground">Sin todos los datos la cifra podría estar mal, así que no la enseñamos.</p>}
          <Button variant="outline" className="mt-3" onClick={() => (mensajeError ? setReferencia(null) : setIntento(i => i + 1))}>
            {mensajeError ? 'Ir a hoy' : 'Reintentar'}
          </Button>
        </div>
      ) : !datosAlDia ? (
        <div className="h-64 max-w-3xl animate-pulse rounded-xl border border-border bg-card" aria-busy="true" />
      ) : vacio ? (
        <div className="max-w-3xl rounded-xl border border-border bg-card px-4 py-8 text-center text-[13px] text-muted-foreground" data-testid="plazas-libres-vacio">
          {filtrando ? (
            <>
              <p>Con estos filtros no hay clases.</p>
              <Button variant="outline" className="mt-3" onClick={() => { setFiltroSala(''); setFiltroTipo(''); }}>Quitar filtros</Button>
            </>
          ) : futuro ? (
            <>
              <p>Aún no hay clases programadas {modo === 'mes' ? `en ${nombreMes(rango.desde)}` : 'esa semana'}.</p>
              <Link href="/calendario" className="mt-2 inline-block font-medium text-foreground underline underline-offset-2">Ir al Calendario</Link>
            </>
          ) : (
            <p>No quedan clases {modo === 'mes' ? 'este mes' : 'esta semana'}.</p>
          )}
        </div>
      ) : (
        <>
          {modo === 'semana'
            ? <SemanaPlazasLibres sesiones={sesiones} nombres={nombres} ofertaOcupa={datosAlDia.ofertaOcupa} />
            : <MesPlazasLibres sesiones={sesiones} hasta={datosAlDia.hasta} nombres={nombres} />}
          {datosAlDia.contadoEn && (
            <p className="text-[12px] text-muted-foreground" data-testid="plazas-libres-contado">
              Contado a las {horaEstudio(datosAlDia.contadoEn)}{datosAlDia.desde > rango.desde ? ', de hoy en adelante' : ''}: cambia en cuanto alguien reserva.
            </p>
          )}
        </>
      )}
    </div>
  );
}
