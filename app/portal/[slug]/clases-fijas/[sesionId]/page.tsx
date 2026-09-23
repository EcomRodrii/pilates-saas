'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClases, getClasesFijas, getClasesFrescas, getInstructoras, getReservas } from '@/lib/student/datos';
import { anularPeticionPlazaFija, pedirPlazaFija } from '@/lib/student/plaza-fija-peticion';
import { diasDeLaOferta } from '@/lib/student/clases-fijas';
import type { PlazaFijaEnClase } from '@/lib/student/plaza-fija';
import { TEXTOS_PLAZA_FIJA as TPF, losDias } from '@/lib/student/plaza-fija-textos';
import { etiquetaDia, horaFin } from '@/lib/student/formato';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { FichaClaseHero } from '@/components/student/domain/FichaClaseHero';
import { InstructorCard } from '@/components/student/domain/InstructorCard';
import { InstructoraSheet } from '@/components/student/domain/InstructoraSheet';

// La ficha de una CLASE FIJA: la misma clase que en el horario, pero para
// quedarse en ella cada semana, no para reservar un día. Por eso aquí no hay
// «Reservar»: la única acción es pedir la clase fija (o, si ya la pidió o ya la
// tiene, en qué punto está). Petición de los estudios (23-sep): con las dos
// acciones en la misma pantalla las alumnas no sabían cuál tocar.
//
// ⚠️ No decide nada: si puede pedirla lo dice el catálogo (`getClasesFijas`, el
// mismo que pinta la lista) y el servidor lo vuelve a comprobar al pedirla. Lo que
// cambia al pedir o anular sale de la respuesta del servidor, nunca optimista.
export default function FichaClaseFijaPage() {
  const { sesionId } = useParams<{ sesionId: string }>();
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { online } = useOnline();
  const { toast } = useToast();
  const [verInstructora, setVerInstructora] = useState(false);
  // Lo último que contestó el servidor al pedir o anular: el catálogo cacheado
  // aún no lo sabe.
  const [estadoLocal, setEstadoLocal] = useState<PlazaFijaEnClase | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const [clase, fijas, instructoras, clases, reservas] = await Promise.all([
      getClasesFrescas(estudio.slug).then((cs) => cs.find((c) => c.id === sesionId) ?? null),
      getClasesFijas(estudio.slug), getInstructoras(estudio.slug), getClases(estudio.slug), getReservas(estudio.slug),
    ]);
    return {
      clase, instructoras, clases, reservas,
      suelta: fijas?.sueltas.find((f) => f.proximaSesionId === sesionId) ?? null,
      oferta: fijas?.ofertas.find((o) => o.franjas.some((f) => f.proximaSesionId === sesionId)) ?? null,
    };
  }, [estudio.slug, sesionId]);

  const { data, estado, reintentar } = useAsync(cargar, (d) => !d.clase);
  const clase = data?.clase ?? null;
  const suelta = data?.suelta ?? null;
  const estadoFija = estadoLocal ?? suelta?.estado ?? null;
  const inst = data?.instructoras.find((i) => i.id === clase?.instructoraId);

  async function pedir() {
    if (!clase || enviando) return;
    setEnviando(true);
    setError('');
    const r = await pedirPlazaFija(estudio.slug, estudio.id, clase.id);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setEstadoLocal(r.solicitudId ? { estado: 'PEDIDA', peticionId: r.solicitudId } : { estado: 'TIENE_PLAZA' });
    toast(r.solicitudId ? TPF.pedida : 'Ya es tu clase fija ✓');
  }

  async function anular(peticionId: string) {
    if (enviando) return;
    setEnviando(true);
    setError('');
    const r = await anularPeticionPlazaFija(estudio.slug, estudio.id, peticionId);
    setEnviando(false);
    if (!r.ok) { setError(r.error); return; }
    setEstadoLocal({ estado: 'PUEDE_PEDIR' });
    toast('Petición anulada');
  }

  if (estado === 'loading') {
    return (
      <StudentShell>
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton h={280} r={20} style={{ marginTop: -56 }} />
          <Skeleton h={22} w="60%" />
          <Skeleton h={74} r={14} />
        </div>
      </StudentShell>
    );
  }

  if (estado === 'error' || !clase) {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState titulo="No encontramos esta clase" cuerpo="Puede que el estudio la haya quitado del horario." onRetry={reintentar} />
        </div>
      </StudentShell>
    );
  }

  const dia = new Date(`${clase.fecha}T12:00:00`).getDay();
  const cadaSemana = `Todos ${losDias(dia)} · ${clase.hora}`;

  return (
    <StudentShell headerTransparente>
      <FichaClaseHero clase={clase} chips={[cadaSemana, `${clase.duracionMin} min`, clase.sala]} />

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 14, paddingBottom: 110 }}>
        <p className="t-label" style={{ margin: 0 }}>{TPF.titulo}</p>

        {inst && <InstructorCard i={inst} onClick={() => setVerInstructora(true)} />}

        <p style={{ margin: 0, fontSize: 'var(--t-small)', lineHeight: 1.6, color: 'var(--muted-foreground)' }}>
          {clase.descripcion ?? `Grupo reducido de ${clase.capacidad} personas.`}
        </p>

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Fila k="Cuándo" v={`Todos ${losDias(dia)} · ${clase.hora} – ${horaFin(clase.hora, clase.duracionMin)}`} />
          <Fila k="Dónde" v={`${estudio.direccion} · ${clase.sala}`} />
          <Fila k="Próxima clase" v={etiquetaDia(clase.fecha)} />
          <Fila k="Capacidad" v={`${clase.capacidad} personas`} />
        </div>

        {/* Qué es y qué pasa al pedirla: solo mientras aún puede pedirla. */}
        {estadoFija?.estado === 'PUEDE_PEDIR' && (
          <div className="note" data-testid="que-es-clase-fija" style={{ margin: 0, background: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700 }}>{TPF.ofrecer(dia, clase.hora)}</p>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 500 }}>{TPF.quePasa}</p>
          </div>
        )}

        {!online && <OfflineState cuerpo="Puedes ver la clase, pero pedirla necesita conexión." />}
      </div>

      {/* La acción, fija sobre la navegación como «Reservar» en la ficha normal. */}
      <div
        data-testid="accion-clase-fija"
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 'var(--nav-total)', zIndex: 39, padding: '10px 16px 12px',
          background: 'linear-gradient(180deg, rgba(250,249,245,0), var(--background) 40%)', maxWidth: 640, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}
      >
        {error && <p role="alert" style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--danger, #b00020)', textAlign: 'center' }}>{error}</p>}
        {data?.oferta ? (
          // Esta clase va dentro de una clase fija con nombre: se pide entera, con su
          // duración, desde su tarjeta — no suelta.
          <>
            <p className="t-meta" style={{ margin: 0, textAlign: 'center' }}>
              Forma parte de «{data.oferta.nombre}», los {diasDeLaOferta(data.oferta.franjas)}.
            </p>
            <Link href={href('/clases-fijas')} className="btn btn--primary" style={{ height: 50, justifyContent: 'center' }}>Ver la clase fija</Link>
          </>
        ) : !estadoFija ? (
          <>
            <p className="t-meta" style={{ margin: 0, textAlign: 'center' }}>Esta clase ya no se ofrece como clase fija.</p>
            <Link href={href('/clases-fijas')} className="btn btn--secondary" style={{ height: 50, justifyContent: 'center' }}>Ver las clases fijas</Link>
          </>
        ) : estadoFija.estado === 'TIENE_PLAZA' ? (
          <>
            <p role="status" style={{ margin: 0, textAlign: 'center', fontSize: 'var(--t-small)', fontWeight: 800 }}>Ya es tu clase fija ✓</p>
            <Link href={href('/mis-reservas?tab=fijas')} className="btn btn--secondary" style={{ height: 50, justifyContent: 'center' }}>Ver mis clases fijas</Link>
          </>
        ) : estadoFija.estado === 'PEDIDA' ? (
          <>
            <p role="status" data-testid="clase-fija-pedida" style={{ margin: 0, textAlign: 'center', fontSize: 'var(--t-small)', fontWeight: 700 }}>{TPF.pedida}</p>
            <Button full variant="secondary" loading={enviando} disabled={!online} onClick={() => void anular(estadoFija.peticionId)}>{TPF.botonAnular}</Button>
          </>
        ) : estadoFija.estado === 'SOLO_CON_CUOTA' ? (
          <>
            <p data-testid="clase-fija-solo-cuota" style={{ margin: 0, textAlign: 'center', fontSize: 'var(--t-small)' }}>{TPF.soloConCuota}</p>
            <Link href={href('/comprar')} className="btn btn--secondary" style={{ height: 50, justifyContent: 'center' }}>Ver las cuotas</Link>
          </>
        ) : (
          <Button full loading={enviando} disabled={!online} onClick={() => void pedir()} style={{ height: 50, fontSize: 'var(--t-body)' }}>
            {TPF.botonPedir}
          </Button>
        )}
      </div>

      <InstructoraSheet
        instructora={inst ?? null} clases={data?.clases ?? []} reservas={data?.reservas ?? []} soportaEspera={estudio.soportaListaEspera} href={href}
        open={verInstructora} onClose={() => setVerInstructora(false)}
      />
    </StudentShell>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 'var(--t-small)' }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: 'right' }}>{v}</span>
    </div>
  );
}
