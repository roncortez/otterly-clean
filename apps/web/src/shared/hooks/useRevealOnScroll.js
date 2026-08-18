import { useEffect, useRef } from 'react';

/**
 * Marca los elementos `.reveal` de un contenedor cuando entran en pantalla.
 *
 * Devuelve una `ref` que se pone en la sección; todo lo que lleve la clase
 * `.reveal` dentro de ella aparece al llegar a la altura de lectura. El estilo
 * vive en `index.css`: aquí solo se decide *cuándo*.
 *
 * Dos decisiones que separan un aparecer agradable de uno molesto:
 *
 *   · Se dispara una sola vez por elemento (`unobserve` al entrar). Volver a
 *     animar cada vez que la sección cruza el borde convierte la página en algo
 *     que pelea con quien la está leyendo.
 *   · El margen inferior negativo hace que el elemento empiece a aparecer un
 *     poco antes de llegar al borde, no justo encima de él, que es cuando se
 *     nota que es un truco.
 *
 * Sin `IntersectionObserver` —o con el movimiento reducido activado— el
 * contenido se muestra de entrada: la portada nunca depende de la animación
 * para poder leerse.
 */
export function useRevealOnScroll({ threshold = 0.15, rootMargin = '0px 0px -12% 0px' } = {}) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const targets = container.querySelectorAll('.reveal');
    if (!targets.length) return undefined;

    const show = (element) => element.setAttribute('data-visible', 'true');

    if (typeof IntersectionObserver === 'undefined') {
      targets.forEach(show);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          show(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold, rootMargin },
    );

    targets.forEach((target) => {
      /* Lo que ya está en pantalla al cargar no espera a un desplazamiento que
         puede no llegar nunca: se muestra y no se observa. */
      const box = target.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) show(target);
      else observer.observe(target);
    });

    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return containerRef;
}
