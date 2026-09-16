'use client';

import { AvisoErrorToken } from '@/components/publico/aviso-error-token';

export default function ValorarError({ error }: { error: Error & { digest?: string } }) {
  return <AvisoErrorToken error={error} area="valorar" />;
}
