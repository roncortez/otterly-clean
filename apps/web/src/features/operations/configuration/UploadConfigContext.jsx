import { createContext, useContext } from 'react';
import { useApiQuery } from '@/shared/api/useApiQuery';

const UploadConfigContext = createContext(null);

/**
 * Capacidades de subida de imágenes, consultadas una sola vez.
 *
 * Todos los campos de imagen de la sección necesitan lo mismo: si hay
 * almacenamiento configurado, cuánto puede pesar un archivo y qué formatos se
 * admiten. Si cada campo lo preguntara por su cuenta serían cinco peticiones
 * idénticas al abrir la pantalla.
 */
const DISABLED = Object.freeze({
  enabled: false,
  maxBytes: 5 * 1024 * 1024,
  acceptedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
});

export function UploadConfigProvider({ children }) {
  const { data } = useApiQuery('/operations/uploads/config');

  // Mientras carga se asume "sin subida": la pantalla muestra el campo de URL
  // y pasa al selector de archivo en cuanto llega la respuesta. Es preferible a
  // dejar el formulario en blanco esperando.
  return (
    <UploadConfigContext.Provider value={data?.uploads ?? DISABLED}>
      {children}
    </UploadConfigContext.Provider>
  );
}

export function useUploadConfig() {
  return useContext(UploadConfigContext) ?? DISABLED;
}
