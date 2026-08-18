import { useEffect, useId, useRef, useState } from 'react';
import { Loader2, MapPin, RotateCw, Search } from 'lucide-react';
import { cx, CONTROL_CLASS, CONTROL_HEIGHT } from '@/shared/ui';
import { useDebounced } from '@/shared/hooks/useDebounced';
import { SEARCH } from './config';
import { autocomplete } from './geoapify';

/**
 * Buscador de direcciones.
 *
 * Escribir "Conocoto" o "San Luis Shopping" tiene que bastar para colocar el
 * pin. Lo que se ve es un campo con sugerencias; lo que se cuida es la cuota:
 *
 *   * no se consulta por cada tecla, sino cuando la escritura se detiene;
 *   * no se consulta con menos de tres caracteres, porque "av" no distingue
 *     nada y gasta lo mismo que una búsqueda útil;
 *   * la petición anterior se cancela al escribir otra;
 *   * elegir un resultado no dispara una búsqueda nueva por rellenar el campo.
 *
 * Los resultados se sesgan hacia donde la empresa opera —eso llega del backend
 * y sale de `service_zones`—, pero se puede buscar fuera: quien decide si
 * atendemos una ubicación es el servidor, no este campo.
 */
export default function AddressAutocomplete({ bias, countryCode, onSelect, className }) {
  const inputId = useId();
  const listId = useId();

  const [text, setText] = useState('');
  const [results, setResults] = useState([]);
  // idle | loading | ready | error
  const [status, setStatus] = useState('idle');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [retry, setRetry] = useState(0);

  const debounced = useDebounced(text.trim(), SEARCH.debounceMs);

  /**
   * Último texto ya consultado. Evita repetir la misma petición cuando el campo
   * se rellena con el nombre del resultado elegido: sin esto, cada selección
   * gastaría una búsqueda de más para devolver lo que ya está en pantalla.
   */
  const queriedRef = useRef('');

  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const latitude = bias?.center?.latitude ?? null;
  const longitude = bias?.center?.longitude ?? null;

  /**
   * Lo que se ve al escribir se decide aquí, en el evento, y no dentro del
   * efecto: el efecto solo lanza la petición cuando la escritura ya se detuvo.
   * Así la interfaz responde a la tecla y la red no.
   */
  function handleChange(event) {
    const next = event.target.value;
    setText(next);

    const trimmed = next.trim();
    if (trimmed.length < SEARCH.minLength) {
      queriedRef.current = '';
      setResults([]);
      setStatus('idle');
      setOpen(false);
      return;
    }

    if (trimmed !== queriedRef.current) {
      setStatus('loading');
      setOpen(true);
    }
  }

  useEffect(() => {
    if (debounced.length < SEARCH.minLength) return undefined;
    if (debounced === queriedRef.current) return undefined;

    const controller = new AbortController();

    autocomplete(debounced, {
      bias: latitude === null ? null : { center: { latitude, longitude } },
      countryCode,
      signal: controller.signal,
    })
      .then((found) => {
        queriedRef.current = debounced;
        setResults(found);
        setHighlighted(-1);
        setStatus('ready');
      })
      .catch((error) => {
        if (error?.name === 'AbortError') return;
        setResults([]);
        setStatus('error');
      });

    return () => controller.abort();
  }, [debounced, latitude, longitude, countryCode, retry]);

  function choose(suggestion) {
    // El campo muestra lo elegido, pero no vuelve a buscarlo.
    queriedRef.current = suggestion.formatted || suggestion.title;
    setText(queriedRef.current);
    setResults([]);
    setOpen(false);
    setHighlighted(-1);
    onSelectRef.current?.(suggestion);
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlighted((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((current) => (current <= 0 ? results.length - 1 : current - 1));
    } else if (event.key === 'Enter' && highlighted >= 0) {
      // Solo intercepta el Enter cuando hay una sugerencia marcada: si no, el
      // formulario que envuelve esto se enviaría al pulsarlo.
      event.preventDefault();
      choose(results[highlighted]);
    }
  }

  const showPanel = open && debounced.length >= SEARCH.minLength;

  return (
    <div className={cx('relative', className)}>
      <label
        htmlFor={inputId}
        className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-text"
      >
        <Search className="size-4 text-text-subtle" aria-hidden="true" />
        Buscar dirección o lugar
      </label>

      <div className="relative">
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Conocoto, San Luis Shopping, Av. Ilaló…"
          // Mismo aspecto que cualquier otro campo, sin poder ser un `<Input>`:
          // este lleva su propio `role="combobox"` y su panel de resultados.
          className={cx(CONTROL_CLASS, CONTROL_HEIGHT, 'pr-9')}
        />
        {status === 'loading' && (
          <Loader2
            className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-text-subtle"
            aria-hidden="true"
          />
        )}
      </div>

      {/*
        El panel crece desde el borde superior, que es donde está el campo del
        que sale. Es la diferencia entre un panel que parece desplegarse del
        buscador y uno que parece caído encima de la página: el `transform-origin`
        por defecto en CSS es el centro, y desde el centro un desplegable se abre
        también hacia arriba, hacia el campo, que es justo lo contrario de lo que
        acaba de pasar.

        Es corto (200 ms) porque se abre mientras se escribe: se ve muchas veces
        seguidas en la misma búsqueda.
      */}
      {showPanel && (
        <div className="anim-panel absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <ul id={listId} role="listbox" aria-label="Resultados de la búsqueda">
            {results.map((suggestion, index) => (
              <li key={suggestion.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  // `mousedown` y no `click`: el campo pierde el foco antes de
                  // que llegue el click y la lista ya se habría cerrado.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(suggestion);
                  }}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cx(
                    'flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors',
                    index === highlighted ? 'bg-surface-sunken' : 'hover:bg-surface-sunken',
                  )}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-text">{suggestion.title}</span>
                    {suggestion.subtitle && (
                      <span className="block truncate text-xs text-text-subtle">
                        {suggestion.subtitle}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {status === 'loading' && results.length === 0 && (
            <p className="px-3.5 py-2.5 text-sm text-text-subtle">Buscando…</p>
          )}

          {status === 'ready' && results.length === 0 && (
            <p className="px-3.5 py-2.5 text-sm text-text-subtle">
              Sin resultados. Marca el punto en el mapa o escribe la dirección abajo.
            </p>
          )}

          {status === 'error' && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5">
              <p className="text-sm text-text-muted">No pudimos buscar ahora mismo.</p>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setStatus('loading');
                  setRetry((current) => current + 1);
                }}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-forest-700 transition-colors hover:bg-surface-sunken"
              >
                <RotateCw className="size-3.5" aria-hidden="true" />
                Reintentar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
