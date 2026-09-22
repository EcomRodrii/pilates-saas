'use client';

import { useState } from 'react';
import Link from 'next/link';
import { textoBaja, type ClaseQueDa } from '@/lib/student/agenda-instructora';
import { Foto } from '@/components/student/ui/Foto';

/** El control horario de esta clase, si ya se puede empezar o está en curso. */
export interface ControlClase {
  estado: 'EMPEZABLE' | 'EN_CURSO';
  /** En curso: la hora a la que empezó (hora del estudio, «18:03»). */
  horaInicioReal?: string;
  /** «Terminé antes» ya puesto: la hora a la que acaba. */
  horaFinReal?: string;
  enviando: boolean;
  onEmpezar: () => void;
  /** «HH:MM» de hoy, hora del estudio. `true` si se guardó (el formulario se cierra solo entonces). */
  onTerminarAntes: (hora: string) => Promise<boolean>;
}

/**
 * «Tu próxima clase» de la instructora, con la misma cara que la de la alumna
 * (`NextClassCard`): la foto de la clase bajo el verde noche del kit y el texto
 * claro encima. Sin foto, el verde noche solo.
 *
 * Lleva lo que necesita para prepararla —hora, sala y cuántas vienen— y, si ha
 * pedido la baja, en qué está (ver `textoBaja`). «Pasar lista» solo aparece
 * cuando ya se puede: quien llama decide con `puedePasarLista`.
 */
export function ProximaClaseQueDaCard({ clase, foto, cuando, enCurso: enCursoPorHora, hrefClase, hrefLista, control, terminada }: {
  clase: ClaseQueDa;
  foto: string | null;
  /** «Hoy · 20:00», «Jue 17 · 20:00». */
  cuando: string;
  enCurso: boolean;
  hrefClase: string;
  hrefLista?: string;
  control?: ControlClase;
  /** Terminó antes de su hora y su horario sigue abierto: ya no está «en curso». */
  terminada?: { desde: string; hasta: string };
}) {
  const [terminando, setTerminando] = useState(false);
  const [horaFin, setHoraFin] = useState('');
  // Empezada antes de su hora: ya está en curso aunque el reloj diga que aún no.
  const enCurso = enCursoPorHora || control?.estado === 'EN_CURSO';
  const abrirTerminar = () => {
    // Nunca antes del minuto en que empezó: «14:18» con un inicio de 14:18:10 se
    // leía como terminar antes de empezar.
    const ahora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Madrid' });
    const inicio = control?.horaInicioReal;
    setHoraFin(inicio && ahora < inicio ? inicio : ahora);
    setTerminando(true);
  };
  const baja = clase.baja ? textoBaja(clase.baja.estado, clase.baja.sustituta) : null;
  const botonSecundario = {
    height: 34,
    background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)',
    color: 'var(--accent-deep-foreground)',
    border: '1px solid color-mix(in srgb, var(--accent-deep-foreground) 35%, transparent)',
  };
  const detalle = [
    `${clase.hora}–${clase.horaFin}`,
    clase.sala,
    `${clase.confirmadas} de ${clase.aforo} plazas`,
    clase.enEspera > 0 ? `${clase.enEspera} en espera` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      data-testid="clase-que-da"
      aria-label={enCurso ? 'Tu clase de ahora' : 'Tu próxima clase'}
      className="a-pop"
      style={{ position: 'relative', borderRadius: 'var(--radius-hero)', overflow: 'hidden', boxShadow: 'var(--shadow-hero)', background: 'var(--accent-deep)', color: 'var(--accent-deep-foreground)' }}
    >
      {foto && (
        <Foto
          src={foto}
          ancho={640}
          alto={200}
          sizes="(min-width:768px) 640px, 100vw"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
      <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg, rgba(18,41,26,.95), rgba(18,41,26,.68))' }} />
      <div style={{ position: 'relative', padding: '14px 15px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <p className="t-label" role={enCurso ? 'status' : undefined} style={{ color: enCurso ? 'var(--on-dark)' : 'var(--accent-deep-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: enCurso ? '#FAF9F5' : 'var(--accent-deep-muted)', animation: enCurso ? 'apPulse 1.6s infinite' : 'apPulse 2s infinite' }} />
            {terminada ? 'Tu clase, terminada' : enCurso ? 'Tu clase, en curso' : 'Tu próxima clase'}
          </p>
          <span className="t-num" style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--accent-deep-muted)', whiteSpace: 'nowrap' }}>{cuando}</span>
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 'var(--t-h3)', fontFamily: 'var(--font-heading)', fontWeight: 'var(--heading-weight)', letterSpacing: '-.02em', color: 'var(--on-dark)' }}>{clase.tipo}</p>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)' }}>{detalle}</p>
        {baja && (
          <div role="status" style={{ marginTop: 10, padding: '8px 11px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)' }}>
            <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>{baja.titulo}</p>
            {baja.detalle && <p style={{ margin: '1px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 80%, transparent)' }}>{baja.detalle}</p>}
          </div>
        )}
        {control?.estado === 'EN_CURSO' && (
          <p data-testid="clase-empezada" style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>
            Empezaste a las {control.horaInicioReal}.{' '}
            {control.horaFinReal ? `Terminas a las ${control.horaFinReal}.` : `Termina sola a las ${clase.horaFin}.`}
          </p>
        )}
        {terminada && (
          <p data-testid="clase-terminada" style={{ margin: '8px 0 0', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>
            La diste de {terminada.desde} a {terminada.hasta}.
          </p>
        )}
        {control?.estado === 'EMPEZABLE' && (
          <div style={{ marginTop: 11 }}>
            <button
              type="button"
              data-testid="empezar-clase"
              onClick={control.onEmpezar}
              disabled={control.enviando}
              className="btn btn--full tap"
              style={{ background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 44, fontWeight: 800, opacity: control.enviando ? 0.7 : 1 }}
            >
              {control.enviando ? 'Anotando…' : 'Empezar clase'}
            </button>
            <p style={{ margin: '6px 0 0', fontSize: 'var(--t-meta)', color: 'color-mix(in srgb, var(--accent-deep-foreground) 75%, transparent)' }}>
              Tentare anota la hora a la que empiezas. Al acabar no tienes que hacer nada.
            </p>
          </div>
        )}
        {control?.estado === 'EN_CURSO' && !control.horaFinReal && terminando && (
          <form
            data-testid="terminar-antes"
            onSubmit={(e) => { e.preventDefault(); if (horaFin) void control.onTerminarAntes(horaFin).then((ok) => { if (ok) setTerminando(false); }); }}
            style={{ marginTop: 10, padding: '10px 11px', borderRadius: 12, background: 'color-mix(in srgb, var(--accent-deep-foreground) 12%, transparent)' }}
          >
            <label htmlFor="hora-fin-clase" style={{ display: 'block', fontSize: 'var(--t-small)', fontWeight: 700, color: 'var(--on-dark)' }}>
              ¿A qué hora terminaste?
            </label>
            <div style={{ marginTop: 7, display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
              <input id="hora-fin-clase" type="time" required value={horaFin} onChange={(e) => setHoraFin(e.target.value)} aria-label="Hora a la que terminaste"
                style={{ height: 36, borderRadius: 10, border: 'none', padding: '0 10px', fontFamily: 'inherit', fontSize: 'var(--t-body)', fontWeight: 700, background: 'var(--on-dark)', color: 'var(--accent-deep)' }} />
              <button type="submit" className="btn btn--sm tap" disabled={control.enviando} style={{ background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 36 }}>Guardar</button>
              <button type="button" className="btn btn--sm tap" onClick={() => setTerminando(false)} style={{ ...botonSecundario, height: 36 }}>Cancelar</button>
            </div>
          </form>
        )}
        <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
          {hrefLista && (
            <Link href={hrefLista} className="btn btn--sm tap" style={control?.estado === 'EMPEZABLE' ? botonSecundario : { background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 34 }}>Pasar lista</Link>
          )}
          <Link
            href={hrefClase}
            className="btn btn--sm tap"
            style={hrefLista ? botonSecundario : { background: 'var(--on-dark)', color: 'var(--accent-deep)', height: 34 }}
          >
            Ver la clase
          </Link>
          {control?.estado === 'EN_CURSO' && !control.horaFinReal && !terminando && (
            <button type="button" className="btn btn--sm tap" onClick={abrirTerminar} style={botonSecundario}>Terminé antes</button>
          )}
        </div>
      </div>
    </section>
  );
}
