'use client';

import { AvisoErrorToken } from '@/components/publico/aviso-error-token';

export default function ConfirmarReservaError({ error }: { error: Error & { digest?: string } }) {
  return <AvisoErrorToken error={error} area="confirmar-reserva" />;
}
