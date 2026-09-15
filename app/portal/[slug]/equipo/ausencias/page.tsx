'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio, usePortalHref } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { fechaCorta, hoyISO } from '@/lib/student/formato';
import {
  borrarAusenciaInstructora, crearAusenciaInstructora, getAusenciasInstructora,
} from '@/lib/student/datos-instructora';
import {
  TIPOS_AUSENCIA_APP, ausenciasVigentes, errorRangoAusencia, etiquetaTipoAusencia, textoAusenciaGuardada,
  type AusenciaVista, type TipoAusencia,
} from '@/lib/student/perfil-instructora';
import { Button } from '@/components/student/ui/Button';
import { Input } from '@/components/student/ui/Input';
import { ConfirmationDialog } from '@/components/student/ui/ConfirmationDialog';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// Sus ausencias (vacaciones, baja médica u otro motivo) en la app del estudio.
//
// Sustituye a «Tus ausencias» del panel (retirado con Tentare Core) y va al mismo
// núcleo en servidor que usa la gerencia: mientras está fuera, el motor de sustituciones
// no le pide que cubra clases. NO pide la baja de sus clases ya programadas (#558):
// si tiene alguna en esas fechas se le dice, y la baja la pide desde cada clase.

/** 16 px: por debajo, iOS amplía la página al enfocar y no vuelve. */
const SIN_ZOOM = { fontSize: 16 };

export default function AusenciasInstructoraPage() {
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();

  const [tipo, setTipo] = useState<TipoAusencia>('VACACIONES');
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quitar, setQuitar] = useState<AusenciaVista | null>(null);
  const [quitando, setQuitando] = useState(false);

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getAusenciasInstructora(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false);
  const vigentes = ausenciasVigentes(data ?? [], hoy);

  const guardar = async () => {
    if (guardando) return;
    const invalido = errorRangoAusencia(desde, hasta);
    if (invalido) { setError(invalido); return; }
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setGuardando(true);
    setError(null);
    const r = await crearAusenciaInstructora(estudio.slug, { tipo, desde, hasta, motivo });
    if (!r.ok) {
      setGuardando(false);
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    // Lo que se lista después es lo que dice el servidor.
    await refrescar();
    setGuardando(false);
    setMotivo('');
    toast(textoAusenciaGuardada(r.clasesAfectadas));
  };

  const confirmarQuitar = async () => {
    if (!quitar || quitando) return;
    setQuitando(true);
    const r = await borrarAusenciaInstructora(estudio.slug, quitar.id);
    if (!r.ok) {
      setQuitando(false);
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      toast(r.error);
      return;
    }
    await refrescar();
    setQuitando(false);
    setQuitar(null);
    toast('Ausencia quitada');
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Tus ausencias" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-5)', marginTop: 14, paddingBottom: 24 }}>
        <p className="t-small t-dim">
          Mientras estés fuera, el estudio no te pedirá que cubras clases. Tus clases de esas fechas siguen a tu
          nombre: si necesitas que alguien las dé, pide la baja desde cada clase.
        </p>

        <section className="card stack" style={{ ['--gap' as string]: 'var(--s-3)', padding: 'var(--s-4)' }} aria-labelledby="nueva-ausencia">
          <h2 id="nueva-ausencia" className="t-card-title">Nueva ausencia</h2>

          <div role="group" aria-label="Tipo de ausencia" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TIPOS_AUSENCIA_APP.map((t) => {
              const elegido = tipo === t.valor;
              return (
                <button
                  key={t.valor}
                  type="button"
                  aria-pressed={elegido}
                  onClick={() => setTipo(t.valor)}
                  className="tap"
                  style={{
                    minHeight: 44, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit',
                    fontSize: 'var(--t-small)', fontWeight: 700,
                    border: `1px solid ${elegido ? 'var(--primary)' : 'var(--border-strong)'}`,
                    background: elegido ? 'var(--primary)' : 'var(--card)',
                    color: elegido ? 'var(--primary-foreground)' : 'var(--foreground)',
                  }}
                >
                  {t.etiqueta}
                </button>
              );
            })}
          </div>

          {/* `minmax(0, 1fr)` y no `1fr`: con `1fr` la columna no baja del ancho
              mínimo del campo de fecha, y en un móvil «Hasta» se salía por la
              derecha y la pantalla entera se podía arrastrar de lado. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
            <Input label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={SIN_ZOOM} />
            <Input label="Hasta" type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} style={SIN_ZOOM} />
          </div>

          <Input
            label="Motivo (opcional)"
            value={motivo}
            maxLength={300}
            placeholder="Si quieres añadir contexto"
            hint="No hace falta dar detalles de salud."
            onChange={(e) => setMotivo(e.target.value)}
            style={SIN_ZOOM}
          />

          {error && (
            <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
              {error}
            </p>
          )}

          <Button full loading={guardando} disabled={!online} onClick={() => void guardar()}>
            Guardar ausencia
          </Button>
        </section>

        <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="mis-ausencias">
          <h2 id="mis-ausencias" className="t-label">Próximas y en curso</h2>
          {estado === 'loading' && <ListSkeleton n={2} h={64} />}
          {estado === 'error' && <ErrorState cuerpo="No hemos podido cargar tus ausencias." onRetry={reintentar} />}
          {estado === 'offline' && <OfflineState cuerpo="Para ver y cambiar tus ausencias necesitas conexión." />}
          {data && vigentes.length === 0 && (
            <p className="t-small t-dim">No tienes ninguna ausencia registrada.</p>
          )}
          {vigentes.map((a) => (
            <div
              key={a.id}
              className="card"
              data-testid="ausencia"
              style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="t-card-title">{etiquetaTipoAusencia(a.tipo)}</p>
                <p className="t-meta">
                  {a.desde === a.hasta ? fechaCorta(a.desde) : `${fechaCorta(a.desde)} – ${fechaCorta(a.hasta)}`}
                </p>
                {a.motivo && <p className="t-small t-dim trunc">{a.motivo}</p>}
              </div>
              <Button variant="ghost" size="sm" disabled={!online} onClick={() => setQuitar(a)}>
                Quitar
              </Button>
            </div>
          ))}
        </section>
      </div>

      <ConfirmationDialog
        open={quitar !== null}
        onClose={() => { if (!quitando) setQuitar(null); }}
        titulo="¿Quitar esta ausencia?"
        cuerpo="El estudio podrá volver a pedirte que cubras clases en esas fechas."
        confirmar="Quitar"
        tono="danger"
        loading={quitando}
        onConfirm={() => void confirmarQuitar()}
      />
    </StudentShell>
  );
}
