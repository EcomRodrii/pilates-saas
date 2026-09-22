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
import { escribirAAlumna, getFichaAlumna, getSaludAlumna, guardarNotaSesion } from '@/lib/student/datos-instructora';
import { textoEstadoClaseAlumna, type ClaseConAlumna } from '@/lib/student/alumnas-instructora';
import { resumenAsistencia, textoAsistencia } from '@/lib/student/alumnas-vista';
import { fechaEnZona } from '@/lib/student/agenda-instructora';
import { MAX_CAMPO_NOTA, MAX_TEXTO_NOTA } from '@/lib/portal-instructora/nota-sesion';
import { SEMAFORO_META } from '@/lib/ficha-clinica';
import { TEXTO_SEVERIDAD, TEXTO_ZONA, type SaludAlumna } from '@/lib/datos-salud/salud-para-instructora';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { Badge } from '@/components/student/ui/Badge';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { Sheet } from '@/components/student/ui/Sheet';
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
//
// Nota de sesión (15-sep-2026): con la salud abierta —o sea, con consentimiento
// vigente— puede escribir una nota. Solo añade; la nota queda a su nombre y la ve
// la dirección del estudio (`guardarNotaDeSesion`).

type NotaDeSalud = Extract<SaludAlumna, { consentimiento: 'VIGENTE' }>['notas'][number];

type FaseSalud =
  | { fase: 'cerrada' }
  | { fase: 'cargando' }
  | { fase: 'error' }
  | { fase: 'lista'; salud: SaludAlumna };

const TONO_SEMAFORO = { VERDE: 'ok', AMBAR: 'wait', ROJO: 'full' } as const;

/** 16 px: por debajo, iOS amplía la página al enfocar y no vuelve. */
const CAMPO = {
  width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12,
  background: 'var(--card)', fontFamily: 'inherit', fontSize: 16, color: 'var(--foreground)',
} as const;

function tonoEstado(estado: ClaseConAlumna['estado']) {
  if (estado === 'no-vino') return 'full' as const;
  if (estado === 'en-espera' || estado === 'pendiente') return 'wait' as const;
  if (estado === 'asistio') return 'ok' as const;
  return 'neutral' as const;
}

function SeccionSalud({ slug, socioId, online, clases }: {
  slug: string; socioId: string; online: boolean;
  /** Sus clases pasadas contigo, de la más reciente: a cuál se refiere la nota. */
  clases: ClaseConAlumna[];
}) {
  const [estado, setEstado] = useState<FaseSalud>({ fase: 'cerrada' });
  const [escribiendo, setEscribiendo] = useState(false);

  const abrir = async () => {
    setEstado({ fase: 'cargando' });
    try {
      const salud = await getSaludAlumna(slug, socioId);
      setEstado(salud ? { fase: 'lista', salud } : { fase: 'error' });
    } catch {
      setEstado({ fase: 'error' });
    }
  };

  // La nota recién guardada, arriba: la que ha confirmado el servidor.
  const anadirNota = (nota: NotaDeSalud) => {
    setEstado((e) => (e.fase === 'lista' && e.salud.consentimiento === 'VIGENTE'
      ? { fase: 'lista', salud: { ...e.salud, notas: [nota, ...e.salud.notas] } }
      : e));
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
      {estado.fase === 'lista' && (
        <SaludAbierta salud={estado.salud} online={online} onEscribir={() => setEscribiendo(true)} />
      )}
      {estado.fase === 'lista' && estado.salud.consentimiento === 'VIGENTE' && (
        <NotaSheet
          abierta={escribiendo}
          onClose={() => setEscribiendo(false)}
          slug={slug}
          socioId={socioId}
          clases={clases}
          online={online}
          onGuardada={anadirNota}
        />
      )}
    </section>
  );
}

function SaludAbierta({ salud, online, onEscribir }: { salud: SaludAlumna; online: boolean; onEscribir: () => void }) {
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
        <h3 className="t-label" style={{ margin: 0 }}>Tus notas sobre ella</h3>
        <Button size="sm" variant="secondary" disabled={!online} onClick={onEscribir} data-testid="escribir-nota">
          Escribir nota
        </Button>
      </div>
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

/**
 * La hoja para escribir la nota. Lo obligatorio es «¿Qué tal ha ido?»; el resto,
 * si lo hay. Solo se da por guardada cuando el servidor lo confirma: si falla, la
 * hoja sigue abierta con lo escrito.
 */
function NotaSheet({ abierta, onClose, slug, socioId, clases, online, onGuardada }: {
  abierta: boolean; onClose: () => void; slug: string; socioId: string;
  clases: ClaseConAlumna[]; online: boolean; onGuardada: (n: NotaDeSalud) => void;
}) {
  const { toast } = useToast();
  const hoy = hoyISO();
  const [sesionId, setSesionId] = useState(clases[0]?.sesionId ?? '');
  const [texto, setTexto] = useState('');
  const [progreso, setProgreso] = useState('');
  const [alertas, setAlertas] = useState('');
  const [plan, setPlan] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cerrar = () => { if (!guardando) onClose(); };

  const guardar = async () => {
    if (guardando) return;
    if (!texto.trim()) { setError('Cuenta qué tal ha ido la clase.'); return; }
    setGuardando(true);
    setError(null);
    const r = await guardarNotaSesion(slug, socioId, {
      textoLibre: texto, progreso, alertas, planProximaSesion: plan, sesionId: sesionId || null,
    });
    setGuardando(false);
    if (!r.ok) { setError(r.error); return; }
    onGuardada(r.nota);
    setTexto(''); setProgreso(''); setAlertas(''); setPlan('');
    onClose();
    toast('Nota guardada');
  };

  return (
    <Sheet open={abierta} onClose={cerrar} label="Escribir una nota de la sesión">
      <h3 className="t-h2">Nota de la sesión</h3>
      <p className="t-meta" style={{ marginTop: 4 }}>La ves tú y la dirección del estudio. Escribe solo lo que sirve para sus clases.</p>

      {clases.length > 0 && (
        <>
          <label htmlFor="nota-clase" className="t-label" style={{ display: 'block', marginTop: 14 }}>Clase</label>
          <select id="nota-clase" value={sesionId} disabled={guardando} onChange={(e) => setSesionId(e.target.value)} style={CAMPO}>
            {clases.map((c) => (
              <option key={c.sesionId} value={c.sesionId}>{c.tipo} · {etiquetaDia(c.fecha, hoy)} · {c.hora}</option>
            ))}
            <option value="">Sin una clase concreta</option>
          </select>
        </>
      )}

      <label htmlFor="nota-texto" className="t-label" style={{ display: 'block', marginTop: 14 }}>¿Qué tal ha ido?</label>
      <textarea
        id="nota-texto" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={guardando}
        rows={4} maxLength={MAX_TEXTO_NOTA} placeholder="Por ejemplo: mejor movilidad de cadera, le cuesta la plancha"
        style={{ ...CAMPO, resize: 'none' }}
      />

      <label htmlFor="nota-progreso" className="t-label" style={{ display: 'block', marginTop: 12 }}>Progreso (opcional)</label>
      <input id="nota-progreso" value={progreso} onChange={(e) => setProgreso(e.target.value)} disabled={guardando} maxLength={MAX_CAMPO_NOTA} style={CAMPO} />

      <label htmlFor="nota-alertas" className="t-label" style={{ display: 'block', marginTop: 12 }}>A tener en cuenta (opcional)</label>
      <input id="nota-alertas" value={alertas} onChange={(e) => setAlertas(e.target.value)} disabled={guardando} maxLength={MAX_CAMPO_NOTA} placeholder="Molestias, algo a vigilar" style={CAMPO} />

      <label htmlFor="nota-plan" className="t-label" style={{ display: 'block', marginTop: 12 }}>Para la próxima sesión (opcional)</label>
      <input id="nota-plan" value={plan} onChange={(e) => setPlan(e.target.value)} disabled={guardando} maxLength={MAX_CAMPO_NOTA} style={CAMPO} />

      {error && (
        <p role="alert" style={{ margin: '12px 0 0', background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      <Button full loading={guardando} disabled={!online} onClick={() => void guardar()} data-testid="guardar-nota" style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>
        Guardar nota
      </Button>
      <Button variant="ghost" full disabled={guardando} onClick={cerrar} style={{ marginTop: 6 }}>
        Volver
      </Button>
    </Sheet>
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
  const { data, estado, reintentar } = useAsync(cargar, (d) => !d, `instr:${estudio.slug}:alumna:${socioId}`);

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
              <h2 id="nombre-alumna" className="trunc" data-testid="nombre-alumna" style={{ margin: 0, fontSize: 'var(--t-h2)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em', color: 'var(--on-dark)' }}>
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

        {/* Para la nota, solo las clases en las que tuvo plaza: la lista de espera
            o una pendiente de aprobar no son una sesión con ella. */}
        <SeccionSalud
          slug={estudio.slug} socioId={data.socioId} online={online}
          clases={data.pasadas.filter((c) => c.estado === 'asistio' || c.estado === 'no-vino' || c.estado === 'sin-marcar')}
        />

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
