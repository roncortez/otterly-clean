import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * El contenedor de MapLibre no se toca desde React.
 *
 * MapLibre no dibuja dentro del nodo que se le da: le añade la clase
 * `maplibregl-map` con `classList.add` y cuelga de ella el `position: relative`
 * que ancla el lienzo, los controles de zoom y la atribución. Esa clase la pone
 * la librería después del montaje, así que React no la conoce.
 *
 * De ahí la regla que fija esta prueba: la `className` del nodo del mapa tiene
 * que ser constante. En cuanto depende del estado —pasó de verdad, con el
 * fundido de entrada: `opacity-0` → `opacity-100` al cargar—, React reescribe el
 * atributo entero en el render siguiente y borra `maplibregl-map`. El resultado
 * no es un mapa un poco descolocado: el mapa se va a la esquina superior
 * izquierda de la ventana, la atribución a la inferior derecha, y donde tenía
 * que estar el mapa queda un rectángulo gris vacío.
 *
 * Es un fallo que no da ningún error y que solo se ve mirando la pantalla, por
 * eso queda escrito aquí.
 */

/** Un doble de MapLibre que hace lo único que importa para esta prueba. */
const fakeMap = vi.hoisted(() => ({ handlers: {}, container: null }));

vi.mock('maplibre-gl', () => {
  class Map {
    constructor({ container }) {
      fakeMap.container = container;
      // Esto es lo que hace MapLibre de verdad, y lo que React puede pisar.
      container.classList.add('maplibregl-map');
      fakeMap.handlers = {};
    }

    on(event, handler) {
      fakeMap.handlers[event] = handler;
    }

    addControl() {}
    getZoom() {
      return 12;
    }
    setCenter() {}
    easeTo() {}
    remove() {}
  }

  class Marker {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
    getLngLat() {
      return { lat: 0, lng: 0 };
    }
    on() {
      return this;
    }
  }

  class NavigationControl {}

  return { Map, Marker, NavigationControl };
});

// El worker y el CSS de MapLibre no aportan nada en jsdom.
vi.mock('@/shared/maps/worker', () => ({}));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));

const { default: MapCanvas } = await import('./MapCanvas');

describe('MapCanvas', () => {
  it('conserva la clase que MapLibre añade cuando el mapa termina de cargar', async () => {
    render(<MapCanvas point={{ latitude: -0.2, longitude: -78.5 }} />);

    const node = screen.getByRole('application');
    expect(node).toHaveClass('maplibregl-map');

    // Cargar es justo lo que cambia el estado y provoca el render siguiente.
    fakeMap.handlers.load?.();

    await waitFor(() => {
      // El fundido ocurre, pero en el envoltorio.
      expect(node.parentElement).toHaveClass('opacity-100');
    });

    // Y el nodo del mapa sigue siendo suyo.
    expect(node).toHaveClass('maplibregl-map');
  });
});
