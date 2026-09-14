'use client';

import { useCallback, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClases } from '@/lib/student/datos';
import { getAgendaInstructora, pedirBaja } from '@/lib/student/datos-instructora';
import { puedePedirBaja, textoBaja } from '@/lib/student/agenda-instructora';
import { addDias, etiquetaDia, hoyISO } from '@/lib/student/formato';
import { Sheet } from '@/components/student/ui/Sheet';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';
import { ErrorState, OfflineState, Skeleton } from '@/components/student/ui/States';
import { Foto } from '@/components/student/ui/Foto';
import { Icono } from '@/components/student/ui/Icono';

// Ficha de una clase que imparte la instructora.
//
// Es la ficha de clase de la alumna (`reservar/[claseId]`) con otra acción: la
// misma foto a sangre, las mismas filas y el botón fijo sobre la barra. Donde la
// alumna reserva, la instructora avisa de que no puede.
//
// ⚠️ «No puedo dar esta clase» NO cancela (decisión del 14-sep-2026): pide la
// baja al motor de sustituciones y la clase sigue a su nombre hasta que alguien
// la cubra o decida el estudio. Nada se da por hecho sin la respuesta del
// servidor: tras avisar se RECARGA y lo que se pinta es el estado real.

/** Hasta dónde busca la clase: la ficha se abre desde la agenda, que mira menos. */
const DIAS_BUSQUEDA = 30;

export default function FichaClaseInstructoraPage() {
  const { sesionId } = useParams<{ sesionId: string }>();
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const ahoraMs = useAhoraMs();
  const hoy = hoyISO();
  const hasta = addDias(hoy, DIAS_BUSQUEDA);

  const [abierta, setAbierta] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    const [agenda, publicas] = await Promise.all([
      getAgendaInstructora(estudio.slug, hoy, hasta),
      // La foto y la duración salen del catálogo de la app (ya en caché): así la
      // ficha se ve como la de la alumna sin una petición nueva.
      getClases(estudio.slug).catch(() => []),
    ]);
    const publica = publicas.find((c) => c.id === sesionId);
    return {
      clase: agenda.clases.find((c) => c.id === sesionId) ?? null,
      foto: publica?.fotoUrl || null,
    };
  }, [esInstructora, estudio.slug, hoy, hasta, sesionId]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.clase);
  const clase = data?.clase ?? null;

  const avisar = async () => {
    if (!clase || enviando) return;
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setEnviando(true);
    setError(null);
    const r = await pedirBaja(estudio.slug, clase.id, motivo);
    if (!r.ok) {
      setEnviando(false);
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      // La hoja se queda abierta con su motivo: puede reintentar sin reescribirlo.
      setError(r.error);
      return;
    }
    // Lo que se enseña después es lo que dice el servidor, no lo que suponemos.
    await refrescar();
    setEnviando(false);
    setAbierta(false);
    setMotivo('');
    toast(r.yaAvisada ? 'Ya habías avisado de esta clase' : 'Hemos avisado al estudio');
  };

  if (estado === 'loading') {
    return (
      <StudentShell modo="instructora">
        <div className="px" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton h={220} r={20} style={{ marginTop: -56 }} />
          <Skeleton h={22} w="60%" />
          <Skeleton h={96} r={14} />
        </div>
      </StudentShell>
    );
  }

  if (estado === 'error' || estado === 'empty' || !clase) {
    return (
      <StudentShell modo="instructora">
        <div className="px" style={{ paddingTop: 12 }}>
          <ErrorState
            titulo="No encontramos esta clase"
            cuerpo="Puede que ya haya pasado o que ya no esté a tu nombre."
            onRetry={reintentar}
          />
        </div>
      </StudentShell>
    );
  }

  const baja = clase.baja ? textoBaja(clase.baja.estado, clase.baja.sustituta) : null;
  const sePuede = ahoraMs != null && puedePedirBaja(clase, ahoraMs);
  const cuando = `${etiquetaDia(clase.fecha)} · ${clase.hora}`;

  return (
    <StudentShell modo="instructora" headerTransparente>
      {/* La misma cabecera de foto que la ficha de la alumna. Sin foto, la tinta
          oscura del kit, para que el texto blanco se siga leyendo. */}
      <section style={{ position: 'relative', height: 240, overflow: 'hidden', background: '#0F0F0C' }}>
        {data?.foto && (
          <Foto
            src={data.foto}
            ancho={640}
            alto={240}
            sizes="(min-width:1024px) 1040px, (min-width:768px) 640px, 100vw"
            prioritaria
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        <div
          aria-hidden
          style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(15,15,15,.36), rgba(15,15,15,0) 36%, rgba(15,15,15,0) 50%, rgba(15,15,15,.7))' }}
        />
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Volver"
          className="tap tap--icono"
          style={{ position: 'absolute', top: 'calc(56px + var(--safe-top))', left: 14, width: 34, height: 34, border: 'none', borderRadius: 999, background: 'rgba(250,249,245,.92)', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icono nombre="flecha-izquierda" tamano={18} />
        </button>
        <div style={{ position: 'absolute', left: 16, right: 16, bottom: 13, color: '#fff' }}>
          <p className="t-label" style={{ color: 'rgba(255,255,255,.82)' }}>Das clase</p>
          <h1 style={{ margin: '3px 0 0', fontSize: 'var(--t-h1)', fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1.05 }}>{clase.tipo}</h1>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {[cuando, clase.sala].filter((t): t is string => Boolean(t)).map((t) => (
              <span key={t} className="badge" style={{ background: 'rgba(250,249,245,.2)', border: '1px solid rgba(255,255,255,.45)', color: '#fff' }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 14, paddingBottom: 90 }}>
        {clase.cancelada && <div><Badge tone="full">Clase cancelada</Badge></div>}

        {baja && (
          <div className="card stack" role="status" data-testid="estado-baja" style={{ ['--gap' as string]: '3px', padding: '14px 16px' }}>
            <p className="t-label">Tu aviso</p>
            <p className="t-card-title">{baja.titulo}</p>
            {baja.detalle && <p className="t-small t-dim">{baja.detalle}</p>}
          </div>
        )}

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-small)' }}>
          <Fila k="Cuándo" v={`${cuando} – ${clase.horaFin}`} />
          <Fila k="Dónde" v={[estudio.direccion, clase.sala].filter(Boolean).join(' · ') || '—'} />
          <Fila k="Reservas" v={`${clase.confirmadas} de ${clase.aforo} plazas`} />
          {clase.enEspera > 0 && <Fila k="Lista de espera" v={String(clase.enEspera)} />}
        </div>

        {!online && <OfflineState cuerpo="Puedes ver la clase, pero avisar al estudio necesita conexión." />}
      </div>

      {sePuede && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--nav-height) + var(--safe-bottom))',
            zIndex: 39, padding: '10px 16px 12px',
            background: 'linear-gradient(180deg, rgba(250,249,245,0), var(--background) 40%)',
            maxWidth: 640, margin: '0 auto',
          }}
        >
          <Button variant="secondary" full disabled={!online} onClick={() => { setError(null); setAbierta(true); }}>
            No puedo dar esta clase
          </Button>
        </div>
      )}

      <Sheet open={abierta} onClose={() => { if (!enviando) setAbierta(false); }} label="Avisar de que no puedes dar la clase">
        <h3 className="t-h2">¿Avisamos al estudio?</h3>
        <p className="t-meta" style={{ marginTop: 4 }}>{clase.tipo} · {cuando}</p>
        <p className="t-small" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Buscamos quién la cubra. Hasta que se confirme, la clase sigue a tu nombre; si nadie puede, decide el estudio.
        </p>

        <label htmlFor="motivo-baja" className="t-label" style={{ display: 'block', marginTop: 14 }}>
          Lo que quieras contarle al estudio (opcional)
        </label>
        <textarea
          id="motivo-baja"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Por ejemplo: me ha surgido un imprevisto"
          // 16 px: por debajo, iOS amplía la página al enfocar y no vuelve.
          style={{ width: '100%', marginTop: 6, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 12, background: 'var(--card)', fontFamily: 'inherit', fontSize: 16, color: 'var(--foreground)', resize: 'none' }}
        />
        <p className="t-meta" style={{ marginTop: 4 }}>No hace falta dar detalles de salud.</p>

        {error && (
          <p role="alert" style={{ margin: '12px 0 0', background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
            {error}
          </p>
        )}

        <Button full loading={enviando} disabled={!online} onClick={() => void avisar()} style={{ marginTop: 14, height: 50, fontSize: 'var(--t-body)' }}>
          Avisar al estudio
        </Button>
        <Button variant="ghost" full disabled={enviando} onClick={() => setAbierta(false)} style={{ marginTop: 6 }}>
          Volver
        </Button>
      </Sheet>
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
