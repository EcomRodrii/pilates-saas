import type { Metadata } from 'next';
import { ComparativaPage, type DatosComparativa } from '@/components/marketing/comparativa';

export const metadata: Metadata = {
  title: 'Tentare vs Bsport | Comparativa',
  description: 'Comparativa de precios, comisiones y funciones entre Tentare y Bsport para estudios de Pilates.',
};

const datos: DatosComparativa = {
  nombre: 'Bsport',
  resumen: 'Bsport es de los competidores con más presencia en España, pero no publica precios — hay que pedir presupuesto para saber cuánto cuesta.',
  fechaVerificacion: 'julio de 2026',
  filas: [
    { criterio: 'Precio de partida', tentare: 'Desde 29€/mes, publicado y sin sorpresas', competidor: 'No publica precios — 5 tramos ("Start" a "Scale") solo disponibles pidiendo una demo/presupuesto' },
    { criterio: 'Comisión sobre cobros', tentare: 'Ninguna — solo la cuota estándar de Stripe', competidor: 'Bsport afirma tarifas de transacción bajas y planas, pero no publica el porcentaje exacto' },
    { criterio: 'Facturación España', tentare: 'Factura con NIF, IVA y numeración correlativa desde el primer cobro, nativo', competidor: 'Según un integrador externo, necesita una capa adicional de terceros para conectar con Verifactu/TicketBAI — no confirmado directamente por Bsport' },
    { criterio: 'Enfoque', tentare: 'Un solo vertical: estudios de Pilates, con funciones específicas (reformer, sustituciones)', competidor: 'Estudios boutique en general (yoga, pilates, ciclismo, danza, boxeo, barre, HIIT), fuerte en Francia y España' },
    { criterio: 'Función destacada', tentare: 'Centro de Control con automatizaciones IA que tú apruebas', competidor: 'Personalización amplia por tipo de estudio' },
  ],
  fuentes: [
    { label: 'Precios', nota: 'pro.bsport.io/pricing — sin cifras públicas, solo "pedir presupuesto" (julio 2026).' },
    { label: 'Verifactu/TicketBAI', nota: 'Referencia de un integrador externo (no de Bsport directamente) que ofrece conectar Bsport con la normativa española — tómalo como indicativo, no como confirmación oficial.' },
  ],
};

export default function Page() {
  return <ComparativaPage datos={datos} />;
}
