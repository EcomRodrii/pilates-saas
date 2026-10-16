'use client';

// TEMPORAL — «Para tu gestoría» / Facturas y «Cambios del equipo». No se commitea.
import { ChevronRight, Download, FileText, Mail, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, BotonC, CabeceraCobros, Chip, LineaResumen, Nota, Pestanas, Tarjeta } from './comun';

function Bloque({ titulo, cifra, detalle, acciones, destacado }: { titulo: string; cifra: string; detalle: string; acciones: React.ReactNode; destacado?: boolean }) {
  return (
    <Tarjeta className={cn('p-5', destacado && 'border-foreground/25')}>
      <p className="text-[12.5px] font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-[26px] font-semibold tracking-tight tabular-nums text-foreground">{cifra}</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground text-pretty">{detalle}</p>
      <div className="mt-3 flex flex-wrap gap-2">{acciones}</div>
    </Tarjeta>
  );
}

export function DisenoGestoria() {
  return (
    <div>
      <CabeceraCobros />
      <LineaResumen />
      <Pestanas activa="Para tu gestoría" nota={<Nota n={8} />} />
      <p className="mt-4 max-w-[760px] text-[13.5px] text-muted-foreground text-pretty">
        Tus facturas las hace tu gestoría (no facturas con Tentare). Aquí tienes lo que necesita, por trimestre natural (el del IVA).{' '}
        <span className="font-medium text-brand-medio">Facturar con Tentare <ChevronRight size={12} className="inline" aria-hidden /></span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <Bloque destacado titulo="3.er trimestre · julio – septiembre" cifra="12.940 €"
          detalle="Cobrado con IVA, neto de lo devuelto · 212 cobros · por cobro, fecha, clienta, método e IVA"
          acciones={<><BotonC icono={Download}>Descargar</BotonC><BotonC icono={Mail}>Enviar a mi gestoría</BotonC></>} />
        <Bloque titulo="4.º trimestre · desde el 1 de octubre" cifra="1.284 €"
          detalle="Va sumando: se cierra el 31 de diciembre"
          acciones={<BotonC icono={Download}>Descargar lo que va</BotonC>} />
        <Bloque titulo="Cierre del año 2025" cifra="38.410 €"
          detalle="Lo que tu gestoría necesita para cerrar el año"
          acciones={<BotonC icono={FileText}>Abrir el cierre</BotonC>} />
      </div>
      <Tarjeta className="mt-4 flex items-center gap-3 p-4">
        <FileText size={16} className="text-muted-foreground" aria-hidden />
        <p className="text-[13.5px] text-foreground">24 facturas emitidas con Tentare antes de dejar de facturar aquí (2025)</p>
        <span className="ml-auto text-[13px] font-medium text-brand-medio">Verlas <ChevronRight size={12} className="inline" aria-hidden /></span>
      </Tarjeta>
    </div>
  );
}

/** Si el estudio SÍ factura con Tentare: una línea del periodo, y Veri*Factu diciendo la verdad. */
export function VarianteFacturas() {
  return (
    <Tarjeta className="w-[900px] p-5">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Si facturas con Tentare, la pestaña se llama «Facturas»</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[15px] text-foreground">
        <span>Facturado en octubre:</span>
        <span>base <b className="font-semibold tabular-nums">982,64 €</b></span>
        <span className="text-muted-foreground">·</span>
        <span>IVA 21 % <b className="font-semibold tabular-nums">206,36 €</b></span>
        <span className="text-muted-foreground">·</span>
        <span>total <b className="font-semibold tabular-nums">1.189,00 €</b></span>
        <span className="text-muted-foreground">· 16 facturas · 4 cobros en efectivo sin factura (95 €)</span>
      </div>
      <p className="mt-2 flex items-center gap-1.5 text-[13px] text-foreground">
        <ShieldCheck size={14} className="text-success" aria-hidden />
        Veri*Factu: cada factura queda registrada con su huella al cobrarse · 1 pendiente de sellar (falta el NIF de la clienta)
      </p>
      <div className="mt-3 flex gap-2"><BotonC icono={Download}>Descargar el trimestre</BotonC><BotonC>Por clienta</BotonC></div>
    </Tarjeta>
  );
}

const CAMBIOS = [
  { quien: 'Ana Peña', rol: 'Recepción', ini: 'AP', que: 'marcó cobrado «Bono 5 clases» de Alba García', detalle: '70 € · tarjeta del mostrador', cuando: 'Hoy, 11:05' },
  { quien: 'Ana Peña', rol: 'Recepción', ini: 'AP', que: 'devolvió en efectivo «Clase suelta — Mat» a Paula Romero', detalle: '15 €', cuando: 'Hoy, 10:32' },
  { quien: 'Cloe', rol: 'Propietaria', ini: 'C', que: 'cambió el importe de «Mensual ilimitado — octubre» de Nuria Díaz', detalle: '95 € → 89 €', cuando: 'Ayer, 18:20' },
  { quien: 'Ana Peña', rol: 'Recepción', ini: 'AP', que: 'eliminó un recibo de Marta Ruiz', detalle: '15 € · motivo: duplicado', cuando: '30 sep' },
];

export function DisenoCambios() {
  return (
    <div>
      <Pestanas activa="Cambios del equipo" />
      <p className="mt-4 text-[13.5px] text-muted-foreground">
        Lo que tu equipo hace con el dinero: quién, cuándo y qué había antes. Solo lo ves tú.{' '}
        <span className="font-medium text-brand-medio">Qué se registra <ChevronRight size={12} className="inline" aria-hidden /></span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {['Todo', 'Recibos', 'Cuotas y bonos', 'Ingresos manuales', 'Planes', 'Penalizaciones', 'Ventas de la caja', 'Rectificativas'].map((c, i) => <Chip key={c} activo={i === 0}>{c}</Chip>)}
      </div>
      <Tarjeta className="mt-3 divide-y divide-border overflow-hidden">
        {CAMBIOS.map(c => (
          <div key={c.que} className="flex items-center gap-3 px-4 py-3">
            <Avatar ini={c.ini} tono={c.rol === 'Propietaria' ? 3 : 1} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-foreground"><b className="font-semibold">{c.quien}</b> <span className="text-muted-foreground">({c.rol})</span> {c.que}</p>
              <p className="text-[12.5px] text-muted-foreground">{c.detalle}</p>
            </div>
            <span className="text-[12.5px] text-muted-foreground">{c.cuando}</span>
          </div>
        ))}
      </Tarjeta>
    </div>
  );
}
