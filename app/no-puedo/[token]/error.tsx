'use client';

import { AvisoErrorToken } from '@/components/publico/aviso-error-token';

export default function NoPuedoError({ error }: { error: Error & { digest?: string } }) {
  return <AvisoErrorToken error={error} area="no-puedo" />;
}
