'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { getGamificacion, apuntarseReto, canjearRecompensa } from '@/lib/student/gamificacion-datos';
import { useCreditosEnVivoPortal } from '@/lib/student/use-creditos-portal';
import { nombreCreditos } from '@/lib/creditos-nombre';
import { fechaCorta } from '@/lib/student/formato';
import { Button } from '@/components/student/ui/Button';
import { Badge } from '@/components/student/ui/Badge';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Logros y recompensas (§ gamificación).
//
// El estudio ya podía configurar créditos por acción, logros, niveles y retos
// en su panel, y el servidor los evalúa de verdad en cada reserva y cancelación
// (`evaluarGamificacionServidor`), pero la alumna no veía NADA: la
// configuración no servía para nada. Esta pantalla solo PINTA lo que el payload
// ya trae; el progreso, el saldo y el canje los decide el servidor.
//
// Si el estudio no ha configurado nada, la pantalla lo dice y no inventa un
// tablero vacío con cifras a cero.

/** La barra del sistema (`.bar`). Era la TERCERA reimplementación del mismo
 *  dibujo en la app; ahora solo pone el porcentaje y el tono. */
function Barra({ pct, tono = 'accent' }: { pct: number; tono?: 'accent' | 'ok' }) {
  return (
    <div
      aria-hidden
      className={'bar' + (tono === 'ok' ? ' bar--ok' : '')}
      style={{ ['--pct' as string]: `${Math.round(pct * 100)}%`, marginTop: 'var(--s-2)' }}
    >
      <i />
    </div>
  );
}

export default function LogrosPage() {
  const { estudio } = useEstudio();
  // Cómo llama ESTE estudio a su moneda. Sin esto la pantalla decía «créditos»
  // aunque el estudio los llamara «puntos» en todo lo demás.
  const moneda = nombreCreditos(estudio.creditosNombre);
  const { online } = useOnline();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(() => getGamificacion(estudio.slug), [estudio.slug]);
  const { data, estado, reintentar, refrescar } = useAsync(cargar, (d) => !d.hay);

  // El saldo cambia por cosas que ella no hace: el mostrador le da el check-in
  // y gana créditos con la clase recién terminada. Sin esto, su pantalla
  // abierta seguiría diciendo el saldo de antes hasta recargar a mano.
  useCreditosEnVivoPortal(estudio.slug, estudio.id, refrescar);

  const alternarReto = async (retoId: string, apuntada: boolean) => {
    if (ocupado) return;
    setOcupado(retoId);
    const ok = await apuntarseReto(estudio.slug, estudio.id, retoId, !apuntada);
    setOcupado(null);
    if (!ok) { toast('No hemos podido guardar el cambio.'); return; }
    toast(!apuntada ? '¡Apuntada al reto!' : 'Te has borrado del reto');
    await refrescar();
  };

  const canjear = async (id: string, esClaseGratis: boolean, nombre: string) => {
    if (ocupado) return;
    setOcupado(id);
    const r = await canjearRecompensa(estudio.slug, estudio.id, id);
    setOcupado(null);
    if (!r.ok) { toast(r.error); return; }
    // ⚠️ El aviso NO es el resultado del canje, es solo el acuse. El resultado
    // vive abajo, en «Tus canjes», y sigue ahí mañana. Cuando esto era solo un
    // toast, el fundador canjeó una botella, no vio nada al desvanecerse, y
    // volvió a pulsar: dos canjes, diez créditos, una botella.
    //
    // Una clase gratis ya está en su cuenta: mandarla a esperar un aviso sería
    // falso, y encima retrasaría que la use.
    toast(esClaseGratis
      ? `¡Hecho! Ya tienes tu clase de ${nombre}. Resérvala cuando quieras.`
      : r.codigo
        ? `Canjeada: ${nombre}. Tu código es ${r.codigo}`
        : `Has canjeado: ${nombre}. El estudio te avisará.`);
    await refrescar();
  };

  return (
    <StudentShell>
      <PageHeader titulo="Logros y recompensas" back />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, maxWidth: 560, paddingBottom: 90 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={110} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para ver tus logros." />}
        {estado === 'empty' && (
          <EmptyState
            icono="🏆"
            titulo="Tu estudio aún no ha configurado esto"
            cuerpo="Cuando active logros, niveles o recompensas, los verás aquí."
          />
        )}

        {estado === 'ready' && data && (
          <>
            {/* ── NIVEL Y CRÉDITOS ─────────────────────────────────────────
                El nivel sale del total GANADO, no del saldo: canjear nunca
                hace bajar de nivel (misma regla que enuncia el panel). */}
            <section className="card card--pad-lg" data-testid="nivel">
              <div className="row row--top row--between" style={{ ['--gap' as string]: 'var(--s-3)' }}>
                <div style={{ minWidth: 0 }}>
                  <p className="t-label">Tu nivel</p>
                  <p className="t-title" style={{ marginTop: 'var(--s-1)' }}>
                    {data.nivel.actual ? `${data.nivel.actual.icono} ${data.nivel.actual.nombre}` : 'Aún sin nivel'}
                  </p>
                  {data.nivel.actual?.beneficios && (
                    <p className="t-meta" style={{ marginTop: 2 }}>{data.nivel.actual.beneficios}</p>
                  )}
                </div>
                <div className="no-shrink" style={{ textAlign: 'right' }}>
                  <p className="t-label">Créditos</p>
                  <p className="t-title t-num" style={{ marginTop: 'var(--s-1)' }}>{data.saldo}</p>
                </div>
              </div>
              {data.nivel.siguiente && (
                <>
                  <Barra pct={data.nivel.progreso} />
                  <p className="t-meta" style={{ marginTop: 'var(--s-1)' }}>
                    Te faltan {data.nivel.faltan} {moneda} para {data.nivel.siguiente.nombre}
                  </p>
                </>
              )}
            </section>

            {/* ── RETOS ────────────────────────────────────────────────────
                Solo los vigentes: uno terminado no se puede ganar. */}
            {data.retos.length > 0 && (
              <section data-testid="retos">
                <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>Retos de ahora</p>
                <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                  {data.retos.map((r) => (
                    <div key={r.id} className="card card--pad">
                      <div className="row row--top row--between" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="t-card-title">{r.icono} {r.nombre}</p>
                          {r.descripcion && <p className="t-meta" style={{ marginTop: 2 }}>{r.descripcion}</p>}
                        </div>
                        {r.completado
                          ? <Badge tone="ok">Conseguido</Badge>
                          : <Badge tone={r.diasRestantes <= 3 ? 'few' : 'neutral'}>{r.diasRestantes === 0 ? 'Último día' : `${r.diasRestantes} días`}</Badge>}
                      </div>
                      <Barra pct={r.objetivo > 0 ? r.progresoActual / r.objetivo : 0} tono={r.completado ? 'ok' : 'accent'} />
                      <div className="row row--between" style={{ ['--gap' as string]: 'var(--s-2)', marginTop: 'var(--s-2)' }}>
                        <p className="t-meta">
                          {r.progresoActual} de {r.objetivo} · {r.creditosRecompensa} {moneda}
                        </p>
                        {!r.completado && (
                          <Button size="sm" variant={r.apuntada ? 'secondary' : 'primary'} disabled={!online || ocupado === r.id}
                            aria-pressed={r.apuntada} onClick={() => void alternarReto(r.id, r.apuntada)}>
                            {r.apuntada ? 'Ya no participo' : 'Me apunto'}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── LOGROS ───────────────────────────────────────────────── */}
            {data.logros.length > 0 && (
              <section data-testid="logros">
                <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>Tus logros</p>
                <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                  {data.logros.map((l) => (
                    <div key={l.id} className="card card--pad" style={{ opacity: l.completado ? 1 : 0.92 }}>
                      <div className="row row--top row--between" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="t-card-title">{l.icono} {l.nombre}</p>
                          {l.descripcion && <p className="t-meta" style={{ marginTop: 2 }}>{l.descripcion}</p>}
                        </div>
                        {l.completado && <Badge tone="ok">✓</Badge>}
                      </div>
                      {!l.completado && (
                        <>
                          <Barra pct={l.umbral > 0 ? l.progresoActual / l.umbral : 0} />
                          <p className="t-meta" style={{ marginTop: 'var(--s-1)' }}>
                            {l.progresoActual} de {l.umbral} · {l.creditosRecompensa} {moneda}
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── RECOMPENSAS ──────────────────────────────────────────────
                Se canjea contra el servidor, que descuenta el saldo de forma
                atómica: si no llega, lo dice él, no una comprobación de aquí. */}
            {data.recompensas.length > 0 && (
              <section data-testid="recompensas">
                <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>Canjea tus {moneda}</p>
                {/* El aviso va aquí, pegado a lo que se puede hacer con ellos:
                    decirle que caducan sin enseñarle en qué gastarlos es darle
                    una mala noticia y ninguna salida. Solo aparece cuando queda
                    menos de un mes (ver DIAS_AVISO_CADUCIDAD). */}
                {data.diasParaCaducar != null && (
                  <p className="t-meta" style={{ marginBottom: 'var(--s-2)', color: 'var(--accent)' }}>
                    {data.diasParaCaducar === 0
                      ? `Tus ${moneda} caducan hoy`
                      : data.diasParaCaducar === 1
                        ? `Tus ${moneda} caducan mañana`
                        : `Tus ${moneda} caducan en ${data.diasParaCaducar} días`}
                  </p>
                )}
                <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                  {data.recompensas.map((p) => (
                    <div key={p.id} className="card card--pad row row--between" style={{ ['--gap' as string]: 'var(--s-3)' }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="t-card-title">{p.icono} {p.nombre}</p>
                        <p className="t-meta" style={{ marginTop: 2 }}>
                          {p.costeCreditos} {moneda}
                          {/* El orden importa: primero por qué NO puede
                              canjearla, y solo al final cuánto le falta. Decir
                              «te faltan 20» de algo agotado o que ya se ha
                              llevado la manda a ahorrar para nada. */}
                          {p.limiteAlcanzado ? ' · ya la has canjeado'
                            : p.agotada ? ' · agotada'
                              : p.aunNoDisponible ? ` · desde el ${fechaCorta(p.disponibleDesde!)}`
                                : p.alcanzable ? '' : ` · te faltan ${p.faltan}`}
                        </p>
                        {/* La fecha de fin solo cuando la hay: mete prisa de
                            verdad, y callarla haría que se le pasara. */}
                        {p.disponibleHasta && !p.limiteAlcanzado && (
                          <p className="t-meta" style={{ marginTop: 2, color: 'var(--accent)' }}>
                            Hasta el {fechaCorta(p.disponibleHasta)}
                          </p>
                        )}
                        {/* Lo que recibe cambia según el efecto, y con ello lo
                            que tiene que hacer después. Una clase gratis le
                            llega sola y la reserva cuando quiera; el resto se
                            lo dan en el estudio. Decirlo aquí evita que espere
                            en casa un aviso que no va a llegar, o que vaya al
                            mostrador a por algo que ya tiene. */}
                        <p className="t-meta" style={{ marginTop: 2, opacity: .75 }}>
                          {p.efecto === 'CLASE_GRATIS'
                            ? 'Te la damos al momento: reserva con ella cuando quieras'
                            : 'Te la entregan en el estudio'}
                        </p>
                      </div>
                      <Button size="sm" disabled={!p.alcanzable || !online || ocupado === p.id}
                        onClick={() => void canjear(p.id, p.efecto === 'CLASE_GRATIS', p.nombre)}>
                        {ocupado === p.id ? 'Canjeando…' : p.limiteAlcanzado ? 'Canjeada' : 'Canjear'}
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ── TUS CANJES ───────────────────────────────────────────────
                La mitad que faltaba. Arriba está lo que PUEDE canjear; esto es
                lo que ya canjeó, con su código y su estado, y sigue aquí al
                volver mañana. Sin esta sección, después de pulsar no quedaba
                nada: el aviso se iba y la pantalla se veía igual que antes. */}
            {data.canjes.length > 0 && (
              <section data-testid="mis-canjes">
                <p className="t-label" style={{ marginBottom: 'var(--s-2)' }}>Tus canjes</p>
                <div className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }}>
                  {data.canjes.map((c) => (
                    <div key={c.id} className="card card--pad" data-testid="canje">
                      <div className="row row--between" style={{ ['--gap' as string]: 'var(--s-3)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p className="t-card-title">{c.recompensa}</p>
                          <p className="t-meta" style={{ marginTop: 2 }}>
                            {c.creditos} {moneda}{c.fecha ? ` · ${fechaCorta(c.fecha)}` : ''}
                          </p>
                        </div>
                        {/* El estado con palabras, no solo con color: «pendiente»
                            tiene que entenderse sin saber qué significa el
                            punto amarillo. */}
                        <span className="t-meta" style={{ whiteSpace: 'nowrap', opacity: .85 }}>
                          {c.estado === 'ENTREGADO' ? '✓ Entregada'
                            : c.estado === 'CANCELADO' ? 'Cancelada'
                              : '· Pendiente'}
                        </span>
                      </div>
                      {/* El código solo mientras sirve de algo. En una entregada
                          ya no abre nada, y en una cancelada nunca lo hizo:
                          dejarlo puesto invita a ir al estudio con él. */}
                      {c.codigo && c.estado === 'PENDIENTE' && (
                        <div style={{ marginTop: 'var(--s-2)' }}>
                          <p className="t-meta" style={{ marginBottom: 2 }}>Enséñalo en el estudio</p>
                          <p className="t-code" style={{ fontSize: 18, letterSpacing: '0.06em', fontWeight: 800 }}>
                            {c.codigo}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </StudentShell>
  );
}
