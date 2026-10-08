-- El bucket de la demo admitía 50 MB; se sube a 150 MB por si el proyecto pasa a un plan con un tope
-- global mayor. HOY el tope global del plan gratuito (50 MB por fichero) manda sobre este: el vídeo
-- se publica en su versión web de < 50 MB (demo/montar.mjs). Ya aplicada en producción.
update storage.buckets set file_size_limit = 157286400 where id = 'demo-configuracion';
