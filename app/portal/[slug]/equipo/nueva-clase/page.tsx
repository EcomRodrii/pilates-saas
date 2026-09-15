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
import { addDias, etiquetaDia, hoyISO } from '@/lib/student/formato';
import { crearClaseInstructora, getOpcionesNuevaClase } from '@/lib/student/datos-instructora';
import {
  MAX_DIAS_ANTELACION_NUEVA_CLASE, aforoNuevaClase, horaFinNuevaClase, resumenNuevaClase,
} from '@/lib/student/nueva-clase';
import { Button } from '@/components/student/ui/Button';
import { Input } from '@/components/student/ui/Input';
import { EmptyState, ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Nueva clase» de la instructora en la app del estudio.
//
// Lo decide el estudio (Configuración → Reservas, migr 20260914104856). La clase
// va a su nombre, suelta y sin precio; el aforo y la hora de fin salen del tipo
// de clase y la sala, y se enseñan antes de crearla. Nada optimista: solo se da
// por creada cuando el servidor lo confirma.

/** 16 px: por debajo, iOS amplía la página al enfocar y no vuelve. */
const SIN_ZOOM = { fontSize: 16 };

function Chip({ elegido, onClick, children, color }: { elegido: boolean; onClick: () => void; children: React.ReactNode; color?: string | null }) {
  return (
    <button
      type="button"
      aria-pressed={elegido}
      onClick={onClick}
      className="tap"
      style={{
        minHeight: 44, padding: '0 14px', borderRadius: 999, fontFamily: 'inherit',
        fontSize: 'var(--t-small)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8,
        border: `1px solid ${elegido ? 'var(--primary)' : 'var(--border-strong)'}`,
        background: elegido ? 'var(--primary)' : 'var(--card)',
        color: elegido ? 'var(--primary-foreground)' : 'var(--foreground)',
      }}
    >
      {color && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 99, background: color, flexShrink: 0 }} />}
      {children}
    </button>
  );
}

export default function NuevaClaseInstructoraPage() {
  const router = useRouter();
  const href = usePortalHref();
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();

  const [tipoId, setTipoId] = useState<string | null>(null);
  const [salaId, setSalaId] = useState<string | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [hora, setHora] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    () => (esInstructora ? getOpcionesNuevaClase(estudio.slug) : new Promise<never>(() => {})),
    [esInstructora, estudio.slug],
  );
  const { data, estado, reintentar } = useAsync(cargar, () => false);

  // Con una sola sala (o un solo tipo) no se pregunta: va elegida.
  const tipo = data?.tipos.find((t) => t.id === tipoId) ?? (data?.tipos.length === 1 ? data.tipos[0] : null);
  const sala = data?.salas.find((s) => s.id === salaId) ?? (data?.salas.length === 1 ? data.salas[0] : null);
  const horaFin = tipo && hora ? horaFinNuevaClase(hora, tipo.duracionMin) : null;
  const resumen = tipo && sala && hora
    ? resumenNuevaClase({ duracionMin: tipo.duracionMin, horaFin, aforo: aforoNuevaClase(tipo, sala) })
    : null;
  const completo = Boolean(tipo && sala && fecha && hora && horaFin);

  const crear = async () => {
    if (!tipo || !sala || !completo || enviando) return;
    // El estado de carga ANTES del await: que no se pueda pulsar dos veces.
    setEnviando(true);
    setError(null);
    const r = await crearClaseInstructora(estudio.slug, { tipoClaseId: tipo.id, salaId: sala.id, fecha, hora });
    if (!r.ok) {
      setEnviando(false);
      if (r.sesionCaducada) { router.push(href('/acceso/login')); return; }
      setError(r.error);
      return;
    }
    toast(`Clase creada: ${etiquetaDia(fecha, hoy)} a las ${hora}`);
    router.replace(href('/equipo/agenda'));
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader back titulo="Nueva clase" />
      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, paddingBottom: 24 }}>
        {estado === 'loading' && <ListSkeleton n={3} h={64} />}
        {estado === 'error' && <ErrorState cuerpo="No hemos podido cargar los tipos de clase y las salas." onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Para crear una clase necesitas conexión." />}

        {data && !data.puedeCrear && (
          <EmptyState
            ilustracion="calendario"
            titulo="Tu estudio asigna las clases"
            cuerpo="Si necesitas una clase nueva, pídesela al estudio."
          />
        )}

        {data?.puedeCrear && (data.tipos.length === 0 || data.salas.length === 0) && (
          <EmptyState
            ilustracion="calendario"
            titulo="Todavía no se pueden crear clases"
            cuerpo="El estudio aún no tiene tipos de clase o salas. Díselo al estudio."
          />
        )}

        {data?.puedeCrear && data.tipos.length > 0 && data.salas.length > 0 && (
          <>
            <p className="t-small t-dim">La clase irá a tu nombre. El estudio recibirá un aviso.</p>

            <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="nc-tipo">
              <h2 id="nc-tipo" className="t-label">Tipo de clase</h2>
              <div role="group" aria-labelledby="nc-tipo" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {data.tipos.map((t) => (
                  <Chip key={t.id} elegido={tipo?.id === t.id} onClick={() => setTipoId(t.id)} color={t.color}>
                    {t.nombre}
                  </Chip>
                ))}
              </div>
            </section>

            {data.salas.length > 1 && (
              <section className="stack" style={{ ['--gap' as string]: 'var(--s-2)' }} aria-labelledby="nc-sala">
                <h2 id="nc-sala" className="t-label">Sala</h2>
                <div role="group" aria-labelledby="nc-sala" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {data.salas.map((s) => (
                    <Chip key={s.id} elegido={sala?.id === s.id} onClick={() => setSalaId(s.id)}>{s.nombre}</Chip>
                  ))}
                </div>
              </section>
            )}

            {/* `minmax(0, 1fr)`: con `1fr` el campo de fecha no deja encoger la
                columna y en un móvil se sale por la derecha. */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12 }}>
              <Input
                label="Día" type="date" value={fecha} min={hoy} max={addDias(hoy, MAX_DIAS_ANTELACION_NUEVA_CLASE)}
                onChange={(e) => setFecha(e.target.value)} style={SIN_ZOOM}
              />
              <Input label="Hora" type="time" value={hora} step={300} onChange={(e) => setHora(e.target.value)} style={SIN_ZOOM} />
            </div>

            {resumen && (
              <div className="card" data-testid="resumen-nueva-clase" style={{ padding: '12px 14px' }}>
                <p className="t-small" style={{ fontWeight: 700 }}>{resumen}</p>
                {sala && data.salas.length === 1 && <p className="t-meta" style={{ marginTop: 2 }}>{sala.nombre}</p>}
              </div>
            )}

            {error && (
              <p role="alert" style={{ margin: 0, background: 'var(--destructive-soft)', color: 'var(--destructive-foreground)', borderRadius: 12, padding: '10px 13px', fontSize: 'var(--t-small)', fontWeight: 700 }}>
                {error}
              </p>
            )}

            <Button full loading={enviando} disabled={!completo || !online} onClick={() => void crear()}>
              Crear clase
            </Button>
          </>
        )}
      </div>
    </StudentShell>
  );
}
