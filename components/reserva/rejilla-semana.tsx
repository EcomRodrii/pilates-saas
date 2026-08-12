'use client';

import { useMemo } from 'react';
import {
  estadoPlazas, franjasConClases, haySaltoAntesDe, celdaDe, LEYENDA,
  type EstadoPlazas,
} from '@/lib/reservar/rejilla-semana';
import type { ReservaSlot } from './reserva-calendario';

// La vista «Semana» de la página pública: horas en filas, días en columnas.
//
// Existe porque la tira de días solo enseña UN día: para responder «¿qué tenéis
// los martes por la tarde?» —que es como la gente elige— había que ir pinchando
// día por día. La rejilla contesta esa pregunta de un vistazo.
//
// Toda la lógica (estado por plazas, qué franjas merecen fila, dónde cae cada
// clase) vive en lib/reservar/rejilla-semana.ts, con sus tests. Aquí solo se
// pinta.

const DIAS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

/**
 * El color de cada estado.
 *
 * ⚠️ **No se distingue solo por color.** Cada chip lleva además su texto
 * («Completa», «Lista de espera») y la ocupación en números: quien no
 * distingue verde de ámbar —entre un 4 y un 8 % de los hombres— tiene que
 * poder leer lo mismo. El color acompaña, no informa por su cuenta.
 */
const COLOR: Record<EstadoPlazas, { fondo: string; borde: string; texto: string }> = {
  disponible: { fondo: 'var(--portal-velo-fuerte)', borde: 'var(--portal-line)', texto: 'var(--portal-ink)' },
  ultimas: { fondo: 'rgba(180,120,20,.10)', borde: 'rgba(180,120,20,.45)', texto: 'var(--portal-ink)' },
  'lista-espera': { fondo: 'rgba(60,90,140,.09)', borde: 'rgba(60,90,140,.40)', texto: 'var(--portal-ink)' },
  completa: { fondo: 'rgba(150,50,50,.08)', borde: 'rgba(150,50,50,.35)', texto: 'var(--portal-muted)' },
};

const ETIQUETA: Record<EstadoPlazas, string> = {
  disponible: '', ultimas: 'Últimas plazas', 'lista-espera': 'Lista de espera', completa: 'Completa',
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function RejillaSemana({
  slots, permiteListaEspera, onElegir, fontFamily,
}: {
  slots: ReservaSlot[];
  permiteListaEspera?: boolean;
  onElegir: (slot: ReservaSlot) => void;
  fontFamily?: string;
}) {
  const franjas = useMemo(() => franjasConClases(slots), [slots]);

  // Índice (día, hora) → clases. Se construye una vez y no por celda: con 7×N
  // celdas, filtrar el array entero en cada una es cuadrático sin necesidad.
  const porCelda = useMemo(() => {
    const m = new Map<string, ReservaSlot[]>();
    for (const s of slots) {
      const c = celdaDe(s.inicio);
      if (!c) continue;
      const k = `${c.diaSemana}-${c.hora}`;
      const lista = m.get(k);
      if (lista) lista.push(s);
      else m.set(k, [s]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return m;
  }, [slots]);

  if (franjas.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--portal-muted)', padding: '28px 0', textAlign: 'center', fontFamily }}>
        No hay clases esta semana.
      </p>
    );
  }

  return (
    <div style={{ fontFamily }}>
      {/* El scroll horizontal vive AQUÍ y no en la página: en un móvil la
          rejilla no cabe, y hacer que la página entera se desplace de lado
          rompe el resto de la pantalla. */}
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 640 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '48px repeat(7, minmax(0, 1fr))', gap: 6 }}>
            <div />
            {DIAS.map((d) => (
              <div key={d} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--portal-muted-2)', textAlign: 'center', paddingBottom: 6 }}>
                {d}
              </div>
            ))}

            {franjas.map((hora, i) => (
              <FilaHora
                key={hora}
                hora={hora}
                conSalto={haySaltoAntesDe(franjas, i)}
                porCelda={porCelda}
                permiteListaEspera={permiteListaEspera}
                onElegir={onElegir}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 16 }}>
        {LEYENDA.map(({ estado, etiqueta }) => (
          <span key={estado} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--portal-muted)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: COLOR[estado].borde }} />
            {etiqueta}
          </span>
        ))}
      </div>
    </div>
  );
}

function FilaHora({ hora, conSalto, porCelda, permiteListaEspera, onElegir }: {
  hora: number;
  conSalto: boolean;
  porCelda: Map<string, ReservaSlot[]>;
  permiteListaEspera?: boolean;
  onElegir: (slot: ReservaSlot) => void;
}) {
  // El salto se marca con aire y una línea: sin eso, la fila de las 10:00 y la
  // de las 17:00 parecen consecutivas y el horario del estudio se lee mal.
  const arriba = conSalto ? { marginTop: 14, paddingTop: 14, borderTop: '1px dashed var(--portal-line)' } : undefined;
  return (
    <>
      <div style={{ ...arriba, fontSize: 11, color: 'var(--portal-muted-2)', textAlign: 'right', paddingRight: 6, paddingTop: conSalto ? 16 : 2 }}>
        {String(hora).padStart(2, '0')}:00
      </div>
      {Array.from({ length: 7 }, (_, dia) => (
        <div key={dia} style={{ ...arriba, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          {(porCelda.get(`${dia}-${hora}`) ?? []).map((s) => (
            <Chip key={s.id} slot={s} permiteListaEspera={permiteListaEspera} onElegir={onElegir} />
          ))}
        </div>
      ))}
    </>
  );
}

function Chip({ slot, permiteListaEspera, onElegir }: {
  slot: ReservaSlot;
  permiteListaEspera?: boolean;
  onElegir: (slot: ReservaSlot) => void;
}) {
  const estado = estadoPlazas({
    ocupadas: slot.ocupadas, aforoMaximo: slot.aforoMaximo, permiteListaEspera,
  });
  const c = COLOR[estado];
  const nota = ETIQUETA[estado];
  return (
    <button
      type="button"
      onClick={() => onElegir(slot)}
      // El nombre accesible lo dice TODO, porque un lector de pantalla no ve
      // el color: clase, hora, y en qué estado está.
      aria-label={`${slot.claseNombre}, ${hhmm(slot.inicio)}${nota ? `, ${nota}` : `, ${slot.aforoMaximo - slot.ocupadas} plazas libres`}`}
      style={{
        textAlign: 'left', border: `1px solid ${c.borde}`, background: c.fondo, color: c.texto,
        borderRadius: 10, padding: '6px 7px', cursor: 'pointer', minWidth: 0, width: '100%',
        display: 'block', lineHeight: 1.25,
      }}
    >
      <span style={{ display: 'block', fontSize: 10.5, color: 'var(--portal-muted-2)' }}>{hhmm(slot.inicio)}</span>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {slot.claseNombre}
      </span>
      {slot.instructorNombre && (
        <span style={{ display: 'block', fontSize: 10.5, color: 'var(--portal-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {slot.instructorNombre.split(' ')[0]}
        </span>
      )}
      <span style={{ display: 'block', fontSize: 10, color: 'var(--portal-muted-2)', marginTop: 2 }}>
        {nota || `${slot.ocupadas}/${slot.aforoMaximo}`}
      </span>
    </button>
  );
}
