'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePortalHref } from '@/components/student/contexto';
import { Icono } from '@/components/student/ui/Icono';
import { TEXTOS_PLAZA_FIJA as T } from '@/lib/student/plaza-fija-textos';
import type { CalendarioClaseFija as Datos } from '@/lib/student/mapeo';
import {
  INICIALES_SEMANA, marcasDelMes, nombreMes, semanasDelMes, sumarMeses, ultimoMesConClases,
  type DiaFijo, type MarcaDiaFijo,
} from '@/lib/plazas-fijas-calendario';

// El mes de su clase fija, con los días que ya tiene reservados. Solo informa:
// cancelar un día sigue siendo «No puedo asistir» o «Mis clases». Un día con
// clase se puede tocar y abre su ficha, igual que en el horario.
//
// Empieza en el mes de hoy: el payload de la app no trae clases pasadas, así que
// antes de hoy no hay nada verdadero que enseñar.

const NOMBRE: Record<MarcaDiaFijo, string> = {
  RESERVADA: T.marcaReservada, ASISTIDA: T.marcaAsistida, NO_ASISTIO: T.marcaNoAsistio,
  NO_VA: T.marcaNoVa, PAUSA: T.marcaPausa, SIN_RESERVA: T.marcaSinReservar,
};
const ORDEN_LEYENDA: MarcaDiaFijo[] = ['RESERVADA', 'ASISTIDA', 'NO_VA', 'NO_ASISTIO', 'PAUSA', 'SIN_RESERVA'];
const DIAS_LARGOS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function Marca({ marca, tamano = 24 }: { marca: MarcaDiaFijo; tamano?: number }) {
  const base: React.CSSProperties = {
    width: tamano, height: tamano, borderRadius: 999, flexShrink: 0,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  if (marca === 'RESERVADA' || marca === 'ASISTIDA') {
    return (
      <span aria-hidden data-marca={marca} style={{ ...base, background: 'var(--accent-soft)', color: 'var(--accent-soft-foreground)' }}>
        <Icono nombre="hecho" tamano={tamano * 0.66} grosor={2.2} />
      </span>
    );
  }
  if (marca === 'PAUSA') {
    return (
      <span aria-hidden data-marca={marca} style={{ ...base, gap: tamano * 0.12, background: 'var(--muted)' }}>
        {[0, 1].map((i) => <i key={i} style={{ width: 2.5, height: tamano * 0.38, borderRadius: 2, background: 'var(--muted-foreground)' }} />)}
      </span>
    );
  }
  if (marca === 'NO_VA' || marca === 'NO_ASISTIO') {
    return (
      <span aria-hidden data-marca={marca} style={{ ...base, border: '1.5px solid var(--border)' }}>
        <i style={{ width: tamano * 0.38, height: 2, borderRadius: 2, background: 'var(--muted-foreground)' }} />
      </span>
    );
  }
  return <span aria-hidden data-marca={marca} style={{ ...base, border: '1.5px dashed var(--muted-foreground)' }} />;
}

/** «lunes 1 de junio: 10:00, reservada» — lo que oye un lector de pantalla en cada día. */
function etiquetaDia(fecha: string, dia: DiaFijo[]): string {
  const col = (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;
  const mes = nombreMes(fecha.slice(0, 7)).split(' de ')[0];
  return `${DIAS_LARGOS[col]} ${Number(fecha.slice(8))} de ${mes}: ${dia.map((x) => `${x.hora}, ${NOMBRE[x.marca].toLowerCase()}`).join('; ')}`;
}

export function CalendarioClaseFija({ datos, hoy, soportaListaEspera }: { datos: Datos; hoy: string; soportaListaEspera: boolean }) {
  const href = usePortalHref();
  const primero = hoy.slice(0, 7);
  const ultimo = ultimoMesConClases(datos.plazas, datos.sesiones, hoy);
  const [mes, setMes] = useState(primero);
  const mesReal = mes < primero ? primero : mes > ultimo ? ultimo : mes;

  if (datos.plazas.length === 0) return null;
  const marcas = marcasDelMes(mesReal, datos.plazas, datos.sesiones, datos.reservas, hoy);
  const presentes = new Set([...marcas.values()].flat().map((x) => x.marca));
  const titulo = nombreMes(mesReal);

  return (
    <div data-testid="calendario-clase-fija" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid var(--muted)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p className="t-label" style={{ margin: 0 }}>{T.calendarioTitulo}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button" className="tap tap--icono" aria-label="Mes anterior" disabled={mesReal <= primero}
            onClick={() => setMes(sumarMeses(mesReal, -1))}
            style={{ width: 32, height: 32, border: 'none', borderRadius: 999, background: 'transparent', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: mesReal <= primero ? 0.3 : 1 }}
          >
            <Icono nombre="chevron-izquierda" tamano={18} />
          </button>
          <p aria-live="polite" style={{ margin: 0, minWidth: 116, textAlign: 'center', fontSize: 'var(--t-small)', fontWeight: 800 }}>
            {titulo.charAt(0).toUpperCase() + titulo.slice(1)}
          </p>
          <button
            type="button" className="tap tap--icono" aria-label="Mes siguiente" disabled={mesReal >= ultimo}
            onClick={() => setMes(sumarMeses(mesReal, 1))}
            style={{ width: 32, height: 32, border: 'none', borderRadius: 999, background: 'transparent', color: 'var(--foreground)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: mesReal >= ultimo ? 0.3 : 1 }}
          >
            <Icono nombre="chevron-derecha" tamano={18} />
          </button>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <caption className="sr-only">{`${T.calendarioTitulo}: ${titulo}`}</caption>
        <thead>
          <tr>
            {INICIALES_SEMANA.map((l, i) => (
              <th key={l} scope="col" abbr={DIAS_LARGOS[i]} style={{ padding: '0 0 6px', fontSize: 'var(--t-micro)', fontWeight: 700, color: 'var(--subtle-foreground)' }}>{l}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDelMes(mesReal).map((semana, i) => (
            <tr key={i}>
              {semana.map((fecha, j) => {
                if (!fecha) return <td key={j} />;
                const dia = marcas.get(fecha);
                const pasado = fecha < hoy;
                const esHoy = fecha === hoy;
                const numero = (
                  <span style={{
                    fontSize: 'var(--t-small)', fontWeight: esHoy ? 800 : 600, lineHeight: 1,
                    color: pasado ? 'var(--subtle-foreground)' : 'var(--foreground)',
                    textDecoration: esHoy ? 'underline' : undefined, textUnderlineOffset: 3,
                  }}>{Number(fecha.slice(8))}</span>
                );
                const contenido = (
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', minHeight: 50 }}>
                    {numero}
                    {dia && (
                      <span style={{ display: 'flex', gap: 2 }}>
                        {dia.slice(0, 2).map((x) => <Marca key={x.hora} marca={x.marca} tamano={dia.length > 1 ? 18 : 24} />)}
                      </span>
                    )}
                  </span>
                );
                return (
                  <td key={j} style={{ padding: 0, textAlign: 'center', verticalAlign: 'top' }} aria-current={esHoy ? 'date' : undefined}>
                    {dia ? (
                      <Link
                        href={href('/reservar/' + dia[0].sesionId)} data-testid="dia-clase-fija" data-fecha={fecha}
                        aria-label={etiquetaDia(fecha, dia)}
                        style={{ display: 'block', borderRadius: 10, color: 'inherit' }}
                      >
                        {contenido}
                      </Link>
                    ) : contenido}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {presentes.size > 0 && (
        <ul aria-label="Leyenda" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {ORDEN_LEYENDA.filter((m) => presentes.has(m)).map((m) => (
            <li key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--t-meta)', color: 'var(--muted-foreground)' }}>
              <Marca marca={m} tamano={16} />{NOMBRE[m]}
            </li>
          ))}
        </ul>
      )}
      {presentes.has('SIN_RESERVA') && <p className="t-meta" style={{ margin: 0 }}>{T.sinReservarAyuda}</p>}

      <div className="note" data-testid="clase-fija-cambios" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--muted)' }}>
        <p style={{ margin: 0, fontSize: 'var(--t-small)', fontWeight: 800 }}>{T.cambiosTitulo}</p>
        <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.cambiosCuerpo}</p>
        {soportaListaEspera && <p style={{ margin: 0, fontSize: 'var(--t-small)' }}>{T.cambiosListaEspera}</p>}
      </div>
    </div>
  );
}
