import type { BookingState } from '@/lib/student/tipos';
import { COPY } from '@/lib/student/maquina-reserva';
import { seArreglaComprando } from '@/lib/bono-logic';
/**
 * Resultado de reserva devuelto por el servidor. Solo 'confirmed' muestra la celebración.
 *
 * `mensaje` es el motivo CONCRETO que dio el servidor, cuando lo hay. Manda
 * sobre el copy genérico del estado: la máquina del diseño no tiene un estado
 * para «no tienes bono» ni para «has llegado a tu tope de reservas», así que
 * ambos caen en `error` — y sin este texto la alumna leía «algo no ha salido
 * como esperábamos, inténtalo de nuevo» y reintentaba contra el mismo muro.
 */
export function BookingStatus({ state, mensaje, onRetry, onWaitlist, onClose, onComprar }: { state: Exclude<BookingState, 'idle' | 'reviewing' | 'submitting'>; mensaje?: string; onRetry?: () => void; onWaitlist?: () => void; onClose?: () => void; onComprar?: () => void }) {
  const c = COPY[state];
  const ok = state === 'confirmed';
  // Hay rechazos que NO se arreglan reintentando: «necesitas un plan o bono
  // activo» y «tu bono no incluye este tipo de clase» seguirán igual mil veces.
  // Con el catálogo a un toque, ofrecer «Intentar de nuevo» era mandar a la
  // alumna contra el mismo muro en el momento en que más ganas tiene de
  // resolverlo. La regla es la MISMA que aplica el servidor (lib/bono-logic.ts).
  const compraLoArregla = state === 'error' && !!mensaje && !!onComprar && seArreglaComprando(mensaje);
  const col = c.tono === 'ok' ? 'var(--success)' : c.tono === 'warn' ? 'var(--warning)' : 'var(--destructive)';
  return (
    <div role="status" aria-live="assertive" style={{ position: 'relative', textAlign: 'center', padding: '10px 0 4px', overflow: 'hidden' }}>
      {ok && ['A', 'B', 'C', 'B', 'A', 'C'].map((k, i) => <span key={i} aria-hidden style={{ position: 'absolute', left: (28 + i * 9) + '%', top: '30%', width: i % 2 ? 8 : 7, height: i % 2 ? 8 : 11, borderRadius: i % 2 ? 99 : 2, background: ['var(--success)', '#C99A3C', '#C2503A', '#1A1A1A'][i % 4], animation: 'apConf' + k + ' .95s ' + (i * .05) + 's ease-out both' }} />)}
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto' }}>
        {ok && <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 999, border: '2.5px solid var(--success)', animation: 'apRing .9s ease-out both' }} />}
        <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: 999, background: col, color: '#fff', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'apCheck .55s var(--ease-spring) both' }}>{c.tono === 'ok' ? '✓' : c.tono === 'warn' ? '!' : '×'}</span>
      </div>
      <h3 className="t-h2" style={{ fontSize: 20, marginTop: 15, letterSpacing: '-.025em', animation: 'apUp .4s .15s both' }}>{c.titulo}</h3>
      <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted-foreground)', lineHeight: 1.5, animation: 'apUp .4s .22s both' }}>{mensaje ?? c.cuerpo}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16, animation: 'apUp .4s .3s both' }}>
        {state === 'full' && onWaitlist && <button type="button" className="btn btn--primary btn--full" style={{ height: 48, fontSize: 13.5 }} onClick={onWaitlist}>Unirme a la lista de espera</button>}
        {compraLoArregla && <button type="button" className="btn btn--primary btn--full" style={{ height: 48, fontSize: 13.5 }} onClick={onComprar}>Ver bonos y suscripciones</button>}
        {!compraLoArregla && (state === 'error' || state === 'offline') && onRetry && <button type="button" className="btn btn--primary btn--full" style={{ height: 48, fontSize: 13.5 }} onClick={onRetry}>Intentar de nuevo</button>}
        {onClose && <button type="button" className={'btn btn--full ' + (ok ? 'btn--primary' : 'btn--ghost')} style={{ height: 48, fontSize: 13.5 }} onClick={onClose}>{ok ? 'Ver mis reservas' : state === 'session-expired' ? 'Iniciar sesión' : 'Volver al horario'}</button>}
      </div>
    </div>
  );
}
