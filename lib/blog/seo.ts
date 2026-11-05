// Los `alternates` de cada página del blog: su canonical y el RSS (un `alternates` de página sustituye al del layout, no se
// fusiona, así que el RSS se repite en cada una). Sin alias `@/`.

import { LEGAL } from '../legal-info.ts';
import { URL_BLOG } from './autor.ts';

export const alternatesBlog = (ruta: string) => ({
  canonical: `${LEGAL.url}${ruta}`,
  types: { 'application/rss+xml': `${URL_BLOG}/feed.xml` },
});
