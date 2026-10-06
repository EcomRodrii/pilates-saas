'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useAforoEnVivoPortal } from '@/lib/student/use-aforo-portal';
import { getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { fechaLarga, hoyISO } from '@/lib/student/formato';
import { CajaQr, useBrilloAlMaximo, useQrAcceso } from '@/components/student/domain/QrAcceso';
import { Badge } from '@/components/student/ui/Badge';
import { etiquetaHistorial } from '@/lib/student/etiqueta-historial';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, Skeleton } from '@/components/student/ui/States';
import { ValorarClase } from '@/components/student/domain/ValorarClase';
import { alCalendario } from '@/lib/student/calendario-dispositivo';
import { useToast } from '@/components/student/ui/Toast';
import { InvitarAClaseFila } from '@/components/student/domain/CompartirClase';
import { getGamificacion } from '@/lib/student/gamificacion-datos';
import { premioPorInvitar } from '@/lib/student/gamificacion';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { useSesionStudent } from '@/lib/student/sesion';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { estaEnCurso, yaTermino } from '@/lib/student/estado-clase';

// Detalle de reserva + su QR de acceso (§A.10).
//
// El QR es el PERMANENTE de la alumna (Perfil → QR de acceso), el mismo en
// todas partes: no es de esta reserva ni caduca. Hasta el 27-sep era un token
// de dos minutos atado a la próxima clase, con un código de seis caracteres; lo
// sustituyó el control de acceso con QR. Enseñarlo no marca nada: el estudio lo
// escanea y Tentare mira en ese momento si esta reserva sigue en pie.
export default function DetalleReservaPage() {
  const { reservaId } = useParams<{ reservaId: string }>();
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();

  const cargar = useCallback(async () => {
    // `getGamificacion` sale del mismo payload: el premio de invitar no cuesta ninguna petición.
    const [reservas, clases, instructoras, gamificacion] = await Promise.all([
      getReservas(estudio.slug), getClases(estudio.slug), getInstructoras(estudio.slug), getGamificacion(estudio.slug),
    ]);
    const res = reservas.find((x) => x.id === reservaId);
    const c = res ? clases.find((x) => x.id === res.claseId) : undefined;
    return res && c ? { res, c, i: instructoras.find((x) => x.id === c.instructoraId), gamificacion } : null;
  }, [estudio.slug, reservaId]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d);
  // Aforo en vivo: si alguien reserva, cancela o el estudio quita a una
  // alumna, esta pantalla se entera sola. Sin sondeo: si nadie toca nada,
  // no se pide nada.
  useAforoEnVivoPortal(estudio.slug, estudio.id, refrescar);
  const { toast } = useToast();

  // «Activa» = confirmada Y todavía por venir. Sin la segunda mitad, una clase
  // confirmada de hace tres meses —que el estudio nunca marcó como asistida—
  // seguía enseñando la tarjeta del pase de acceso, con su QR y su «se valida
  // al llegar», para una clase que ya pasó.
  const activa = data?.res.estado === 'confirmada' && data.c.fecha >= hoyISO();

  // Solo se pide si se va a enseñar: reserva activa y el estudio con el control de acceso encendido.
  const qrAcceso = useQrAcceso(estudio.slug, activa && estudio.qrAcceso === true);
  const conQr = activa && estudio.qrAcceso === true && qrAcceso.estado !== 'apagado';
  // En la app de iOS, brillo al máximo mientras el QR está en pantalla.
  useBrilloAlMaximo(conQr && qrAcceso.estado === 'listo');
  // P04 en Mis clases: «Invita a una amiga a esta clase», con el MISMO enlace y la MISMA frase que la ficha
  // (`premioPorInvitar`, con su condición real). Solo si el estudio premia invitar y la clase aún no ha empezado.
  const { socia } = useSesionStudent(estudio.slug);
  const ahoraMs = useAhoraMs();

  if (estado === 'loading') {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton h={30} w="50%" />
          <Skeleton h={260} r={20} />
          <Skeleton h={120} r={16} />
        </div>
      </StudentShell>
    );
  }

  if (!data) {
    return (
      <StudentShell>
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState titulo="No encontramos esta reserva" onRetry={reintentar} />
        </div>
      </StudentShell>
    );
  }

  const { res, c, i } = data;
  const premio = data.gamificacion?.hay ? premioPorInvitar(data.gamificacion.formasDeGanar, nombreCreditos(estudio.creditosNombre)) : null;
  const invitar = activa && premio && ahoraMs !== null && !estaEnCurso(c, ahoraMs) && !yaTermino(c, ahoraMs);
  return (
    <StudentShell>
      <PageHeader titulo="Tu reserva" back />

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '13px', marginTop: 14 }}>
        {conQr ? (
          <section
            aria-label="QR de acceso"
            className="a-pop"
            style={{
              background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)',
              borderRadius: 'var(--radius-hero)', padding: '20px 18px', textAlign: 'center', boxShadow: 'var(--shadow-hero)',
            }}
          >
            <p className="t-label" style={{ color: 'var(--accent-deep-muted)' }}>
              QR de acceso · {estudio.nombre}
            </p>

            <div style={{ marginTop: 14 }}>
              <CajaQr qr={qrAcceso.qr} estado={qrAcceso.estado} onReintentar={qrAcceso.reintentar} />
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', color: 'var(--on-dark)' }}>{c.nombre}</p>
            <p style={{ margin: '3px 0 0', fontSize: 'var(--t-small)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 75%, transparent)' }}>
              {fechaLarga(c.fecha)} · {c.hora} · con {i?.nombre ?? '—'}
            </p>

            <p style={{ margin: '8px 0 0', fontSize: 'var(--t-micro)', fontWeight: 600, color: 'var(--accent-deep-muted)' }}>
              Muéstralo al llegar al estudio
            </p>
          </section>
        ) : (
          <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 'var(--t-body)', fontWeight: 800 }}>{c.nombre}</p>
              <p className="t-meta" style={{ marginTop: 2 }}>{fechaLarga(c.fecha)} · {c.hora}</p>
            </div>
            {/* ⚠️ La MISMA `etiquetaHistorial` que la lista de «Mis clases», y no
                un ternario propio. El de aquí terminaba en `else 'No asistió'`,
                así que una reserva CONFIRMADA de una clase ya pasada en la que
                el estudio no pasó lista —hay muchas en producción— se le
                enseñaba como una AUSENCIA: a una socia que reservó y
                seguramente fue se le decía que no se presentó, que es lo que
                en este producto lleva penalización. Y la lista, ya arreglada,
                decía «Reservada»: la misma reserva con dos afirmaciones a un
                toque de distancia. Con una sola función no pueden volver a
                contradecirse. */}
            <Badge tone={etiquetaHistorial(res.estado).tono}>
              {etiquetaHistorial(res.estado).texto}
            </Badge>
          </div>
        )}

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-small)' }}>
          <Fila k="Instructora" v={i?.nombre ?? '—'} />
          <Fila k="Sala" v={c.sala} />
          <Fila k="Dirección" v={estudio.direccion} />
        </div>

        {activa && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* En «Mis clases» solo la PRÓXIMA lleva el botón del calendario; las
                demás son filas de agenda que abren esta ficha. Aquí va para
                todas. */}
            <Button variant="light" full onClick={() => void alCalendario({ slug: estudio.slug, nombre: estudio.nombre, direccion: estudio.direccion }, c, i?.nombre)
              .then((r) => { if (r === 'añadida') toast('Añadida a tu calendario'); })}>
              + Calendario
            </Button>
            <Button variant="ghost" full onClick={() => router.push(href('/mis-reservas'))}>
              Gestionar o cancelar
            </Button>
          </div>
        )}

        {invitar && premio && <InvitarAClaseFila clase={c} socioId={socia?.socioId ?? null} premio={premio} />}

        {/* Solo tras asistir. El servidor lo vuelve a comprobar: la tarjeta
            no se pinta si él dice que no. */}
        {res.estado === 'asistida' && (
          <ValorarClase studioId={estudio.id} sesionId={c.id} instructora={i?.nombre} />
        )}
      </div>
    </StudentShell>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ color: 'var(--muted-foreground)' }}>{k}</span>
      <b style={{ textAlign: 'right' }}>{v}</b>
    </div>
  );
}
