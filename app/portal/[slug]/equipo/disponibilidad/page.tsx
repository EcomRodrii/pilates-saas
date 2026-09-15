'use client';

import { useCallback, useEffect, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useEstudio } from '@/components/student/contexto';
import { useSesionInstructora } from '@/lib/student/sesion-instructora';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useToast } from '@/components/student/ui/Toast';
import { addDias, hoyISO } from '@/lib/student/formato';
import {
  getAgendaInstructora, getDisponibilidadInstructora, guardarDisponibilidadInstructora,
} from '@/lib/student/datos-instructora';
import { clasesLocalesDesdeAgenda } from '@/lib/student/agenda-instructora';
import { DIAS, FRANJAS, celdaKey } from '@/lib/sustituciones/franjas';
import { celdasDesdeClases } from '@/lib/sustituciones/disponibilidad-desde-clases';
import { Button } from '@/components/student/ui/Button';
import { Icono } from '@/components/student/ui/Icono';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';

// «Tu disponibilidad»: cuándo puede cubrir una clase.
//
// Sin franjas marcadas, `rankear_candidatas` no la propone NUNCA como sustituta:
// es lo que hace que el motor de sustituciones funcione. La rejilla es la misma
// del panel (días × cuatro franjas, `lib/sustituciones/franjas.ts`), pintada con
// el kit de la app; «Rellenar con mis clases» usa `celdasDesdeClases`, la misma
// regla que el panel.
//
// Solo se da por guardado lo que el servidor confirma. Hasta entonces, la barra
// dice que hay cambios sin guardar.

const SEMANAS_CLASES = 4;

function mismas(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export default function DisponibilidadInstructoraPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const { instructora } = useSesionInstructora(estudio.slug, true, true);
  const esInstructora = Boolean(instructora);
  const hoy = hoyISO();
  const hasta = addDias(hoy, SEMANAS_CLASES * 7 - 1);

  const cargar = useCallback(async () => {
    // Monta antes que su guardia (es su padre): sin confirmar, no se pide nada.
    if (!esInstructora) return new Promise<never>(() => {});
    const [celdas, agenda] = await Promise.all([
      getDisponibilidadInstructora(estudio.slug),
      getAgendaInstructora(estudio.slug, hoy, hasta),
    ]);
    return { celdas, desdeClases: [...celdasDesdeClases(clasesLocalesDesdeAgenda(agenda.clases))] };
  }, [esInstructora, estudio.slug, hoy, hasta]);

  const { data, estado, reintentar, refrescar } = useAsync(cargar, () => false);

  // `null` = lo que hay guardado. En cuanto toca algo, su copia.
  const [editadas, setEditadas] = useState<Set<string> | null>(null);
  const [guardando, setGuardando] = useState(false);
  const guardadas = new Set(data?.celdas ?? []);
  const actuales = editadas ?? guardadas;
  const hayCambios = editadas !== null && !mismas(editadas, guardadas);

  // Salir con cambios sin guardar avisa: perderlos sin enterarse es lo peor.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [hayCambios]);

  const alternar = (clave: string) => {
    const s = new Set(actuales);
    if (s.has(clave)) s.delete(clave); else s.add(clave);
    setEditadas(s);
  };

  const rellenar = () => {
    const s = new Set(actuales);
    for (const c of data?.desdeClases ?? []) s.add(c);
    setEditadas(s);
  };

  const guardar = async () => {
    if (!editadas || guardando) return;
    setGuardando(true);
    const r = await guardarDisponibilidadInstructora(estudio.slug, [...editadas]);
    if (!r.ok) {
      setGuardando(false);
      // Sus cambios se quedan en pantalla: puede reintentar sin volver a marcar.
      toast(r.error);
      return;
    }
    await refrescar();
    setEditadas(null);
    setGuardando(false);
    toast('Disponibilidad guardada');
  };

  return (
    <StudentShell modo="instructora">
      <PageHeader titulo="Tu disponibilidad" sub="Cuándo puedes cubrir una clase" back />

      <div className="px stack" style={{ ['--gap' as string]: 'var(--s-4)', marginTop: 14, paddingBottom: hayCambios ? 90 : 0 }}>
        {estado === 'loading' && <ListSkeleton n={4} h={52} />}
        {estado === 'error' && (
          <ErrorState cuerpo="No hemos podido cargar tu disponibilidad." onRetry={reintentar} />
        )}
        {estado === 'offline' && <OfflineState cuerpo="Para ver y cambiar tu disponibilidad necesitas conexión." />}

        {data && (
          <>
            <p className="t-small t-dim" style={{ lineHeight: 1.5 }}>
              Marca las franjas en las que podrías cubrir a una compañera. Si no marcas ninguna, el
              estudio no puede proponerte como sustituta.
            </p>

            {data.desdeClases.length > 0 && (
              <Button variant="secondary" full onClick={rellenar} data-testid="rellenar-con-clases">
                Rellenar con mis clases
              </Button>
            )}

            <div
              role="group"
              aria-label="Disponibilidad por día y franja"
              style={{ display: 'grid', gridTemplateColumns: `minmax(72px, auto) repeat(${FRANJAS.length}, minmax(0, 1fr))`, gap: 6, alignItems: 'center' }}
            >
              <span />
              {FRANJAS.map((f) => (
                <span key={f.key} className="t-micro" style={{ textAlign: 'center', fontWeight: 800, color: 'var(--muted-foreground)', lineHeight: 1.2 }}>
                  {f.label}
                </span>
              ))}
              {DIAS.map((d) => (
                <FilaDia key={d.dow} etiqueta={d.label}>
                  {FRANJAS.map((f) => {
                    const clave = celdaKey(d.dow, f.key);
                    const on = actuales.has(clave);
                    return (
                      <button
                        key={clave}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${d.label}, ${f.label}`}
                        data-celda={clave}
                        onClick={() => alternar(clave)}
                        className="tap"
                        style={{
                          minHeight: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: on ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                          background: on ? 'var(--accent-soft)' : 'var(--card)',
                          color: on ? 'var(--accent)' : 'var(--subtle-foreground)',
                        }}
                      >
                        {on && <Icono nombre="hecho" tamano={18} />}
                      </button>
                    );
                  })}
                </FilaDia>
              ))}
            </div>

            <p className="t-meta" style={{ lineHeight: 1.5 }}>
              {FRANJAS.map((f) => `${f.label}: ${f.horaInicio}–${f.horaFin === '23:59' ? 'cierre' : f.horaFin}`).join(' · ')}
            </p>
          </>
        )}
      </div>

      {hayCambios && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'var(--nav-total)',
            zIndex: 39, padding: '10px 16px 12px',
            background: 'linear-gradient(180deg, rgba(250,249,245,0), var(--background) 40%)',
            maxWidth: 640, margin: '0 auto',
          }}
        >
          <Button full loading={guardando} disabled={!online} onClick={() => void guardar()} style={{ height: 50, fontSize: 'var(--t-body)' }}>
            Guardar disponibilidad
          </Button>
          <p className="t-meta" style={{ marginTop: 6, textAlign: 'center' }}>
            {online ? 'Tienes cambios sin guardar' : 'Sin conexión: guárdalo cuando vuelvas a tener cobertura'}
          </p>
        </div>
      )}
    </StudentShell>
  );
}

/** El nombre del día y sus cuatro celdas, dentro de la misma rejilla. */
function FilaDia({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <>
      <span className="t-small" style={{ fontWeight: 700 }}>{etiqueta}</span>
      {children}
    </>
  );
}
