import React from 'react';
import { X } from 'lucide-react';

export default function Overlay({ isOpen, imageUrl, message, onClose }) {
  if (!isOpen || (!imageUrl && !message)) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl transition-all">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-slate-900"
        >
          <X className="h-4 w-4" />
        </button>

        {imageUrl && (
          <img
            src={imageUrl}
            alt="Anuncio Promocional"
            className="max-h-80 w-full object-cover"
          />
        )}

        {message && (
          <div className="p-6 text-center">
            <p className="text-base font-medium text-slate-800">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
