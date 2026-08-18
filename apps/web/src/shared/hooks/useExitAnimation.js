import { useEffect, useState } from 'react';

/**
 * Mantiene un elemento en el DOM mientras se despide.
 *
 * El problema que resuelve: en React, `open ? <Modal/> : null` desmonta el
 * diálogo en el mismo fotograma en que se cierra, así que el diálogo entra
 * animado y desaparece de golpe. La asimetría se nota aunque no se sepa
 * nombrar — abrir se siente cuidado y cerrar se siente roto.
 *
 * Devuelve dos cosas: si hay que pintar algo (`visible`) y si lo que se pinta se
 * está yendo (`leaving`), que es lo que elige entre `.anim-pop` y `.anim-pop-out`.
 *
 * Es interrumpible: si se vuelve a abrir a mitad de la despedida, se cancela el
 * temporizador y el elemento se queda. Volver a pulsar nunca deja el diálogo a
 * medio desaparecer.
 *
 * `durationMs` tiene que coincidir con la duración de la clase de salida que use
 * el componente; si se queda corta, el elemento se desmonta antes de terminar.
 *
 * El cambio de fase se calcula durante el render comparando `open` con lo que se
 * pintó la vez anterior. Es el patrón que React documenta para ajustar estado
 * cuando cambia una propiedad, y aquí encaja porque cerrar es un dato que ya se
 * conoce al renderizar: no hace falta esperar a un efecto para saberlo. Hacerlo
 * en un efecto costaría un render en cascada por cada apertura y cada cierre.
 *
 * Lo único que de verdad tiene que esperar es el desmontaje, y para eso está el
 * temporizador.
 */
export function useExitAnimation(open, durationMs = 180) {
  const [renderedOpen, setRenderedOpen] = useState(open);
  const [phase, setPhase] = useState(open ? 'open' : 'closed');

  if (open !== renderedOpen) {
    setRenderedOpen(open);
    setPhase(open ? 'open' : 'leaving');
  }

  useEffect(() => {
    if (open || phase !== 'leaving') return undefined;

    const timer = setTimeout(() => setPhase('closed'), durationMs);
    return () => clearTimeout(timer);
  }, [open, phase, durationMs]);

  return { visible: phase !== 'closed', leaving: phase === 'leaving' };
}
