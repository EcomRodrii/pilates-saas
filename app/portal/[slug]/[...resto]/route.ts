import { redirect, permanentRedirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

// Compatibilidad con las URLs del portal ANTERIOR.
//
// Sustituye al stub que redirigía todo a `/reservar/<slug>` perdiendo la ruta y
// la query. Ahora que la app de la alumna vuelve a vivir en `/portal/<slug>`,
// la mayoría de aquellos enlaces tienen un destino de verdad.
//
// Por qué sigue haciendo falta: hay 108 referencias vivas a `/portal/…` en 71
// ficheros —retornos de Stripe, enlaces de recibos por email, deep links de
// avisos push— y algunas están IMPRESAS: la bio de Instagram del estudio y el
// QR de la puerta (components/configuracion/tab-estudio-enlaces.tsx:115). Esas
// no se arreglan con un despliegue.
//
// Next resuelve primero las rutas concretas (`/bonos`, `/perfil`…) y solo cae
// aquí lo que no existe, así que este fichero únicamente ve nombres viejos.
const MAPA: Record<string, string> = {
  // El portal separaba comprar (`/compras`) de consultar el saldo (`/bonos`).
  // El diseño nuevo lo llama pagos: es donde está el historial y el recibo.
  compras: '/pagos',
  // El horario y la ficha de clase cambiaron de nombre.
  clases: '/reservar',
  // Listado de reservas.
  reservas: '/mis-reservas',
  // Las tres puertas viejas caen en la puerta única del diseño.
  login: '/acceso/login',
  acceso: '/acceso/login',
  'clave-nueva': '/acceso/verificar',
  // Sin equivalente todavía: se manda al inicio, que es un destino honesto.
  instructores: '',
  comunidad: '',
  mensajes: '',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; resto: string[] }> }) {
  const { slug, resto } = await params;
  const base = `/portal/${encodeURIComponent(slug)}`;
  const [primero, ...cola] = resto ?? [];

  const destino = MAPA[primero ?? ''];
  if (destino === undefined) {
    // Ruta vieja que no reconocemos: al inicio del estudio, nunca a un 404.
    redirect(base);
  }

  // `/clases/<sesionId>` → `/reservar/<sesionId>`. La cola se conserva porque
  // es la mitad del valor del enlace: un aviso push de «tu clase de mañana»
  // que aterrice en el horario genérico ha perdido lo que traía.
  const sufijo = cola.length ? '/' + cola.map(encodeURIComponent).join('/') : '';
  // Y la query también: los retornos de Stripe la usan (`?compra=ok`,
  // `?tarjeta=ok`), y el stub anterior la tiraba — ese era el bug que dejaba a
  // una clienta recién pagada en una pantalla que no le decía nada.
  const query = req.nextUrl.search;

  // 308 y no 307: son cambios de dirección definitivos, y así los buscadores y
  // los clientes de correo dejan de pedir la vieja.
  permanentRedirect(`${base}${destino}${sufijo}${query}`);
}
