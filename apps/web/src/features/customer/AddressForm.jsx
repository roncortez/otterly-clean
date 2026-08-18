import { useMemo, useState } from 'react';
import { MapPin, RefreshCw } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';
import LocationPicker from '@/shared/maps/LocationPicker';
import { Alert, Button, Card, Checkbox, Field, Input } from '@/shared/ui';

/**
 * Dirección del cliente: punto en el mapa + texto editable.
 *
 * Las dos mitades hacen falta y ninguna sustituye a la otra. El mapa da la
 * coordenada con la que el profesional encuentra la casa; el texto da lo que
 * ningún mapa sabe: "Urbanización Los Jardines, casa 18, junto al parque".
 *
 * De ahí la regla de este formulario: **el mapa propone, la persona dispone.**
 * Una sugerencia solo entra cuando hay una acción explícita —elegir un
 * resultado del buscador, mover el pin, pedir la ubicación actual o pulsar
 * "Usar la dirección del mapa"—, y aun así respeta lo que ya se corrigió a
 * mano, salvo que se pida expresamente sobrescribirlo.
 *
 * Los campos y sus etiquetas los pone la configuración regional: "Provincia" en
 * Ecuador, "State" en Estados Unidos. Aquí no hay ningún nombre de país escrito.
 */

/** Campos que el mapa puede proponer. El resto es siempre del cliente. */
const GEOCODED_FIELDS = ['streetLine1', 'neighborhood', 'city', 'administrativeArea', 'postalCode'];

/**
 * El nombre nace vacío a propósito.
 *
 * Antes venía puesto como "Casa", y el resultado era una lista de direcciones
 * llamadas "Casa, Casa, Casa" en la que no se distinguía el departamento propio
 * de la casa de los padres. Es el nombre con el que la persona reconocerá el
 * lugar al reservar, así que lo escribe ella; hay sugerencias para que no cueste.
 */
const EMPTY = {
  label: '',
  streetLine1: '',
  streetLine2: '',
  neighborhood: '',
  city: '',
  administrativeArea: '',
  postalCode: '',
  reference: '',
  isDefault: false,
};

/** Nombres frecuentes, para no tener que pensarlo. Ninguno se aplica solo. */
const LABEL_SUGGESTIONS = ['Mi casa', 'Mi departamento', 'Oficina', 'Casa de mis padres'];

function addressToForm(address) {
  if (!address) return { ...EMPTY };
  return {
    label: address.label ?? '',
    streetLine1: address.street_line1 ?? '',
    streetLine2: address.street_line2 ?? '',
    neighborhood: address.neighborhood ?? '',
    city: address.city ?? '',
    administrativeArea: address.administrative_area ?? '',
    postalCode: address.postal_code ?? '',
    reference: address.reference ?? '',
    isDefault: Boolean(address.is_default),
  };
}

export default function AddressForm({
  address = null,
  submitting = false,
  error = null,
  submitLabel = 'Guardar dirección',
  onSubmit,
  onCancel,
}) {
  const { config, region, addressLabel, isAddressFieldRequired } = useConfig();

  const [form, setForm] = useState(() => addressToForm(address));
  // La referencia del lugar acompaña a la coordenada, pero no la sustituye: si
  // el proveedor no la da, la dirección se guarda igual.
  const [location, setLocation] = useState(() => ({
    latitude: address?.latitude ? Number(address.latitude) : null,
    longitude: address?.longitude ? Number(address.longitude) : null,
    providerPlaceId: address?.provider_place_id ?? null,
    geocodingProvider: address?.geocoding_provider ?? null,
  }));
  // Lo que la persona escribió a mano. Es lo único que protege sus
  // correcciones de la siguiente sugerencia del mapa.
  const [editedByHand, setEditedByHand] = useState(() => new Set());
  const [suggestion, setSuggestion] = useState(null);

  const hasPoint = location.latitude !== null && location.longitude !== null;

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setEditedByHand((current) => new Set(current).add(key));
  };

  /** Vuelca una propuesta sobre el formulario. */
  function applySuggestion(fields, { overwriteEdited }) {
    if (!fields) return;
    setForm((current) => {
      const next = { ...current };
      for (const key of GEOCODED_FIELDS) {
        const proposed = fields[key];
        if (!proposed) continue;
        // Sin `overwriteEdited`, lo tecleado a mano se queda como está.
        if (!overwriteEdited && editedByHand.has(key)) continue;
        next[key] = proposed;
      }
      return next;
    });
  }

  function handleSelect({ coordinates, placeId, provider, fields, source }) {
    setLocation({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      providerPlaceId: placeId ?? null,
      geocodingProvider: placeId ? (provider ?? null) : null,
    });
    setSuggestion(fields);

    // Elegir otro lugar en el buscador es cambiar de dirección: ahí sí se
    // reescribe todo. Mover el pin es afinar la posición de la misma casa, así
    // que solo se rellena lo que siga vacío o venga del propio mapa.
    applySuggestion(fields, { overwriteEdited: source === 'SEARCH' });
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({
      label: form.label.trim(),
      streetLine1: form.streetLine1.trim(),
      streetLine2: form.streetLine2.trim() || null,
      neighborhood: form.neighborhood.trim() || null,
      city: form.city.trim(),
      administrativeArea: form.administrativeArea.trim() || null,
      postalCode: form.postalCode.trim() || null,
      reference: form.reference.trim() || null,
      latitude: location.latitude,
      longitude: location.longitude,
      providerPlaceId: location.providerPlaceId,
      geocodingProvider: location.geocodingProvider,
      isDefault: form.isDefault,
    });
  }

  const summary = useMemo(
    () =>
      [form.streetLine1, form.streetLine2, form.neighborhood, form.city, form.administrativeArea]
        .filter(Boolean)
        .join(', '),
    [form],
  );

  const showPostalCode = region?.address?.postalCodeRequired || form.postalCode;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div>
        <p className="text-sm font-medium text-text">¿Dónde necesitas el servicio?</p>
        <p className="mt-0.5 mb-3 text-xs text-text-subtle">
          Busca el lugar o marca el punto exacto. Después puedes corregir la dirección escrita.
        </p>

        <LocationPicker
          value={location}
          bias={config?.maps?.bias}
          regionCode={config?.maps?.regionCode ?? 'ec'}
          onSelect={handleSelect}
        />
      </div>

      {/*
        La confirmación de la ubicación aparece al elegir un punto en el mapa, y
        empuja el formulario hacia abajo. Entrando se entiende que llegó algo
        nuevo; sin movimiento, los campos de abajo dan un salto y parece que se
        movió el formulario, no que se confirmó la dirección.
      */}
      {hasPoint ? (
        <Card className="anim-rise flex flex-wrap items-center justify-between gap-3 border-forest-100 bg-forest-50/60 p-3.5">
          <p className="flex items-start gap-2 text-sm text-forest-700">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-medium">Ubicación seleccionada</span>
              <span className="mt-0.5 block text-xs text-forest-700/80 tnum">
                {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
              </span>
            </span>
          </p>

          {suggestion ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => applySuggestion(suggestion, { overwriteEdited: true })}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Usar la dirección del mapa
            </Button>
          ) : null}
        </Card>
      ) : null}

      <div className="space-y-4">
        <div>
          <Field label="¿Cómo llamas a este lugar?" hint="Así lo verás al reservar." required>
            <Input
              required
              value={form.label}
              onChange={update('label')}
              placeholder="Mi departamento"
              maxLength={60}
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LABEL_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setForm((current) => ({ ...current, label: suggestion }))}
                className="press rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <Field label={addressLabel('street_address')} required={isAddressFieldRequired('street_address')}>
          <Input
            required={isAddressFieldRequired('street_address')}
            value={form.streetLine1}
            onChange={update('streetLine1')}
            placeholder="Av. Ilaló y Los Cipreses"
          />
        </Field>

        <Field
          label="Edificio, conjunto o departamento"
          hint="Lo que el mapa no sabe: número de casa, torre, piso."
        >
          <Input
            value={form.streetLine2}
            onChange={update('streetLine2')}
            placeholder="Urbanización Los Jardines, casa 18"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={addressLabel('dependent_locality')}>
            <Input value={form.neighborhood} onChange={update('neighborhood')} />
          </Field>

          <Field label={addressLabel('locality')} required={isAddressFieldRequired('locality')}>
            <Input
              required={isAddressFieldRequired('locality')}
              value={form.city}
              onChange={update('city')}
            />
          </Field>

          <Field
            label={addressLabel('administrative_area')}
            required={isAddressFieldRequired('administrative_area')}
          >
            <Input
              required={isAddressFieldRequired('administrative_area')}
              value={form.administrativeArea}
              onChange={update('administrativeArea')}
            />
          </Field>

          {showPostalCode ? (
            <Field label="Código postal" required={isAddressFieldRequired('postal_code')}>
              <Input
                required={isAddressFieldRequired('postal_code')}
                value={form.postalCode}
                onChange={update('postalCode')}
              />
            </Field>
          ) : null}
        </div>

        <Field label="Referencia para llegar" hint="Cómo reconocer el lugar al llegar.">
          <Input
            value={form.reference}
            onChange={update('reference')}
            placeholder="Portón verde, junto al parque. Timbre 2."
          />
        </Field>

        <Checkbox
          label="Usar como predeterminada"
          checked={form.isDefault}
          onChange={update('isDefault')}
        />
      </div>

      {summary ? (
        <p className="text-xs text-text-subtle">
          Se guardará como: <span className="text-text-muted">{summary}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
