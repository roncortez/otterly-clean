import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function ingredientGroups(ingredients) {
  return {
    proteinas: ingredients.filter((ingredient) => Number(ingredient.tipo_id) === 1),
    ensaladas: ingredients.filter((ingredient) => Number(ingredient.tipo_id) === 2),
    salsas: ingredients.filter((ingredient) => Number(ingredient.tipo_id) === 3),
    sabores: ingredients.filter((ingredient) => Number(ingredient.tipo_id) === 4),
    cocteles: ingredients.filter((ingredient) => Number(ingredient.tipo_id) === 5 && ingredient.activo !== false),
  };
}

function sameIngredients(a, b) {
  return JSON.stringify(a || []) === JSON.stringify(b || []);
}

function CustomizationModal({ item, ingredients, onClose, onAdd }) {
  const [selectedIngredients, setSelectedIngredients] = useState({});
  const groups = useMemo(() => ingredientGroups(ingredients), [ingredients]);
  const selectedCount = Object.values(selectedIngredients).flat().length;

  if (!item) return null;

  const toggleIngredient = (ingredient, groupKey) => {
    setSelectedIngredients((current) => {
      const currentGroup = current[groupKey] || [];
      const isSelected = currentGroup.some((selected) => selected.id === ingredient.id);

      if (isSelected) {
        return {
          ...current,
          [groupKey]: currentGroup.filter((selected) => selected.id !== ingredient.id),
        };
      }

      const totalSelected = Object.values(current).flat().length;
      const combination = Number(item.tipo_combinacion);

      if (combination === 1 && currentGroup.length >= 2) return current;
      if (combination === 2 && totalSelected >= 2) return current;
      if (combination === 3 && totalSelected >= 3) return current;
      if (combination === 5 && totalSelected >= 1) return current;

      return {
        ...current,
        [groupKey]: [...currentGroup, ingredient],
      };
    });
  };

  const renderGroup = (title, groupKey, list) => (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-gray-800">{title}</h3>
      <div className="grid gap-1">
        {list.map((ingredient) => (
          <label key={ingredient.id} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={(selectedIngredients[groupKey] || []).some((selected) => selected.id === ingredient.id)}
              onChange={() => toggleIngredient(ingredient, groupKey)}
            />
            {ingredient.nombre}
          </label>
        ))}
      </div>
    </div>
  );

  const addCustomizedItem = () => {
    const selected = Object.values(selectedIngredients).flat();
    onAdd(item, selected);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Personalizar plato</h2>
            <p className="mt-1 text-sm text-gray-500">{item.nombre}</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[180px_1fr]">
          <img src={item.image_url} alt={item.nombre} className="h-40 w-full rounded-lg object-cover" />
          <div className="grid gap-3">
            {Number(item.tipo_ingrediente) === 1 && (
              <>
                {renderGroup("Proteínas", "proteinas", groups.proteinas)}
                {renderGroup("Ensaladas", "ensaladas", groups.ensaladas)}
              </>
            )}
            {Number(item.tipo_ingrediente) === 2 && renderGroup("Salsas", "salsas", groups.salsas)}
            {Number(item.tipo_ingrediente) === 3 && renderGroup("Sabores", "sabores", groups.sabores)}
            {Number(item.tipo_ingrediente) === 5 && renderGroup("Sabores", "cocteles", groups.cocteles)}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={selectedCount === 0}
            onClick={addCustomizedItem}
          >
            Agregar a la orden
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderSummaryContent({ selectedTable, orderItems, orderTotal, saving, onChangeQuantity, onRemoveItem, onSubmitOrder }) {
  return (
    <>
      <h2 className="font-semibold text-gray-900">Orden actual</h2>
      <p className="mt-1 text-sm text-gray-500">{selectedTable ? selectedTable.name : "Selecciona una mesa"}</p>

      <div className="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
        {orderItems.length === 0 ? (
          <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No hay platos agregados.</p>
        ) : (
          orderItems.map((item, index) => (
            <div key={`${item.id}-${index}`} className="rounded-lg border border-gray-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{item.nombre}</p>
                  {item.ingredients?.length > 0 && (
                    <p className="mt-1 text-xs text-gray-500">{item.ingredients.map((ingredient) => ingredient.nombre).join(", ")}</p>
                  )}
                </div>
                <button type="button" className="text-xs font-semibold text-red-600" onClick={() => onRemoveItem(index)}>Quitar</button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button type="button" className="h-7 w-7 rounded-md border border-gray-200" onClick={() => onChangeQuantity(index, -1)}>-</button>
                  <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                  <button type="button" className="h-7 w-7 rounded-md border border-gray-200" onClick={() => onChangeQuantity(index, 1)}>+</button>
                </div>
                <span className="font-bold text-gray-900">{formatMoney(Number(item.precio) * item.quantity)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between text-lg font-bold text-gray-900">
          <span>Total</span>
          <span>{formatMoney(orderTotal)}</span>
        </div>
        <button
          type="button"
          className="mt-4 w-full rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving || !selectedTable || orderItems.length === 0}
          onClick={onSubmitOrder}
        >
          {saving ? "Guardando..." : "Confirmar orden"}
        </button>
      </div>
    </>
  );
}
export default function AdminTakeOrderPage() {
  const [tables, setTables] = useState([]);
  const [menu, setMenu] = useState([]);
  const [types, setTypes] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [isChangingTable, setIsChangingTable] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [customItem, setCustomItem] = useState(null);
  const [isOrderDrawerOpen, setIsOrderDrawerOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tablesResponse, menuResponse, typesResponse, ingredientsResponse] = await Promise.all([
        axios.get(`${API_BASE}/api/admin/tables`),
        axios.get(`${API_BASE}/api/menu`),
        axios.get(`${API_BASE}/api/tipos-plato`),
        axios.get(`${API_BASE}/api/ingredients`),
      ]);

      setTables(Array.isArray(tablesResponse.data) ? tablesResponse.data : []);
      setMenu(Array.isArray(menuResponse.data) ? menuResponse.data : []);
      const nextTypes = Array.isArray(typesResponse.data) ? typesResponse.data : [];
      setTypes(nextTypes);
      setSelectedType((currentType) => (
        currentType === "all" && nextTypes.length > 0 ? String(nextTypes[0].id) : currentType
      ));
      setIngredients(Array.isArray(ingredientsResponse.data) ? ingredientsResponse.data : []);
      setError(null);
    } catch {
      setError("No se pudo cargar la toma de órdenes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const typeById = useMemo(() => {
    return types.reduce((acc, type) => {
      acc[String(type.id)] = type.nombre;
      return acc;
    }, {});
  }, [types]);

  const filteredMenu = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return menu.filter((item) => {
      const matchesType = selectedType === "all" || String(item.tipo_id) === selectedType;
      const matchesSearch = !query || (item.nombre || "").toLowerCase().includes(query);
      return matchesType && matchesSearch;
    });
  }, [menu, selectedType, searchTerm]);

  const menuByCategory = useMemo(() => {
    const categories = new Map();
    filteredMenu.forEach((item) => {
      const categoryId = String(item.tipo_id || "uncategorized");
      const categoryName = typeById[categoryId] || "Sin categoría";
      if (!categories.has(categoryId)) categories.set(categoryId, { id: categoryId, name: categoryName, items: [] });
      categories.get(categoryId).items.push(item);
    });
    return Array.from(categories.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredMenu, typeById]);

  const orderTotal = orderItems.reduce((sum, item) => sum + Number(item.precio) * item.quantity, 0);
  const orderItemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const availableTables = tables.filter((table) => table.status !== "occupied").length;
  const occupiedTables = tables.length - availableTables;

  const addItemToOrder = (item, selectedIngredients = []) => {
    if (!selectedTable) {
      setError("Selecciona una mesa disponible antes de agregar platos.");
      return;
    }

    setError(null);
    setSuccess("");
    setOrderItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (orderItem) => orderItem.id === item.id && sameIngredients(orderItem.ingredients, selectedIngredients),
      );

      if (existingIndex >= 0) {
        return currentItems.map((orderItem, index) =>
          index === existingIndex ? { ...orderItem, quantity: orderItem.quantity + 1 } : orderItem,
        );
      }

      return [...currentItems, { ...item, quantity: 1, ingredients: selectedIngredients }];
    });
  };

  const handleMenuItemClick = (item) => {
    const needsCustomization = item.tipo_combinacion && Number(item.tipo_combinacion) !== 4;
    if (needsCustomization) {
      setCustomItem(item);
      return;
    }
    addItemToOrder(item, []);
  };

  const changeQuantity = (index, delta) => {
    setOrderItems((currentItems) => currentItems
      .map((item, itemIndex) => itemIndex === index ? { ...item, quantity: item.quantity + delta } : item)
      .filter((item) => item.quantity > 0));
  };

  const removeItem = (index) => {
    setOrderItems((currentItems) => currentItems.filter((_, itemIndex) => itemIndex !== index));
  };

  const submitOrder = async () => {
    if (!selectedTable) {
      setError("Selecciona una mesa.");
      return;
    }

    if (orderItems.length === 0) {
      setError("Agrega al menos un plato.");
      return;
    }

    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/admin/orders`, {
        table_id: selectedTable.id,
        items: orderItems.map((item) => ({
          menu_id: item.id,
          quantity: item.quantity,
          ingredients: item.ingredients || [],
        })),
      });

      setSuccess(`Orden creada para ${selectedTable.name}.`);
      setSelectedTable(null);
      setOrderItems([]);
      setIsOrderDrawerOpen(false);
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo crear la orden.");
    } finally {
      setSaving(false);
    }
  };

  const closeTableOrder = async (table) => {
    if (!table.active_order_id) return;
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/api/admin/orders/${table.active_order_id}/status`, { status: "paid" });
      setSuccess(`${table.name} quedó disponible.`);
      if (selectedTable?.id === table.id) {
        setSelectedTable(null);
        setOrderItems([]);
      }
      await fetchData();
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo liberar la mesa.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <section className="flex flex-col gap-5 pb-28 xl:pb-6">
      <CustomizationModal
        item={customItem}
        ingredients={ingredients}
        onClose={() => setCustomItem(null)}
        onAdd={addItemToOrder}
      />

      {isOrderDrawerOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-gray-900/40 px-3 pb-3 xl:hidden">
          <div className="max-h-[82vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-semibold text-gray-900">Resumen de orden</h2>
                <p className="text-sm text-gray-500">{selectedTable ? selectedTable.name : "Sin mesa seleccionada"}</p>
              </div>
              <button
                type="button"
                className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600"
                onClick={() => setIsOrderDrawerOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <OrderSummaryContent
              selectedTable={selectedTable}
              orderItems={orderItems}
              orderTotal={orderTotal}
              saving={saving}
              onChangeQuantity={changeQuantity}
              onRemoveItem={removeItem}
              onSubmitOrder={submitOrder}
            />
          </div>
        </div>
      )}

      {(selectedTable || orderItems.length > 0) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-3 py-3 shadow-[0_-8px_20px_rgba(15,23,42,0.12)] xl:hidden">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {selectedTable ? selectedTable.name : "Selecciona una mesa"}
              </p>
              <p className="text-xs text-gray-500">
                {orderItemCount} {orderItemCount === 1 ? "plato" : "platos"} - {formatMoney(orderTotal)}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedTable}
              onClick={() => setIsOrderDrawerOpen(true)}
            >
              Ver orden
            </button>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tomar orden</h1>
        <p className="mt-1 text-sm text-gray-500">Selecciona una mesa, agrega platos y confirma la orden interna.</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{success}</div>}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr_340px]">
        <aside className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Mesas</h2>
              <p className="text-xs text-gray-500">Plano de atención</p>
            </div>
            <div className="flex gap-2 text-xs font-semibold">
              <span className="rounded-full bg-green-50 px-2 py-1 text-green-700">{availableTables} libres</span>
              <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">{occupiedTables} ocupadas</span>
            </div>
          </div>

          {selectedTable && !isChangingTable ? (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">Mesa seleccionada</p>
              <div className="mx-auto mt-3 flex aspect-square w-28 flex-col items-center justify-center rounded-xl border-2 border-yellow-400 bg-white shadow-sm">
                <span className="text-3xl font-bold text-gray-900">{selectedTable.name.replace(/[^0-9]/g, "") || selectedTable.name}</span>
                <span className="mt-1 text-xs font-semibold text-yellow-700">Activa</span>
              </div>
              <p className="mt-3 text-sm text-gray-600">
                {orderItemCount} {orderItemCount === 1 ? "plato" : "platos"} - {formatMoney(orderTotal)}
              </p>
              <button
                type="button"
                className="mt-3 w-full rounded-md border border-yellow-300 bg-white px-3 py-2 text-sm font-semibold text-yellow-800 hover:bg-yellow-100"
                onClick={() => setIsChangingTable(true)}
              >
                Cambiar mesa
              </button>
            </div>
          ) : (
            <div className="rounded-xl bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-2">
                {tables.map((table) => {
                  const isSelected = selectedTable?.id === table.id;
                  const isOccupied = table.status === "occupied";
                  const tableNumber = table.name.replace(/[^0-9]/g, "") || table.name;
                  return (
                    <div
                      key={table.id}
                      className={`flex aspect-square flex-col rounded-xl border-2 p-2 transition-colors ${
                        isSelected
                          ? "border-yellow-400 bg-yellow-100"
                          : isOccupied
                            ? "border-red-200 bg-red-50"
                            : "border-green-200 bg-white hover:border-green-300"
                      }`}
                    >
                      <button
                        type="button"
                        className="flex min-h-0 w-full flex-1 flex-col items-center justify-center text-center disabled:cursor-not-allowed"
                        disabled={isOccupied}
                        onClick={() => {
                          setSelectedTable(table);
                          setIsChangingTable(false);
                          setOrderItems([]);
                          setError(null);
                          setSuccess("");
                        }}
                      >
                        <span className="text-2xl font-bold text-gray-900">{tableNumber}</span>
                        <span className={`mt-1 text-[11px] font-semibold uppercase ${isOccupied ? "text-red-700" : "text-green-700"}`}>
                          {isOccupied ? "Ocupada" : "Libre"}
                        </span>
                        {table.active_order_total && <span className="mt-1 text-xs font-semibold text-gray-700">{formatMoney(table.active_order_total)}</span>}
                      </button>
                      {isOccupied && (
                        <button
                          type="button"
                          className="mt-1 w-full rounded-md bg-gray-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-gray-700 disabled:opacity-60"
                          disabled={saving}
                          onClick={() => closeTableOrder(table)}
                        >
                          Liberar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <main className="min-w-0 rounded-lg border border-gray-200 bg-white p-3">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:min-w-0 lg:flex-1">
              {types.map((type) => {
                const isActive = String(type.id) === selectedType;
                return (
                  <button
                    key={type.id}
                    type="button"
                    className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? "border-yellow-300 bg-yellow-100 text-yellow-800"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                    onClick={() => setSelectedType(String(type.id))}
                  >
                    {type.nombre}
                  </button>
                );
              })}
            </div>
            <input
              type="search"
              className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400 lg:w-72"
              placeholder="Buscar plato"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>

          {menuByCategory.length === 0 ? (
            <p className="rounded-lg bg-gray-50 px-4 py-10 text-center text-sm text-gray-500">No hay platos para esta categoría.</p>
          ) : (
            <div className="grid gap-4">
              {menuByCategory.map((category) => (
                <div key={category.id}>
                  <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-500">{category.name}</h2>
                  <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
                    {category.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="flex gap-3 rounded-lg border border-gray-200 p-2 text-left transition-colors hover:border-yellow-300 hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!selectedTable}
                        onClick={() => handleMenuItemClick(item)}
                      >
                        <img src={item.image_url} alt={item.nombre} className="h-14 w-14 shrink-0 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-1 font-semibold text-gray-900">{item.nombre}</p>
                          <p className="line-clamp-1 text-xs text-gray-500">{item.descripcion}</p>
                          <p className="mt-1 text-sm font-bold text-gray-900">{formatMoney(item.precio)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="hidden rounded-lg border border-gray-200 bg-white p-4 xl:block">
          <h2 className="font-semibold text-gray-900">Orden actual</h2>
          <p className="mt-1 text-sm text-gray-500">{selectedTable ? selectedTable.name : "Selecciona una mesa"}</p>

          <div className="mt-4 flex max-h-[420px] flex-col gap-3 overflow-y-auto">
            {orderItems.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-6 text-center text-sm text-gray-500">No hay platos agregados.</p>
            ) : (
              orderItems.map((item, index) => (
                <div key={`${item.id}-${index}`} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-gray-900">{item.nombre}</p>
                      {item.ingredients?.length > 0 && (
                        <p className="mt-1 text-xs text-gray-500">{item.ingredients.map((ingredient) => ingredient.nombre).join(", ")}</p>
                      )}
                    </div>
                    <button type="button" className="text-xs font-semibold text-red-600" onClick={() => removeItem(index)}>Quitar</button>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button type="button" className="h-7 w-7 rounded-md border border-gray-200" onClick={() => changeQuantity(index, -1)}>-</button>
                      <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                      <button type="button" className="h-7 w-7 rounded-md border border-gray-200" onClick={() => changeQuantity(index, 1)}>+</button>
                    </div>
                    <span className="font-bold text-gray-900">{formatMoney(Number(item.precio) * item.quantity)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between text-lg font-bold text-gray-900">
              <span>Total</span>
              <span>{formatMoney(orderTotal)}</span>
            </div>
            <button
              type="button"
              className="mt-4 w-full rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving || !selectedTable || orderItems.length === 0}
              onClick={submitOrder}
            >
              {saving ? "Guardando..." : "Confirmar orden"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
