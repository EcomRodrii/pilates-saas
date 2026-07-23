'use client';

// F2 (B2.11) — PDF "libreta" (garantía de salida): "Tu estudio en Tentare". Cada
// socia con su plan, sus sesiones, sus recuperaciones vivas y su plaza fija. Es la
// promesa anti-lock-in del informe: "si cerráis, me quedo con mi libreta, en mejor".
// Sin dependencia de PDF: vista imprimible (Imprimir → Guardar como PDF).

import { useMemo } from 'react';
import { useStudio } from '@/lib/studio-context';
import { Printer } from 'lucide-react';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function Libreta() {
  const { studio, socios, suscripciones, planesTarifa, recuperaciones, plazasFijas, salas } = useStudio();
  const hoyISO = new Date().toISOString().slice(0, 10);
  const mes = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  const filas = useMemo(() => {
    return socios
      .filter(s => s.activo)
      .sort((a, b) => `${a.apellidos} ${a.nombre}`.localeCompare(`${b.apellidos} ${b.nombre}`))
      .map(socia => {
        const sus = suscripciones.find(x => x.socioId === socia.id && x.estado === 'ACTIVA');
        const plan = sus ? planesTarifa.find(p => p.id === sus.planId) : null;
        const recups = recuperaciones.filter(r => r.socioId === socia.id && r.estado === 'DISPONIBLE' && r.caducaEl >= hoyISO);
        const plazas = plazasFijas.filter(p => p.socioId === socia.id && p.estado === 'ACTIVA');
        return { socia, sus, plan, recups, plazas };
      });
  }, [socios, suscripciones, planesTarifa, recuperaciones, plazasFijas, hoyISO]);

  return (
    <div className="libreta-root p-6 max-w-4xl mx-auto">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .libreta-root { padding: 0 !important; max-width: none !important; }
          .libreta-doc { border: none !important; box-shadow: none !important; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="no-print flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-foreground">Libreta del estudio</h1>
          <p className="text-sm text-muted-foreground">Tu garantía de salida: imprímela o guárdala como PDF cuando quieras.</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-primary-foreground bg-primary hover:brightness-95 transition-colors"
        >
          <Printer size={15} /> Descargar / imprimir
        </button>
      </div>

      <div className="libreta-doc border border-border rounded-xl p-8 bg-card">
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold text-foreground">Tu estudio en Tentare</h2>
          <p className="text-sm text-muted-foreground mt-1">{studio?.nombre ?? 'Mi estudio'} · {mes} · {filas.length} socias activas</p>
        </div>

        <table className="w-full text-[13px] border-collapse">
          <thead>
            <tr className="border-b-2 border-border text-left">
              <th className="py-2 pr-3 font-bold">Socia</th>
              <th className="py-2 px-3 font-bold">Plan</th>
              <th className="py-2 px-3 font-bold">Sesiones</th>
              <th className="py-2 px-3 font-bold">Recuperaciones</th>
              <th className="py-2 pl-3 font-bold">Plaza fija</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(({ socia, sus, plan, recups, plazas }) => (
              <tr key={socia.id} className="border-b border-border align-top">
                <td className="py-2 pr-3 font-semibold text-foreground">{socia.nombre} {socia.apellidos}</td>
                <td className="py-2 px-3 text-muted-foreground">{plan?.nombre ?? '—'}</td>
                <td className="py-2 px-3 text-muted-foreground">
                  {sus && sus.sesionesRestantes !== null ? `${sus.sesionesRestantes} restantes` : (plan?.tipo === 'MENSUAL' ? 'Mensual' : '—')}
                </td>
                <td className="py-2 px-3 text-muted-foreground">
                  {recups.length === 0 ? '—' : recups.map(r => `1 (caduca ${fechaCorta(r.caducaEl)})`).join(', ')}
                </td>
                <td className="py-2 pl-3 text-muted-foreground">
                  {plazas.length === 0 ? '—' : plazas.map(p => {
                    const sala = salas.find(s => s.id === p.salaId);
                    return `${DIAS[p.diaSemana]} ${p.horaInicio.slice(0, 5)}${sala ? ` · ${sala.nombre}` : ''}`;
                  }).join(' / ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filas.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No hay socias activas todavía.</p>}

        <p className="text-[11px] text-muted-foreground mt-6 leading-relaxed">
          Esta es tu libreta: si algún día cierras Tentare, aquí tienes cada socia con su plan, sus sesiones, sus recuperaciones vivas y su plaza fija.
          Generada el {fechaCorta(hoyISO)} desde {studio?.nombre ?? 'tu estudio'}.
        </p>
      </div>
    </div>
  );
}
