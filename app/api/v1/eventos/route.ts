import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { leerLimite } from '@/lib/api-publica/cursor';
import { esTipoEvento, tiposPermitidos, type TipoEvento } from '@/lib/api-publica/webhooks/catalogo';
import {
  codificarCursorEventos, decodificarCursorEventos, eventoPublico, type FilaEvento,
} from '@/lib/api-publica/webhooks/evento';

// GET /api/v1/eventos — el registro de lo que ha cambiado (los mismos eventos
// que mandan los webhooks), para quien prefiere preguntar a que le avisen.
//
// Se recorre hacia delante: sin `cursor` empieza por el más antiguo que se
// guarda (30 días), y cada respuesta trae en `X-Siguiente-Cursor` desde dónde
// seguir, también cuando ya no hay más: se guarda y se vuelve a preguntar con él.
// Cada evento exige el permiso de su recurso (un recibo, `pagos:leer`); los que
// la credencial no puede ver no salen. `?tipos=recibo.creado,recibo.actualizado`
// filtra.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: null, ruta: '/api/v1/eventos' }, async (ctx, admin) => {
    const sp = req.nextUrl.searchParams;
    const permitidos = tiposPermitidos(ctx.scopes);
    if (permitidos.length === 0) {
      return error(403, 'insufficient_scope', 'Esta credencial no puede ver ningún evento: hace falta «pagos:leer», «facturas:leer» o «clientas:leer».', ctx.requestId);
    }
    let tipos: TipoEvento[] = permitidos;
    const pedidos = sp.get('tipos');
    if (pedidos) {
      const lista = pedidos.split(',').map((t) => t.trim()).filter(Boolean);
      const malos = lista.filter((t) => !esTipoEvento(t));
      if (malos.length) return error(400, 'invalid_request', `Tipo de evento desconocido: ${malos.slice(0, 3).join(', ')}.`, ctx.requestId);
      const sinPermiso = lista.filter((t) => !permitidos.includes(t as TipoEvento));
      if (sinPermiso.length) return error(403, 'insufficient_scope', `Esta credencial no puede ver: ${sinPermiso.slice(0, 3).join(', ')}.`, ctx.requestId);
      tipos = lista as TipoEvento[];
    }
    const despues = decodificarCursorEventos(sp.get('cursor'));
    if (despues === 'invalido') return error(400, 'invalid_request', '`cursor` no es válido: usa el de la cabecera X-Siguiente-Cursor.', ctx.requestId);
    const n = leerLimite(sp.get('limite') ?? sp.get('limit'), 100);

    // El cursor va sobre `publicado`, que se reparte en orden de confirmación
    // (migr 20261001170000): un evento nunca aparece por detrás de otro que ya
    // se haya leído, así que avanzar el cursor no se salta nada.
    let q = admin.from('api_eventos')
      .select('id, publicado, tipo, recurso, recurso_id, studio_id, creado_en, datos')
      .eq('studio_id', ctx.studioId)
      .not('publicado', 'is', null)
      .in('tipo', tipos);
    if (despues !== null) q = q.gt('publicado', despues);
    const { data, error: errBd } = await q.order('publicado', { ascending: true }).limit(n + 1);
    if (errBd) return error(500, 'server_error', 'No se pudo leer el registro de eventos.', ctx.requestId);

    const filas = (data ?? []) as Array<FilaEvento & { publicado: number }>;
    const hayMas = filas.length > n;
    const pagina = hayMas ? filas.slice(0, n) : filas;
    const ultima = pagina.at(-1);
    const siguiente = ultima ? ultima.publicado : despues;
    const headers: Record<string, string> = { 'X-Hay-Mas': String(hayMas) };
    if (siguiente !== null) headers['X-Siguiente-Cursor'] = codificarCursorEventos(siguiente);
    return { status: 200, body: pagina.map(eventoPublico), headers };
  });
}
