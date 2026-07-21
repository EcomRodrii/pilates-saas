import type { Metadata } from 'next';
import { ComparativaPage, type DatosComparativa } from '@/components/marketing/comparativa';

export const metadata: Metadata = {
  title: 'Tentare vs Mindbody | Comparativa',
  description: 'Comparativa de precios, comisiones y funciones entre Tentare y Mindbody para estudios de Pilates.',
};

const datos: DatosComparativa = {
  nombre: 'Mindbody',
  resumen: 'Mindbody es la plataforma más grande y multi-vertical del sector (fitness, spa, salón, salud). Tentare está enfocado en un solo tipo de negocio: estudios de Pilates.',
  fechaVerificacion: 'julio de 2026',
  filas: [
    { criterio: 'Precio de partida', tentare: 'Desde 29€/mes, todo incluido', competidor: 'Desde ~99$/mes por sede, con tramos superiores que suelen requerir hablar con ventas' },
    { criterio: 'Comisión sobre cobros', tentare: 'Ninguna — solo la cuota estándar de Stripe', competidor: 'Comisión del 20% (máx. 30$/transacción) en la primera reserva de un cliente captado por su marketplace, además de la comisión de pago estándar' },
    { criterio: 'Facturación España', tentare: 'Factura con NIF, IVA y numeración correlativa desde el primer cobro', competidor: 'Sin integración conocida de IVA/NIF/Verifactu para España' },
    { criterio: 'Enfoque', tentare: 'Un solo vertical: estudios de Pilates, con funciones específicas (reformer, sustituciones)', competidor: 'Multi-vertical: fitness, spa, salón, salud integrativa — plataforma generalista' },
    { criterio: 'Función destacada', tentare: 'Centro de Control con automatizaciones IA que tú apruebas', competidor: 'App de descubrimiento/marketplace de consumidores propia, la más grande del sector' },
  ],
  fuentes: [
    { label: 'Precios', nota: 'mindbodyonline.com/business/pricing (julio 2026).' },
    { label: 'Comisión de marketplace', nota: 'FAQ pública de Mindbody sobre tarifas del marketplace.' },
  ],
};

export default function Page() {
  return <ComparativaPage datos={datos} />;
}
