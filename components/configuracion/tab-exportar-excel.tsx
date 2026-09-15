'use client';

import { FileSpreadsheet } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import { btnPrimary } from '@/components/configuracion/estilos';

// «Exportar a Excel», en Datos y seguridad. Tres CSV hechos en el navegador con
// lo que el panel ya tiene cargado (socias, recibos y todas las reservas: el
// arranque los trae enteros, lib/supabase-data.ts). Vivía en Integraciones como
// si fuera una conexión, y no conecta nada.
//
// ⚠️ Convive con «Exportar mis datos» (ExportarDatosEstudio: un CSV por tabla
// hecho en el servidor) mientras se decide cuál de los dos se queda.

function toCsv(rows: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(';')).join('\r\n');
}

function descargarCsv(nombre: string, contenido: string) {
  // BOM para que Excel reconozca UTF-8
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TabExportarExcel({ showToast }: { showToast: (m: string) => void }) {
  const { socios, suscripciones, planesTarifa, recibos, reservas, sesiones, tiposClase } = useStudio();

  const exportarExcel = () => {
    const fmtEur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    // P0-35: índices por socio en UNA pasada, en vez de suscripciones.find/filter
    // por cada socio y socios.find por cada recibo (doble bucle O(N×M)).
    const planById = new Map(planesTarifa.map(p => [p.id, p]));
    const susPorSocio = new Map<string, typeof suscripciones>();
    for (const x of suscripciones) {
      const arr = susPorSocio.get(x.socioId);
      if (arr) arr.push(x); else susPorSocio.set(x.socioId, [x]);
    }
    const socioById = new Map(socios.map(s => [s.id, s]));
    // Hoja socias con su plan y estado de suscripción
    const rows: (string | number | null)[][] = [
      ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'NIF', 'Alta', 'Activa', 'Plan', 'Estado suscripción', 'Sesiones restantes'],
    ];
    for (const s of socios) {
      const lista = susPorSocio.get(s.id) ?? [];
      const sus = lista.find(x => x.estado === 'ACTIVA') ?? lista[lista.length - 1] ?? null;
      const plan = sus ? planById.get(sus.planId) ?? null : null;
      rows.push([
        s.nombre, s.apellidos, s.email, s.telefono ?? '', s.nif ?? '',
        s.fechaAlta?.slice(0, 10) ?? '', s.activo ? 'Sí' : 'No',
        plan?.nombre ?? '', sus?.estado ?? '', sus?.sesionesRestantes ?? '',
      ]);
    }
    descargarCsv(`tentare-clientas-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));

    // Hoja recibos
    const rRows: (string | number | null)[][] = [
      ['Concepto', 'Clienta', 'Importe (€)', 'Estado', 'Vencimiento', 'Cobro'],
    ];
    for (const r of recibos) {
      const s = r.socioId ? socioById.get(r.socioId) : undefined;
      rRows.push([
        r.concepto, s ? `${s.nombre} ${s.apellidos}` : '', fmtEur(r.importe),
        r.estado, r.fechaVencimiento?.slice(0, 10) ?? '', r.fechaCobro?.slice(0, 10) ?? '',
      ]);
    }
    descargarCsv(`tentare-recibos-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rRows));

    // Hoja historial: cada reserva con su clase, fecha y asistencia — es el
    // "exportas tu historial" prometido en la FAQ pública, no solo el censo.
    const sesionById = new Map(sesiones.map(s => [s.id, s]));
    const tipoById = new Map(tiposClase.map(t => [t.id, t]));
    const hRows: (string | number | null)[][] = [
      ['Clienta', 'Email', 'Clase', 'Fecha', 'Hora', 'Estado', 'Check-in'],
    ];
    const reservasOrdenadas = [...reservas].sort((a, b) => {
      const ia = sesionById.get(a.sesionId)?.inicio ?? '';
      const ib = sesionById.get(b.sesionId)?.inicio ?? '';
      return ib.localeCompare(ia);
    });
    for (const r of reservasOrdenadas) {
      const s = socioById.get(r.socioId);
      const ses = sesionById.get(r.sesionId);
      const ini = ses ? new Date(ses.inicio) : null;
      hRows.push([
        s ? `${s.nombre} ${s.apellidos}` : '', s?.email ?? '',
        ses ? tipoById.get(ses.tipoClaseId)?.nombre ?? '' : '',
        ini ? ini.toLocaleDateString('es-ES') : '',
        ini ? ini.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
        r.estado, r.checkInEn ? 'Sí' : 'No',
      ]);
    }
    descargarCsv(`tentare-historial-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(hRows));

    showToast('Exportación descargada (alumnas, historial y recibos)');
  };

  return (
    <button type="button" onClick={exportarExcel} className={btnPrimary}>
      <FileSpreadsheet size={14} aria-hidden /> Descargar los tres archivos
    </button>
  );
}
