'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useToast } from '@/components/student/ui/Toast';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { escribirAAlumna, getFichaAlumna, getSaludAlumna } from '@/lib/student/datos-instructora';
import { textoEstadoClaseAlumna, type ClaseConAlumna } from '@/lib/student/alumnas-instructora';
import { resumenAsistencia, textoAsistencia } from '@/lib/student/alumnas-vista';
import { fechaEnZona } from '@/lib/student/agenda-instructora';
import { SEMAFORO_META } from '@/lib/ficha-clinica';
import { TEXTO_SEVERIDAD, TEXTO_ZONA, type SaludAlumna } from '@/lib/datos-salud/salud-para-instructora';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Ficha mínima de una alumna suya: nombre, foto, si es su primera clase en el
// estudio y sus clases con ELLA en los últimos 30 días y los próximos 30. Nada de
// contacto, pagos, bonos ni clases con otras instructoras (decisión del
// 14-sep-2026). Una alumna que no es suya se ve igual que una que no existe.
//
// Su salud se abre a petición: solo avisos estructurados (con consentimiento) y
// las notas que escribió ella. Abrirla queda registrado en el estudio, así que
// no se pide sola al entrar en la ficha.
//
// Pasada de diseño 6 (15-sep-2026): lo que mira antes de clase va arriba. La
// cabecera en verde noche (como «Pasar lista») con cómo ha venido a sus clases, y
// su próxima clase contigo destacada; después la salud y el resto de clases.

type FaseSalud =
  | { fase: 'cerrada' }
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'lista'; salud: SaludAlumna };

const TONO_SEMAFORO = { VERDE: 'ok', AMBAR: 'wait', ROJO: 'full' } as const;

function tonoEstado(estado: ClaseConAlumna['estado']) {
  if (estado === 'no-vino') return 'full' as const;
  if (estado === 'en-espera' || estado === 'pendiente') return 'wait' as const;
  if (estado === 'asistio') return 'ok' as const;
  return 'neutral' as const;
}

function SeccionSalud({ slug, socioId, online }: { slug: string; socioId: string; online: boolean }) {
  const [estado, setEstado] = useState<FaseSalud>({ fase: 'cerrada' });

  const abrir = async () => {
    setEstado({ fase: 'cargando' });
    try {
      const salud = await getSaludAlumna(slug, socioId);
      setEstado(salud ? { fase: 'lista', salud } : { fase: 'error' });
    } catch {
      setEstado({ fase: 'error' });
    }
  };

  return (
    <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="fa-salud" data-testid="salud-alumna">
      <h3 id="fa-salud" className="t-label">Salud</h3>
      {estado.fase !== 'lista' && (
        <div className="card card--pad-lg" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icono nombre="aviso" tamano={18} />
            </span>
            <p className="t-small" style={{ margin: 0 }}>Sus avisos para adaptar la clase y tus notas sobre ella. El estudio apunta que los has consultado.</p>
          </div>
          {estado.fase === 'error' && (
            <p className="t-small" role="alert" style={{ margin: 0, color: 'var(--destructive-foreground)' }}>
              No hemos podido abrir sus avisos de salud. Vuelve a intentarlo.
            </p>
          )}
          <Button variant="secondary" full loading={estado.fase === 'cargando'} disabled={!online || estado.fase === 'cargando'} onClick={() => void abrir()}>
            Ver sus avisos de salud
          </Button>
        </div>
      )}
      {estado.fase === 'lista' && <SaludAbierta salud={estado.salud} />}
    </section>
  );
}

function SaludAbierta({ salud }: { salud: SaludAlumna }) {
  if (salud.consentimiento !== 'VIGENTE') {
    return (
      <div className="card card--pad-lg">
        <p className="t-small">No ha dado su consentimiento para compartir datos de salud con el estudio, así que no hay nada que enseñarte.</p>
      </div>
    );
  }
  const hoy = hoyISO();
  return (
    <>
      <div className="card card--pad-lg stack" style={{ ['--gap' as string]: 'var(--s-3)' }}>
        <div><Badge tone={TONO_SEMAFORO[salud.semaforo]}>{SEMAFORO_META[salud.semaforo].label}</Badge></div>
        {salud.avisos.length === 0
          ? <p className="t-small t-dim">No tiene avisos de salud activos.</p>
          : salud.avisos.map((a, i) => (
            <div key={i} data-testid="aviso-salud" style={{ paddingTop: i > 0 ? 10 : 0, borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <p className="t-card-title">{a.etiqueta}</p>
              <p className="t-meta">
                {[a.zona ? TEXTO_ZONA[a.zona] : null, `Gravedad ${TEXTO_SEVERIDAD[a.severidad].toLowerCase()}`].filter(Boolean).join(' · ')}
              </p>
              {a.restricciones.length > 0 && <p className="t-small" style={{ marginTop: 2 }}>{a.restricciones.join(' · ')}</p>}
            </div>
          ))}
      </div>

      <h3 className="t-label" style={{ marginTop: 8 }}>Tus notas sobre ella</h3>
      {salud.notas.length === 0
        ? <p className="t-small t-dim">No has escrito notas sobre ella.</p>
        : salud.notas.map((n) => (
          <div key={n.id} className="card stack" style={{ padding: '10px 12px', ['--gap' as string]: 'var(--s-1)' }} data-testid="nota-propia">
            <p className="t-meta">{etiquetaDia(fechaEnZona(n.creadaEn), hoy)}</p>
            {n.textoLibre && <p className="t-small" style={{ whiteSpace: 'pre-line' }}>{n.textoLibre}</p>}
            {n.progreso && <p className="t-small"><strong>Progreso:</strong> {n.progreso}</p>}
            {n.alertas && <p className="t-small"><strong>Alertas:</strong> {n.alertas}</p>}
            {n.planProximaSesion && <p className="t-small"><strong>Próxima sesión:</strong> {n.planProximaSesion}</p>}
          </div>
        ))}
    </>
  );
}

export default function FichaAlumnaInstructoraPage() {
  const { socioId } = useParams<{ socioId: string }>();
  const { estudio } = useEstudio();
  const href = usePortalHref();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const { online } = useOnline();
  const router = useRouter();
  const { toast } = useToast();
  const [abriendo, setAbriendo] = useState(false);
  const esInstructora = Boolean(instructora);

  const escribir = async () => {
    if (abriendo) return;
    setAbriendo(true);
    const r = await escribirAAlumna(estudio.slug, socioId);
    setAbriendo(false);
    if (!r.ok) { toast(r.error); return; }
    router.push(href(`/equipo/mensajes/${encodeURIComponent(r.id)}`));
  };
  const hoy = hoyISO();

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getFichaAlumna(estudio.slug, socioId) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug, socioId],
  );
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d);

  if (estado === 'loading') {
    return (
      <StudentShell modo="instructora">
        <PageHeader back titulo="Alumna" />
        <div className="px" style={{ marginTop: 14 }}><ListSkeleton n={3} h={64} /></div>
      </StudentShell>
    );
  }

  if (estado === 'error' || estado === 'empty' || !data) {
    return (
      <StudentShell modo="instructora">
        <PageHeader back titulo="Alumna" />
        <div className="px" style={{ paddingTop: 12 }}>
          {estado === 'offline'
            ? <OfflineState cuerpo="Para ver a tus alumnas necesitas conexión." />
            : (
              <ErrorState
                titulo="No encontramos a esta alumna"
                cuerpo="Solo puedes ver a las alumnas de tus clases de los últimos 30 días o de los próximos 30."
                onRetry={reintentar}
              />
            )}
        </div>
      </StudentShell>
    );
  }

  const asistencia = textoAsistencia(resumenAsistencia(data.pasadas));
  const [proxima, ...otrasProximas] = data.proximas;
  const tenue = 'color-mix(in srgb, var(--accent-deep-foreground) 78%, transparent)';

  const fila = (c: ClaseConAlumna, enlace: boolean) => {
    const contenido = (
      <>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="t-card-title trunc">{c.tipo}</p>
          <p className="t-meta">{etiquetaDia(c.fecha, hoy)} · {c.hora}</p>
        </div>
        <Badge tone={tonoEstado(c.estado)}>{textoEstadoClaseAlumna(c.estado)}</Badge>
      </>
    );
    const estilo = { padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 12 } as const;
    // Solo las próximas enlazan a la ficha de la clase (la agenda mira hacia delante).
    return enlace ? (
      <Link key={c.sesionId} href={href(`/equipo/clase/${encodeURIComponent(c.sesionId)}`)} className="card card--tap" data-testid="clase-alumna" style={estilo}>
        {contenido}
      </Link>
    ) : (
      <div key={c.sesionId} className="card" data-testid="clase-alumna" style={estilo}>{contenido}</div>
    );
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Alumna" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, paddingBottom: 24 }}>
        {/* Quién es y cómo le va contigo, en el verde noche de «Pasar lista». */}
        <section
          aria-labelledby="nombre-alumna"
          style={{ borderRadius: 'var(--radius-hero)', background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)', padding: '15px', boxShadow: 'var(--shadow-hero)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <AvatarSocia nombre={data.nombre} fotoUrl={data.fotoUrl} size={56} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 id="nombre-alumna" className="trunc" data-testid="nombre-alumna" style={{ margin: 0, fontSize: 'var(--t-h2)', fontWeight: 800, letterSpacing: '-.02em', color: 'var(--on-dark)' }}>
                {data.nombre}
              </h2>
              <p style={{ margin: '3px 0 0', fontSize: 'var(--t-meta)', fontWeight: 600, color: tenue }}>
                {data.primeraClase ? 'Aún no ha venido a ninguna clase del estudio' : (asistencia ?? 'Todavía sin clases marcadas contigo')}
              </p>
            </div>
          </div>
          {/* Sin cuenta en la app no tiene dónde leer un mensaje: ni se ofrece. */}
          {data.tieneCuenta && (
            <Button
              size="sm" full loading={abriendo} disabled={!online || abriendo} onClick={() => void escribir()}
              style={{ marginTop: 12, background: 'var(--on-dark)', color: 'var(--accent-deep)', border: 'none' }}
            >
              Escribir
            </Button>
          )}
        </section>

        {proxima && (
          <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="fa-proxima">
            <h3 id="fa-proxima" className="t-label">Su próxima clase contigo</h3>
            {fila(proxima, true)}
          </section>
        )}

        <SeccionSalud slug={estudio.slug} socioId={data.socioId} online={online} />

        {!proxima && (
          <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="fa-proximas">
            <h3 id="fa-proximas" className="t-label">Próximas clases contigo</h3>
            <p className="t-small t-dim" style={{ margin: 0 }}>No tiene clases próximas contigo.</p>
          </section>
        )}
        {otrasProximas.length > 0 && (
          <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="fa-proximas">
            <h3 id="fa-proximas" className="t-label">Después · {otrasProximas.length}</h3>
            {otrasProximas.map((c) => fila(c, true))}
          </section>
        )}

        {data.pasadas.length > 0 && (
          <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="fa-pasadas">
            <h3 id="fa-pasadas" className="t-label">Clases pasadas contigo · {data.pasadas.length}</h3>
            {data.pasadas.map((c) => fila(c, false))}
          </section>
        )}

        <p className="t-meta">Solo ves lo que necesitas para dar tus clases. Sus datos de contacto y pagos los lleva el estudio.</p>
      </div>
    </StudentShell>
  );
}
