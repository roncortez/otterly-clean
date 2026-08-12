import React from 'react';
import { X } from 'lucide-react';

/**
 * Banner promocional emergente de la portada.
 *
 * Comparte velo y radio con el resto de diálogos (ver `Modal`), pero se
 * mantiene aparte porque su contenido es una imagen a sangre: no lleva
 * cabecera ni pie, solo la pieza y el botón de cerrar.
 */
export default function Overlay({ isOpen, imageUrl, message, onClose }) {
  if (!isOpen || (!imageUrl && !message)) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-raised)]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-forest-950/60 text-white transition-colors hover:bg-forest-950"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        {imageUrl && (
          <img src={imageUrl} alt="Anuncio promocional" className="max-h-80 w-full object-cover" />
        )}

        {message && (
          <div className="p-6 text-center">
            <p className="text-base font-medium text-text">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
