import { Package, ShoppingBag } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import WhatsAppButton from '@/shared/ui/WhatsAppButton';
import { Alert, Card, EmptyState, PageHeader, Spinner } from '@/shared/ui';

/**
 * Catálogo de productos.
 *
 * Es un escaparate, no una tienda: se mira y se pregunta. No hay carrito ni
 * pago porque todavía no existe el flujo de pedido, y fingirlo con un botón
 * «Comprar» que no cobra sería peor que no tenerlo. Mientras tanto el pedido se
 * cierra por WhatsApp, que es como ya funciona el resto del negocio.
 *
 * El listado viene del backend (`GET /api/catalog/products`), no de un array en
 * este archivo: los precios y las altas se cambian en la base sin desplegar.
 */
export default function ProductsPage() {
  const { money, company } = useConfig();
  const { data, loading, error } = useApiQuery('/catalog/products');

  if (loading) return <Spinner label="Cargando productos" />;
  if (error) return <Alert tone="danger">{error}</Alert>;

  const categories = data?.categories ?? [];
  const total = data?.products?.length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Productos"
        title="Los productos que usamos"
        description="Los mismos insumos con los que limpiamos, para que los tengas en casa entre servicio y servicio."
      />

      {total === 0 ? (
        <EmptyState
          icon={Package}
          title="Todavía no hay productos publicados"
          description="Estamos preparando el catálogo. Vuelve pronto."
        />
      ) : (
        <div className="space-y-10">
          {categories.map((category) => (
            <section key={category.name ?? 'otros'}>
              {category.name && (
                <h2 className="mb-4 text-sm font-semibold tracking-[0.14em] text-forest-700 uppercase">
                  {category.name}
                </h2>
              )}

              <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {category.items.map((product) => (
                  <Card key={product.id} interactive className="flex flex-col overflow-hidden">
                    {/*
                      La imagen es opcional: el catálogo arranca sin fotos y una
                      tarjeta rota por un `src` vacío se vería peor que un icono.
                    */}
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-36 w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-36 items-center justify-center bg-forest-50 text-forest-300">
                        <Package className="size-9" aria-hidden="true" />
                      </div>
                    )}

                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="font-bold tracking-tight text-text">{product.name}</h3>
                      {product.description && (
                        <p className="mt-1.5 flex-1 text-sm leading-relaxed text-text-muted">
                          {product.description}
                        </p>
                      )}
                      <p className="mt-4 text-lg font-extrabold text-forest-700 tnum">
                        {money(product.amount)}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}

          <Card className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700">
                <ShoppingBag className="size-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-medium text-text">¿Quieres pedir alguno?</p>
                <p className="mt-0.5 text-sm text-text-muted">
                  Escríbenos y lo coordinamos con tu próximo servicio.
                </p>
              </div>
            </div>
            <WhatsAppButton
              label="Preguntar por WhatsApp"
              message={`Hola ${company?.name ?? ''}, me interesan algunos productos del catálogo.`}
              size="md"
            />
          </Card>
        </div>
      )}
    </div>
  );
}
