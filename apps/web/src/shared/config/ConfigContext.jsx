import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/shared/api/client';

const ConfigContext = createContext(null);

/**
 * Configuración regional servida por el backend.
 *
 * Ningún componente escribe "Provincia", "$" ni "IVA" a mano: todo eso llega
 * de /api/catalog/config. Cambiar de Ecuador a Estados Unidos es cambiar la
 * región del usuario, no reescribir formularios.
 */
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/catalog/config')
      .then(({ data }) => {
        if (!cancelled) setConfig(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => {
    const region = config?.region;

    return {
      config,
      region,
      error,
      isLoading: !config && !error,

      /** Formatea centavos según la moneda y el locale de la región. */
      money(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return '—';
        if (!region) return (amountInCents / 100).toFixed(2);
        return new Intl.NumberFormat(region.locale, {
          style: 'currency',
          currency: region.currency.code,
          minimumFractionDigits: region.currency.decimals,
        }).format(amountInCents / 100);
      },

      /** Etiqueta local de un campo de dirección (Provincia vs State). */
      addressLabel(field) {
        return region?.address.labels[field] ?? field;
      },

      addressFields() {
        return region?.address.fields ?? [];
      },

      isAddressFieldRequired(field) {
        return region?.address.required.includes(field) ?? false;
      },

      timeWindows() {
        return region?.booking.timeWindows ?? [];
      },

      taxLabel: region?.tax.label ?? 'Impuesto',
      weightUnit: region?.units.weight ?? 'kg',
      areaUnit: region?.units.area ?? 'm2',
      phonePlaceholder: region?.phone.placeholder ?? '',
      phonePrefix: region?.phone.countryCallingCode ?? '',
      minLeadTimeHours: region?.booking.minLeadTimeHours ?? 0,
      freeCancellationHours: region?.booking.freeCancellationHours ?? 0,
    };
  }, [config, error]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig debe usarse dentro de ConfigProvider');
  return context;
}
