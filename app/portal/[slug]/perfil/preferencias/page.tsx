'use client';

import { useCallback, useState } from 'react';
import { StudentShell } from '@/components/student/shell/StudentShell';
import { PageHeader } from '@/components/student/shell/PageHeader';
import { useAsync } from '@/lib/student/useAsync';
import { useOnline } from '@/lib/student/useOnline';
import { useEstudio } from '@/components/student/contexto';
import { useToast } from '@/components/student/ui/Toast';
import { getPreferencias, guardarPreferencia, type PreferenciaCategoria } from '@/lib/student/perfil-y-avisos';
import { ErrorState, ListSkeleton, OfflineState } from '@/components/student/ui/States';
import { activarPushStudent, contextoPushStudent, desactivarPushStudent } from '@/lib/student/push';
import { estadoPush, textoPush, type EstadoPush } from '@/lib/student/push-estado';

// Preferencias de aviso (§A.19).
//
// ⚠️ DESIGN CONFLICT · el paquete inventa cuatro interruptores («Recordatorio de
// clase», «Plaza liberada», «Novedades del estudio», «Recibos por email») que no
// existen en el backend. Lo que hay es un modelo de CATEGORÍA × CANAL: las
// categorías de una socia son `reservas`, `clases`, `pagos` y `marketing`
// (`CATEGORIAS_POR_ROL.SOCIA`), y los canales in-app, push, email, WhatsApp y
// SMS.
//
// Se respeta el TONO del diseño —hablarle a una alumna de «categoría reservas»
// no ayuda a nadie— pero cada fila gobierna su categoría real y su texto
// describe lo que esa categoría contiene de verdad. Inventar interruptores
// habría producido una pantalla que guarda preferencias que el motor no lee;
// heredar los nombres del diseño sin mirar el catálogo produjo algo peor: una
// pantalla que apagaba lo contrario de lo que prometía (ver FILAS).
//
// Ausencia de fila = encendido: es el valor por defecto del propio endpoint.

// ⚠️ Estas etiquetas describen lo que hay HOY en cada categoría del catálogo
// (`lib/notifications/catalog.ts`) y TIENEN QUE SEGUIRLO: el interruptor gobierna
// la categoría entera, no el evento que da nombre a la fila. Antes decían lo
// contrario de lo que hacían —«Recordatorio de clase» estaba puesto sobre
// `clases`, que es donde viven CLASE_CANCELADA/CLASE_MODIFICADA/CLASE_SUSTITUTA,
// mientras que RECORDATORIO_24H y RECORDATORIO_1H son `reservas`—, así que
// apagar los recordatorios silenciaba el aviso de que te habían cancelado la
// clase y no apagaba ningún recordatorio. Si algún día se mueve un evento de
// categoría, lo que hay que reescribir es esta tabla, no la categoría del evento.
const FILAS: Array<{ categoria: string; label: string; sub?: string }> = [
  { categoria: 'reservas', label: 'Tus reservas', sub: 'Recordatorio de tus clases, plaza liberada, cambios en tus reservas y la petición de valorar la clase tras asistir' },
  { categoria: 'clases', label: 'Cambios en las clases', sub: 'Si se cancela, se modifica o la da otra profesora' },
  { categoria: 'pagos', label: 'Bonos y pagos', sub: 'Bono a punto de caducar o agotado, cobros' },
  { categoria: 'marketing', label: 'Novedades del estudio' },
];

function Toggle({ on, onChange, label, sub, disabled }: {
  on: boolean; onChange: (v: boolean) => void; label: string; sub?: string; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 15px', minHeight: 56, borderBottom: '1px solid var(--muted)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <span>
        <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{label}</span>
        {sub && <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{sub}</span>}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
        onClick={() => onChange(!on)}
        // El interruptor mide 44×26: se toca a menudo y el fallo cae en la
        // fila de al lado, que cambia OTRA preferencia.
        className="tap"
        style={{ position: 'relative', width: 44, height: 26, borderRadius: 99, border: 'none', background: on ? 'var(--success)' : 'var(--border-strong)', transition: 'background .25s', flexShrink: 0 }}
      >
        <span aria-hidden style={{ position: 'absolute', top: 3, left: 3, width: 20, height: 20, borderRadius: 99, background: '#fff', boxShadow: '0 2px 6px rgba(26,26,26,.25)', transform: on ? 'translateX(18px)' : 'none', transition: 'transform .25s var(--ease-spring)' }} />
      </button>
    </label>
  );
}

export default function PreferenciasPage() {
  const { estudio } = useEstudio();
  const { online } = useOnline();
  const { toast } = useToast();
  const [local, setLocal] = useState<Record<string, { push: boolean; email: boolean }>>({});
  // Estado de push de ESTE dispositivo. Es del navegador, no del servidor:
  // permiso + suscripción del SW acotado a la app. `null` hasta leerlo.
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [ocupadoPush, setOcupadoPush] = useState(false);

  const cargar = useCallback(async () => {
    const prefs = await getPreferencias();
    const mapa: Record<string, { push: boolean; email: boolean }> = {};
    for (const f of FILAS) {
      const p = prefs.find((x: PreferenciaCategoria) => x.category === f.categoria);
      // Sin fila, encendido: es el defecto del endpoint, no una suposición.
      mapa[f.categoria] = { push: p ? p.push : true, email: p ? p.email : false };
    }
    setLocal(mapa);
    setPush(estadoPush(await contextoPushStudent(estudio.slug)));
    return mapa;
  }, [estudio.slug]);

  const { estado, reintentar } = useAsync(cargar, () => false);

  const cambiar = async (categoria: string, campo: 'push' | 'email', valor: boolean) => {
    const antes = local[categoria];
    // Optimista en la UI —un interruptor tiene que responder al instante— pero
    // se REVIERTE si el servidor dice que no. Dejarlo cambiado sería enseñarle
    // una preferencia que el motor no tiene.
    setLocal((s) => ({ ...s, [categoria]: { ...s[categoria], [campo]: valor } }));
    const ok = await guardarPreferencia({ studioId: estudio.id, category: categoria, [campo]: valor });
    if (!ok) {
      setLocal((s) => ({ ...s, [categoria]: antes }));
      toast('No hemos podido guardar ese cambio.');
    }
  };

  // Los interruptores por categoría de arriba no sirven de nada si este
  // dispositivo no está suscrito: esta es la tarjeta que lo suscribe. Se
  // relee el estado real del navegador después de cada acción en vez de
  // suponer el resultado.
  const alternarPush = async () => {
    if (push === null || ocupadoPush) return;
    const accion = textoPush(push).accion;
    if (!accion) return;
    setOcupadoPush(true);
    try {
      if (accion === 'activar') {
        const r = await activarPushStudent(estudio.id, estudio.slug);
        if (!r.ok && r.motivo !== 'denied') toast('No hemos podido activar los avisos en este dispositivo.');
      } else {
        const ok = await desactivarPushStudent(estudio.slug);
        if (!ok) toast('No hemos podido desactivar los avisos en este dispositivo.');
      }
      setPush(estadoPush(await contextoPushStudent(estudio.slug)));
    } finally {
      setOcupadoPush(false);
    }
  };

  const dispositivo = push === null ? null : textoPush(push);

  return (
    <StudentShell>
      <PageHeader titulo="Preferencias" back />
      <div className="px" style={{ marginTop: 14, maxWidth: 520 }}>
        {estado === 'loading' && <ListSkeleton n={2} h={120} />}
        {estado === 'error' && <ErrorState onRetry={reintentar} />}
        {estado === 'offline' && <OfflineState cuerpo="Necesitas conexión para cambiar tus avisos." />}

        {estado === 'ready' && (
          <>
            {dispositivo && (
              <>
                <p className="t-label" style={{ margin: '0 0 7px' }}>Este dispositivo</p>
                <div className="card" style={{ overflow: 'hidden' }} data-testid="push-dispositivo" data-estado={push ?? undefined}>
                  {dispositivo.accion ? (
                    <Toggle
                      label={dispositivo.titulo}
                      sub={dispositivo.cuerpo}
                      on={dispositivo.encendido}
                      disabled={!online || ocupadoPush}
                      onChange={() => void alternarPush()}
                    />
                  ) : (
                    <div style={{ padding: '13px 15px', minHeight: 56 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{dispositivo.titulo}</span>
                      <span className="t-meta" style={{ display: 'block', marginTop: 1 }}>{dispositivo.cuerpo}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            <p className="t-label" style={{ margin: '16px 0 7px' }}>Avisos en el móvil</p>
            <div className="card" style={{ overflow: 'hidden' }}>
              {FILAS.map((f) => (
                <Toggle
                  key={f.categoria}
                  label={f.label}
                  sub={f.sub}
                  on={local[f.categoria]?.push ?? true}
                  disabled={!online}
                  onChange={(v) => void cambiar(f.categoria, 'push', v)}
                />
              ))}
            </div>

            <p className="t-label" style={{ margin: '16px 0 7px' }}>Email</p>
            <div className="card" style={{ overflow: 'hidden' }}>
              <Toggle
                label="Recibos y confirmaciones por email"
                on={local.pagos?.email ?? false}
                disabled={!online}
                onChange={(v) => void cambiar('pagos', 'email', v)}
              />
            </div>

            <p className="t-meta" style={{ margin: '14px 0 0', fontSize: 11, lineHeight: 1.5 }}>
              Los avisos de seguridad y los que afectan a tus reservas ya hechas se envían siempre.
            </p>
          </>
        )}
      </div>
    </StudentShell>
  );
}
