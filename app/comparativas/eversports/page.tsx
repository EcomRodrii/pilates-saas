import type { Metadata } from 'next';
import { ComparativaPage, type DatosComparativa } from '@/components/marketing/comparativa';

export const metadata: Metadata = {
  title: 'Tentare vs Eversports | Comparativa',
  description: 'Comparativa de precios, comisiones y funciones entre Tentare y Eversports Manager para estudios de Pilates.',
};

const datos: DatosComparativa = {
  nombre: 'Eversports',
  resumen: 'Eversports Manager tiene precios públicos y transparentes por tramos de reservas mensuales, con más presencia en el mercado alemán/DACH que en España.',
  fechaVerificacion: 'julio de 2026',
  filas: [
    { criterio: 'Precio de partida', tentare: 'Desde 29€/mes, todo incluido', competidor: 'Desde 49€/mes (tramo "Light"), hasta 229€/mes en el tramo más alto, más una cuota única de alta de 99€' },
    { criterio: 'Comisión sobre cobros', tentare: 'Ninguna — solo la cuota estándar de Stripe', competidor: 'Comisión del 25% (máx. 75€ por persona) en clientes nuevos captados por su marketplace de descubrimiento, más comisión de procesamiento de pago no publicada' },
    { criterio: 'Facturación España', tentare: 'Factura con NIF, IVA y numeración correlativa desde el primer cobro', competidor: 'Sin mención de IVA/NIF/Verifactu para España; producto centrado en Austria, Alemania, Suiza y Países Bajos' },
    { criterio: 'Enfoque', tentare: 'Un solo vertical: estudios de Pilates, con funciones específicas (reformer, sustituciones)', competidor: 'Estudios boutique en general (yoga, pilates, danza, artes marciales), mismo set de funciones en todos los tramos' },
    { criterio: 'Función destacada', tentare: 'Centro de Control con automatizaciones IA que tú apruebas', competidor: 'App de descubrimiento propia con volumen alto en su mercado principal (DACH)' },
  ],
  fuentes: [
    { label: 'Precios', nota: 'eversportsmanager.com/pricing (julio 2026).' },
    { label: 'Comisión de marketplace', nota: 'Página pública de tarifas de Eversports.' },
  ],
};

export default function Page() {
  return <ComparativaPage datos={datos} />;
}
