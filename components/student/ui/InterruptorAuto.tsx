'use client';

// El interruptor de «Auto reservable»: carril redondeado, perilla blanca y, encendido, el tick grabado a la izquierda (la
// referencia del fundador, 3-oct: el botón le gusta, el tamaño de la imagen era solo un ejemplo, así que va compacto). No es el
// `Interruptor` de las preferencias —ese es una fila entera de ajustes—: este es UN control con nombre propio dentro de una tarjeta.
//
// Tres estados, no dos: `pendiente` es «lo has pedido y tu estudio aún no ha contestado». Se pinta aparte (ámbar, con un reloj)
// porque ni está encendido ni apagado, y decir que sí sin que el estudio haya contestado es mentir.
//
// ⚠️ No decide nada y nunca se mueve por su cuenta: el estado lo pone quien lo usa, con lo que contestó el servidor. Un toque
// no lo cambia aquí; abre la confirmación que toque (nada de interruptores optimistas sobre cosas que reservan cada semana).
import { Icono } from './Icono';

export type EstadoInterruptor = 'apagado' | 'encendido' | 'pendiente';

export function InterruptorAuto({ estado, onClick, label, disabled, cargando, testId, describedBy }: {
  estado: EstadoInterruptor; onClick: () => void; label: string; disabled?: boolean; cargando?: boolean; testId?: string;
  /** El id del texto que dice en qué punto está («ya la has pedido…»): un lector de pantalla solo sabría «activado/desactivado». */
  describedBy?: string;
}) {
  const on = estado === 'encendido';
  const pendiente = estado === 'pendiente';
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label} aria-describedby={describedBy} aria-busy={cargando || undefined}
      data-testid={testId} data-estado={estado} disabled={disabled || cargando} onClick={onClick} className="tap"
      style={{
        position: 'relative', width: 52, height: 30, borderRadius: 99, border: 'none', padding: 0, flexShrink: 0,
        background: on ? 'var(--success)' : pendiente ? 'var(--warning)' : 'var(--border-strong)',
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,.18)', transition: 'background .25s', opacity: disabled || cargando ? 0.6 : 1,
      }}
    >
      {/* El tick (o el reloj) grabado en el carril, en el lado que deja libre la perilla. */}
      {(on || pendiente) && (
        <Icono
          nombre={on ? 'hecho' : 'reloj'} tamano={18} grosor={3}
          style={{ position: 'absolute', left: 5, top: 6, color: 'rgba(0,0,0,.3)' }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: 99, background: '#fff',
          boxShadow: '0 2px 6px rgba(26,26,26,.28), inset 0 -1px 2px rgba(0,0,0,.06)',
          transform: on || pendiente ? 'translateX(22px)' : 'none', transition: 'transform .25s var(--ease-spring)',
        }}
      />
    </button>
  );
}
