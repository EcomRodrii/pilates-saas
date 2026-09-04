'use client';

import Link from 'next/link';
import type { Clase, Instructora, Reserva } from '@/lib/student/tipos';
import { Sheet } from '@/components/student/ui/Sheet';
import { AvailabilityBadge } from '@/components/student/ui/Badge';
import { disponibilidad } from '@/lib/student/maquina-reserva';
import { etiquetaDia, hoyISO } from '@/lib/student/formato';
import { notaTexto, proximasClasesDe } from '@/lib/student/instructora';

/** HH:mm local, el mismo reloj que usa `hoyISO()`. */
function horaAhora(d = new Date()): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// La ficha de la instructora, desde la píldora de la hoja de clase. Antes esa
// píldora era un <button> sin onClick: un control muerto. Todo lo que enseña
// ya viajaba en el payload (foto, bio, nota con ≥5 votos, horario): cero
// peticiones nuevas.
export function InstructoraSheet({ instructora, clases, reservas, soportaEspera, open, onClose, href }: {
  instructora: Instructora | null; clases: Clase[]; reservas: Reserva[]; soportaEspera: boolean;
  open: boolean; onClose: () => void; href: (p: string) => string;
}) {
  const i = instructora;
  const proximas = i ? proximasClasesDe(clases, i.id, hoyISO(), horaAhora()) : [];
  const nota = i ? notaTexto(i.rating, i.valoraciones) : null;
  return (
    <Sheet open={open && !!i} onClose={onClose} label={i ? `Instructora ${i.nombre}` : 'Instructora'}>
      {i && (
        <div data-testid="instructora-sheet" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden style={{ width: 56, height: 56, flexShrink: 0, borderRadius: 999, background: i.fotoUrl ? `url(${i.fotoUrl}) center/cover` : 'var(--accent-soft)', color: 'var(--accent-soft-foreground)', fontSize: 18, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!i.fotoUrl && i.iniciales}</span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>{i.nombre}</p>
              {nota
                ? <p className="t-meta" style={{ margin: '2px 0 0' }}><span style={{ color: 'var(--warning)' }}>★</span> {nota}</p>
                : <p className="t-meta" style={{ margin: '2px 0 0' }}>Instructora del estudio</p>}
            </div>
          </div>

          {i.bio && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--muted-foreground)' }}>{i.bio}</p>}

          <div>
            <p className="t-label" style={{ margin: '0 0 7px' }}>Sus próximas clases</p>
            {proximas.length === 0 ? (
              <p className="t-meta" style={{ margin: 0 }}>No tiene clases programadas en el horario publicado.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {proximas.map((c) => (
                  <Link key={c.id} href={href(`/reservar/${c.id}`)} onClick={onClose} className="card card--tap" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
                    <span className="t-mono" style={{ fontSize: 12, fontWeight: 800, minWidth: 44 }}>{c.hora}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</span>
                      <span className="t-meta" style={{ display: 'block' }}>{etiquetaDia(c.fecha)} · {c.sala}</span>
                    </span>
                    {/* El mismo badge que el horario para la misma clase: «Última plaza»,
                        «Reservada ✓», lista de espera… — no una segunda versión. */}
                    <AvailabilityBadge estado={disponibilidad(c, reservas, soportaEspera)} plazas={c.plazasLibres} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Sheet>
  );
}
