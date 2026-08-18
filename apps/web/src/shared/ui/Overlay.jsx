import React from 'react';
import { X } from 'lucide-react';
import { cx } from '@/shared/ui';
import { useExitAnimation } from '@/shared/hooks/useExitAnimation';

/**
 * Banner promocional emergente de la portada.
 *
 * Comparte velo y radio con el resto de diálogos (ver `Modal`), pero se
 * mantiene aparte porque su contenido es una imagen a sangre: no lleva
 * cabecera ni pie, solo la pieza y el botón de cerrar.
 *
 * También comparte el movimiento, y eso importa más aquí que en ningún sitio:
 * es lo primero que ve alguien que acaba de llegar a la portada. Un anuncio que
 * aparece de golpe se lee como una ventana emergente de las que se cierran sin
 * mirar; creciendo desde el centro con el velo, se lee como parte del sitio.
 *
 * Donde sí se separa del resto de diálogos es en la entrada: usa `.anim-pop-blur`
 * en lugar de `.anim-pop`, es decir, entra desenfocado y con una curva de muelle
 * que se pasa un poco de largo y vuelve. Es el único sitio de la aplicación que
 * lo lleva, y el motivo es que es el único que aparece sin que nadie lo haya
 * pedido: el desenfoque que se resuelve dice "esto acaba de llegar", que es
 * justo lo que hay que decir cuando la persona no ha pulsado nada.
 *
 * Al cerrar vuelve al camino común (`.anim-pop-out`). Cerrar sí lo has pedido tú,
 * y ahí lo único que se quiere es que se quite de en medio: nada de muelles.
 */
export default function Overlay({ isOpen, imageUrl, message, onClose }) {
  const hasContent = Boolean(imageUrl || message);
  const { visible, leaving } = useExitAnimation(isOpen && hasContent);

  if (!visible || !hasContent) return null;

  return (
    <div
      className={cx(
        'fixed inset-0 z-50 flex items-center justify-center bg-forest-950/60 p-4 backdrop-blur-sm',
        leaving ? 'anim-fade-out' : 'anim-fade',
      )}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className={cx(
          'relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-raised)]',
          leaving ? 'anim-pop-out' : 'anim-pop-blur',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="press absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-forest-950/60 text-white transition-colors hover:bg-forest-950"
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
