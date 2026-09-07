import { registerHooks } from 'node:module';

// Hook de resolución solo para `node --test`: sustituye 'server-only' por un
// módulo vacío — nunca toca la resolución de `react` ni de nada más.
//
// Por qué hace falta: `server-only` decide si tira (index.js) o no hace nada
// (empty.js) mirando la condición de exports 'react-server', que Next.js
// activa al compilar un módulo de servidor. `node --test` no pasa por el
// bundler de Next — así que cualquier fichero bajo test que importe (directa
// o transitivamente) un módulo con `import 'server-only'` revienta con "This
// module cannot be imported from a Client Component module", aunque el
// fichero de test no tenga nada que ver con React ni con clientes
// (lib/billing/billing-rules.ts, primer caso real: P-7, 26ª pasada, al
// añadir `server-only` a lib/db/supabase-admin.ts).
//
// La alternativa obvia, `node --conditions=react-server`, se probó primero y
// se descartó: ese flag es GLOBAL y también cambia la resolución de `react`
// (que define su propia condición 'react-server' para React Server
// Components), así que cualquier test que importe algo con
// `react.createContext` (p.ej. lucide-react, vía un componente) revienta con
// "createContext is not a function" — 5 ficheros nuevos en rojo, medido.
// Este hook es quirúrgico: solo intercepta el especificador exacto
// 'server-only'.
//
// No se reutiliza `server-only/empty.js` directamente (Node bloquea esa
// subruta: el `exports` del paquete solo declara ".") — se devuelve un
// módulo síntetico propio, vacío, en su lugar.
const ESPECIFICADOR_VIRTUAL = 'server-only-noop:virtual';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'server-only') {
      return { url: ESPECIFICADOR_VIRTUAL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === ESPECIFICADOR_VIRTUAL) {
      return { format: 'module', source: '', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
