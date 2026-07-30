import { redirect } from 'next/navigation';

// `/mi-plan` se partió en `/bonos` (saldo y plaza fija) y `/compras` (catálogo,
// método de pago y facturas). Esta ruta NO se borra:
//
//  · Hay avisos ya creados en producción con `/portal/<slug>/mi-plan` guardado
//    en su `deep_link` (medido: 24 filas). Una URL que vive en datos de terceros
//    no se puede retirar de golpe, aunque el código ya no la genere.
//  · El retorno de Stripe tras domiciliar SEPA apuntaba aquí.
//
// Se manda a `/bonos` porque es el destino de primer nivel de la sección: quien
// venga de «tu bono está por caducar» ve su saldo, y desde ahí compra en un
// toque. Las notificaciones nuevas ya apuntan directamente a `/compras`.
export default async function MiPlanRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/portal/${slug}/bonos`);
}
