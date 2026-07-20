'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Clientas vive ahora en /clientas. Se mantiene por marcadores, historial del
// navegador y notificaciones ya guardadas que apuntan aquí. La query string se
// conserva (?nuevo=1 abre el alta directamente).
export default function RedireccionSocios() {
  const router = useRouter();
  useEffect(() => {
    const qs = window.location.search;
    router.replace(`/clientas${qs}`);
  }, [router]);
  return null;
}
