import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DoorOpen, MapPin, Plus, Trash2, Star, Pencil } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Button, Card, EmptyState, PageHeader, Spinner } from '@/shared/ui';
import AddressForm from './AddressForm';

/**
 * Direcciones del cliente.
 *
 * Cada dirección son dos cosas: un punto en el mapa y un texto que el cliente
 * escribe y corrige (ver `AddressForm`). El punto es lo que permite encontrar
 * la casa; el texto, lo que ningún mapa sabe de las urbanizaciones de Quito.
 *
 * Si la ubicación cae fuera de las zonas donde trabajamos, la dirección se
 * guarda igual —puede ser la casa de un familiar— pero se avisa: reservar sobre
 * ella lo rechaza el backend.
 */
export default function AddressesPage() {
  const { region } = useConfig();

  // null = formulario cerrado; 'new' = alta; un objeto = edición.
  const [editing, setEditing] = useState(null);
  const [outOfArea, setOutOfArea] = useState(false);

  const addressQuery = useApiQuery('/customer/addresses');
  const { busy: saving, error: actionError, execute } = useApiAction();

  const addresses = addressQuery.data?.addresses ?? [];
  const error = addressQuery.error ?? actionError;

  async function handleSubmit(payload) {
    const isEdit = editing && editing !== 'new';

    await execute(
      () =>
        isEdit
          ? api.patch(`/customer/addresses/${editing.id}`, payload)
          : api.post('/customer/addresses', payload),
      {
        onSuccess: (result) => {
          setOutOfArea(result?.data?.serviceArea?.covered === false);
          setEditing(null);
          addressQuery.reload();
        },
      },
    );
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Quitar esta dirección? Los servicios anteriores la conservan.')) return;
    await execute(() => api.delete(`/customer/addresses/${id}`), { onSuccess: addressQuery.reload });
  }

  async function handleSetDefault(id) {
    await execute(() => api.patch(`/customer/addresses/${id}`, { isDefault: true }), {
      onSuccess: addressQuery.reload,
    });
  }

  if (addressQuery.loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Mi cuenta"
        title="Tus direcciones"
        description="Los lugares donde vas a recibirnos. Sirven para cualquier servicio: limpiar, recoger tu ropa y lo que venga."
        action={
          !editing && (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden="true" />
              Agregar
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {outOfArea && !editing && (
        <div className="mb-5">
          <Alert tone="warning" title="Guardada, pero fuera de nuestra zona">
            Todavía no damos servicio en esa ubicación. Puedes conservarla para más adelante.
          </Alert>
        </div>
      )}

      {editing && (
        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-bold tracking-tight text-text">
            {editing === 'new' ? 'Nueva dirección' : 'Editar dirección'}
          </h2>

          <AddressForm
            address={editing === 'new' ? null : editing}
            submitting={saving}
            submitLabel={editing === 'new' ? 'Guardar dirección' : 'Guardar cambios'}
            onSubmit={handleSubmit}
            onCancel={() => setEditing(null)}
          />
        </Card>
      )}

      {addresses.length === 0 && !editing ? (
        <EmptyState
          icon={MapPin}
          title="Todavía no tienes direcciones"
          description="Agrega una para poder reservar tu primer servicio."
          action={<Button onClick={() => setEditing('new')}>Agregar dirección</Button>}
        />
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <Card key={address.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-600">
                    <MapPin className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-text">
                      {address.label}
                      {address.is_default && (
                        <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-700">
                          Predeterminada
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {[address.street_line1, address.street_line2].filter(Boolean).join(' · ')}
                    </p>
                    <p className="text-sm text-text-subtle">
                      {[address.neighborhood, address.city, address.administrative_area]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {address.reference && (
                      <p className="mt-1 text-sm text-text-subtle italic">{address.reference}</p>
                    )}
                    {address.latitude && address.longitude ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-forest-700">
                        <MapPin className="size-3" aria-hidden="true" />
                        Ubicación marcada en el mapa
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-text-subtle">
                        Sin punto en el mapa: edítala para marcarlo.
                      </p>
                    )}

                    {/*
                      Una dirección dice dónde. Lo que hay que saber para limpiar
                      ahí —habitaciones, baños, cómo se entra— es el lugar, y se
                      edita en su pestaña: esto es la puerta, no un segundo
                      formulario aquí.
                    */}
                    <Link
                      to={`/mi-perfil/lugares?direccion=${address.id}`}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-forest-700 hover:underline"
                    >
                      <DoorOpen className="size-3.5" aria-hidden="true" />
                      {address.property
                        ? 'Ver qué limpiamos aquí'
                        : 'Añadir qué limpiamos aquí'}
                    </Link>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(address)}
                    className="rounded-full p-2 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-forest-600"
                    aria-label="Editar dirección"
                    title="Editar"
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </button>
                  {!address.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(address.id)}
                      className="rounded-full p-2 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-forest-600"
                      aria-label="Marcar como predeterminada"
                      title="Marcar como predeterminada"
                    >
                      <Star className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(address.id)}
                    className="rounded-full p-2 text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label="Quitar dirección"
                    title="Quitar"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {region && (
        <p className="mt-6 text-center text-xs text-text-subtle">
          Operamos en {region.name}. Los campos se ajustan al formato local.
        </p>
      )}
    </div>
  );
}
