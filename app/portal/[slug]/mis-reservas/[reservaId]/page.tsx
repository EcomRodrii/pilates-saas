'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { getClases, getInstructoras, getReservas } from '@/lib/student/datos';
import { getPase, type Pase } from '@/lib/student/reservas-acciones';
import { fechaLarga, hoyISO } from '@/lib/student/formato';
import { qrSvgMarkup } from '@/lib/qr-svg';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { ErrorState, Skeleton } from '@/components/student/ui/States';
import { ValorarClase } from '@/components/student/domain/ValorarClase';

// Detalle de reserva + pase de acceso (§A.10).
//
// ⚠️ El QR es REAL, no el grid decorativo del paquete. `POST /api/public/pase`
// devuelve un token firmado que caduca en DOS MINUTOS, y `lib/qr-svg.ts` —que
// sobrevivió al borrado del portal— lo dibuja. Esa caducidad es el punto: sin
// ella, una captura reenviada por WhatsApp abre la puerta del estudio, porque
// validar el pase dispara Kisi. Por eso se vuelve a pedir mientras la pantalla
// está abierta y NUNCA se guarda.
//
// ⚠️ Y el pase es de la PRÓXIMA clase, no de una reserva cualquiera: el
// endpoint devuelve uno solo. Por eso se comprueba `pase.reservaId` contra la
// reserva que se está mirando — sin eso, el detalle de una clase de la semana
// que viene enseñaría el pase de la de mañana bajo su título.
const REFRESCO_PASE_MS = 60_000;

export default function DetalleReservaPage() {
  const { reservaId } = useParams<{ reservaId: string }>();
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const [pase, setPase] = useState<Pase | null>(null);
  // `null` = todavía no ha vuelto; `true` = ya contestó. Distinguirlo es lo que
  // evita dejar «Preparando tu pase…» para siempre cuando la respuesta ya
  // llegó y resulta que el pase no es de esta reserva.
  const [paseResuelto, setPaseResuelto] = useState(false);

  const cargar = useCallback(async () => {
    const [reservas, clases, instructoras] = await Promise.all([
      getReservas(estudio.slug), getClases(estudio.slug), getInstructoras(estudio.slug),
    ]);
    const res = reservas.find((x) => x.id === reservaId);
    const c = res ? clases.find((x) => x.id === res.claseId) : undefined;
    return res && c ? { res, c, i: instructoras.find((x) => x.id === c.instructoraId) } : null;
  }, [estudio.slug, reservaId]);

  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  // «Activa» = confirmada Y todavía por venir. Sin la segunda mitad, una clase
  // confirmada de hace tres meses —que el estudio nunca marcó como asistida—
  // seguía enseñando la tarjeta del pase de acceso, con su QR y su «se valida
  // al llegar», para una clase que ya pasó.
  const activa = data?.res.estado === 'confirmada' && data.c.fecha >= hoyISO();

  // El token caduca en 2 min: se refresca mientras la pantalla esté abierta.
  useEffect(() => {
    if (!activa) return;
    let vivo = true;
    const pedir = () => {
      void getPase(estudio.slug).then((p) => { if (vivo) { setPase(p); setPaseResuelto(true); } });
    };
    pedir();
    const id = setInterval(pedir, REFRESCO_PASE_MS);
    return () => { vivo = false; clearInterval(id); };
  }, [activa, estudio.slug]);

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
  // El pase solo se enseña si es EL de esta reserva.
  const paseDeEsta = pase?.hayPase && pase.reservaId === res.id ? pase : null;

  return (
    <StudentShell>
      <PageHeader titulo="Tu reserva" back />

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '13px', marginTop: 14 }}>
        {activa ? (
          <section
            aria-label="Pase de acceso"
            className="a-pop"
            style={{
              background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)',
              borderRadius: 22, padding: '20px 18px', textAlign: 'center', boxShadow: 'var(--shadow-hero)',
            }}
          >
            <p className="t-label" style={{ color: 'var(--accent-deep-muted)' }}>
              Pase de acceso · {estudio.nombre}
            </p>

            <div
              style={{
                width: 168, height: 168, margin: '14px auto 0', background: '#FAF9F5',
                borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {paseDeEsta?.vigente && paseDeEsta.token ? (
                <div
                  role="img"
                  aria-label="Código QR de acceso"
                  style={{ width: '100%', height: '100%' }}
                  // El SVG lo genera `lib/qr-svg.ts` a partir del token firmado.
                  // No es HTML de usuario: es marcado que construimos aquí.
                  dangerouslySetInnerHTML={{ __html: qrSvgMarkup(paseDeEsta.token) }}
                />
              ) : (
                // Sin QR no se deja un hueco mudo: se dice POR QUÉ y CUÁNDO.
                // Es la diferencia entre «esto está roto» y «todavía no toca».
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#5A5A52', lineHeight: 1.5 }}>
                  {paseDeEsta?.yaAsistida
                    ? 'Ya has entrado a esta clase ✓'
                    : paseDeEsta
                      ? `Tu pase se activa ${paseDeEsta.minutosParaActivarse > 0
                          ? `en ${paseDeEsta.minutosParaActivarse} min`
                          : 'en breve'}`
                      : paseResuelto
                        // El servidor ya contestó y este pase no es de esta
                        // reserva: solo hay uno, el de la próxima clase. Decirlo
                        // es mejor que dejar un «Preparando…» que no acaba nunca.
                        ? 'El pase aparece aquí el día de la clase'
                        : 'Preparando tu pase…'}
                </p>
              )}
            </div>

            <p style={{ margin: '14px 0 0', fontSize: 16, fontWeight: 800, color: '#FAF9F5' }}>{c.nombre}</p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: 'rgba(234,240,231,.75)' }}>
              {fechaLarga(c.fecha)} · {c.hora} · con {i?.nombre ?? '—'}
            </p>

            {paseDeEsta?.vigente && paseDeEsta.codigo && (
              // El código corto existe para cuando la cámara no lee: pantalla
              // rota, mucha luz, funda con brillo.
              <p className="t-mono" style={{ margin: '10px 0 0', fontSize: 13, letterSpacing: '.18em', color: '#FAF9F5' }}>
                {paseDeEsta.codigo}
              </p>
            )}
            <p className="t-mono" style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--accent-deep-muted)' }}>
              Se valida solo al llegar
            </p>
          </section>
        ) : (
          <div className="card" style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>{c.nombre}</p>
              <p className="t-meta" style={{ marginTop: 2 }}>{fechaLarga(c.fecha)} · {c.hora}</p>
            </div>
            <Badge tone={res.estado === 'asistida' ? 'ok' : res.estado === 'en-espera' ? 'wait' : 'neutral'}>
              {res.estado === 'asistida' ? 'Asistida'
                : res.estado === 'cancelada' ? 'Cancelada'
                  : res.estado === 'en-espera' ? 'En espera' : 'No asistió'}
            </Badge>
          </div>
        )}

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
          <Fila k="Instructora" v={i?.nombre ?? '—'} />
          <Fila k="Sala" v={c.sala} />
          <Fila k="Dirección" v={estudio.direccion} />
          <Fila k="Pagada con" v={res.pagadaCon === 'bono' ? 'Bono · 1 sesión' : res.pagadaCon === 'plan' ? 'Tu plan' : 'Clase suelta'} />
        </div>

        {activa && (
          <Button variant="ghost" full onClick={() => router.push(href('/mis-reservas'))}>
            Gestionar o cancelar
          </Button>
        )}

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
