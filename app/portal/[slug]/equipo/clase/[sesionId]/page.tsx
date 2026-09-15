'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useAhoraMs } from '@/lib/student/use-ahora';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getClases } from '@/lib/student/datos';
import { getAgendaInstructora, getListaClase, pedirBaja } from '@/lib/student/datos-instructora';
import { AvatarSocia } from '@/components/student/domain/AvatarSocia';
import { puedePasarLista, puedePedirBaja, textoBaja } from '@/lib/student/agenda-instructora';
import { ocupacion, textoAperturaLista, textoPlazasLibres } from '@/lib/student/clase-vista';
import { CATEGORIAS_BAJA, textoRevision, type CategoriaBaja } from '@/lib/student/baja-instructora';
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
//
// Pasada de diseño 6 (15-sep-2026): sin foto, la cabecera era un bloque negro de
// 240 px casi vacío; ahora es el verde noche del kit y más baja. Lo que se mira
// antes de clase —cuánto se ha llenado— va en grande, con su barra, y se dice
// desde qué hora podrá pasar lista.

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
  const [categoria, setCategoria] = useState<CategoriaBaja | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    const [agenda, publicas, lista] = await Promise.all([
      getAgendaInstructora(estudio.slug, hoy, hasta),
      // La foto y la duración salen del catálogo de la app (ya en caché): así la
      // ficha se ve como la de la alumna sin una petición nueva.
      getClases(estudio.slug).catch(() => []),
      // «Quién viene»: la misma lista que «Pasar lista» (nombre corto). Si falla,
      // la ficha se enseña igual, sin esa sección.
      getListaClase(estudio.slug, sesionId).catch(() => null),
    ]);
    const publica = publicas.find((c) => c.id === sesionId);
    return {
      clase: agenda.clases.find((c) => c.id === sesionId) ?? null,
      foto: publica?.fotoUrl || null,
      quienViene: (lista?.alumnas ?? []).filter((a) => a.estado !== 'no-vino'),
    };
  }, [esInstructora, estudio.slug, hoy, hasta, sesionId]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.clase);
  const clase = data?.clase ?? null;

  const avisar = async () => {
    if (!clase || enviando) return;
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setEnviando(true);
    setError(null);
    const r = await pedirBaja(estudio.slug, clase.id, motivo, categoria);
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
    setCategoria(null);
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
  const revision = textoRevision(clase.baja?.revision ?? null);
  const sePuede = ahoraMs != null && puedePedirBaja(clase, ahoraMs);
  // Desde una hora antes: en esa hora conviven las dos acciones (una baja de
  // última hora sigue siendo posible), así que la barra puede llevar dos botones.
  const listaAbierta = ahoraMs != null && puedePasarLista(clase, ahoraMs);
  const cuando = `${etiquetaDia(clase.fecha)} · ${clase.hora}`;
  const plazas = ocupacion(clase);
  const aperturaLista = ahoraMs != null ? textoAperturaLista(clase, ahoraMs) : null;
  const vienen = data?.quienViene.length ?? 0;

  return (
    <StudentShell modo="instructora" headerTransparente>
      {/* La misma cabecera de foto que la ficha de la alumna. Sin foto, el verde
          noche del kit (el de «Pasar lista»), y más baja: era un bloque negro de
          240 px con el texto abajo del todo. */}
      <section style={{ position: 'relative', height: data?.foto ? 240 : 200, overflow: 'hidden', background: 'var(--accent-deep)' }}>
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

      <div className="px grid-lg-2" style={{ ['--lg2-gap' as string]: '14px', paddingTop: 14, paddingBottom: sePuede && listaAbierta ? 150 : 90 }}>
        {clase.cancelada && <div><Badge tone="full">Clase cancelada</Badge></div>}

        {baja && (
          <div className="card stack" role="status" data-testid="estado-baja" style={{ ['--gap' as string]: '3px', padding: '14px 16px' }}>
            <p className="t-label">Tu aviso</p>
            <p className="t-card-title">{baja.titulo}</p>
            {baja.detalle && <p className="t-small t-dim">{baja.detalle}</p>}
            {revision && (
              <div data-testid="revision-baja" className="stack" style={{ ['--gap' as string]: '2px', marginTop: 6 }}>
                <p className="t-small" style={{ fontWeight: 700 }}>{revision.titulo}</p>
                {revision.nota && <p className="t-small t-dim">«{revision.nota}»</p>}
              </div>
            )}
          </div>
        )}

        {/* Cuánto se ha llenado, en grande: es lo primero que mira. */}
        {!clase.cancelada && (
          <section className="card card--pad-lg" aria-labelledby="ocupacion" data-testid="ocupacion-clase">
            <p id="ocupacion" className="t-label" style={{ margin: 0 }}>Reservas</p>
            <p aria-hidden style={{ margin: '6px 0 0', display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span className="t-num" style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.03em', lineHeight: 1 }}>{plazas.confirmadas}</span>
              <span style={{ fontSize: 'var(--t-body)', fontWeight: 600, color: 'var(--muted-foreground)' }}>de {plazas.aforo} plazas</span>
            </p>
            <div aria-hidden style={{ marginTop: 9, height: 6, borderRadius: 99, background: 'var(--muted)', overflow: 'hidden' }}>
              <div style={{ width: `${plazas.porcentaje}%`, height: '100%', borderRadius: 99, background: 'var(--accent)' }} />
            </div>
            <p className="t-meta" style={{ margin: '7px 0 0' }}>
              <span className="sr-only">{plazas.confirmadas} de {plazas.aforo} plazas reservadas. </span>
              {[textoPlazasLibres(plazas), clase.enEspera > 0 ? `${clase.enEspera} en lista de espera` : null].filter(Boolean).join(' · ')}
            </p>
          </section>
        )}

        <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--t-small)' }}>
          <Fila k="Cuándo" v={`${cuando} – ${clase.horaFin}`} />
          <Fila k="Dónde" v={[estudio.direccion, clase.sala].filter(Boolean).join(' · ') || '—'} />
          {clase.cancelada && <Fila k="Reservas" v={`${clase.confirmadas} de ${clase.aforo} plazas`} />}
        </div>

        {aperturaLista && (
          <p className="t-small t-dim" data-testid="apertura-lista" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icono nombre="calendario" tamano={16} />
            {aperturaLista}
          </p>
        )}

        {/* En una clase cancelada no hay a quién preparar, y sus alumnas pueden no
            contar ya como «tuyas»: el enlace acabaría en «No encontramos a esta alumna». */}
        {!clase.cancelada && (data?.quienViene.length ?? 0) > 0 && (
          <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="quien-viene">
            <h2 id="quien-viene" className="t-label">Quién viene · {vienen}</h2>
            {data?.quienViene.map((a) => {
              const contenido = (
                <>
                  <AvatarSocia nombre={a.nombre} size={32} />
                  <span className="t-small trunc" style={{ flex: 1, fontWeight: 700 }}>{a.nombre}</span>
                </>
              );
              const estilo = { padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 } as const;
              return a.socioId ? (
                <Link
                  key={a.reservaId}
                  href={href(`/equipo/alumnas/${encodeURIComponent(a.socioId)}`)}
                  className="card card--tap"
                  data-testid="quien-viene"
                  style={estilo}
                >
                  {contenido}
                </Link>
              ) : (
                <div key={a.reservaId} className="card" data-testid="quien-viene" style={estilo}>{contenido}</div>
              );
            })}
          </section>
        )}

        {!online && <OfflineState cuerpo="Puedes ver la clase, pero avisar al estudio necesita conexión." />}
      </div>

      {(sePuede || listaAbierta) && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'var(--nav-total)',
            zIndex: 39, padding: '10px 16px 12px',
            background: 'linear-gradient(180deg, rgba(250,249,245,0), var(--background) 40%)',
            maxWidth: 640, margin: '0 auto',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {listaAbierta && (
            <Link href={href(`/equipo/clase/${encodeURIComponent(clase.id)}/lista`)} className="btn btn--primary btn--full tap">
              Pasar lista
            </Link>
          )}
          {sePuede && (
            <Button variant="secondary" full disabled={!online} onClick={() => { setError(null); setAbierta(true); }}>
              No puedo dar esta clase
            </Button>
          )}
        </div>
      )}

      <Sheet open={abierta} onClose={() => { if (!enviando) setAbierta(false); }} label="Avisar de que no puedes dar la clase">
        <h3 className="t-h2">¿Avisamos al estudio?</h3>
        <p className="t-meta" style={{ marginTop: 4 }}>{clase.tipo} · {cuando}</p>
        <p className="t-small" style={{ marginTop: 12, lineHeight: 1.5 }}>
          Buscamos quién la cubra. Hasta que se confirme, la clase sigue a tu nombre; si nadie puede, decide el estudio.
        </p>

        <p id="categoria-baja" className="t-label" style={{ marginTop: 14 }}>Motivo (opcional)</p>
        {/* Tres opciones fijas: así nadie tiene que escribir un diagnóstico para avisar. */}
        <div role="group" aria-labelledby="categoria-baja" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {CATEGORIAS_BAJA.map((c) => {
            const elegida = categoria === c.valor;
            return (
              <button
                key={c.valor}
                type="button"
                aria-pressed={elegida}
                disabled={enviando}
                onClick={() => setCategoria(elegida ? null : c.valor)}
                className="tap"
                style={{
                  minHeight: 44, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit',
                  fontSize: 'var(--t-small)', fontWeight: 700,
                  border: `1px solid ${elegida ? 'var(--primary)' : 'var(--border-strong)'}`,
                  background: elegida ? 'var(--primary)' : 'var(--card)',
                  color: elegida ? 'var(--primary-foreground)' : 'var(--foreground)',
                }}
              >
                {c.etiqueta}
              </button>
            );
          })}
        </div>

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
        <p className="t-meta" style={{ marginTop: 4 }}>
          No hace falta dar detalles de salud. Solo lo lee quien dirige el estudio, no recepción ni tus compañeras.
        </p>

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
