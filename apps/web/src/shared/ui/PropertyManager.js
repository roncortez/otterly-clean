import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import AddPropertyModal from "shared/ui/AddPropertyModal";
import Loading from "shared/ui/Loading";
import { FaHome, FaPlus, FaPencilAlt, FaTrash } from "react-icons/fa";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

function formatAddress(prop) {
  const parts = [prop.street_address, prop.city, prop.state].filter(Boolean);
  const line = parts.join(", ");
  return prop.zip_code ? `${line} ${prop.zip_code}` : line;
}

export default function PropertyManager({ userId, propertyTypes, onPropertySelect, selectedPropertyId }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editProperty, setEditProperty] = useState(null);

  const fetchProperties = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await axios.get(`${API_BASE}/api/properties`, { params: { user_id: userId } });
      setProperties(res.data);
    } catch (err) {
      console.error("Error fetching properties:", err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const handleSave = (saved) => {
    if (editProperty) {
      setProperties((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
    } else {
      setProperties((prev) => [saved, ...prev]);
    }
    setModalOpen(false);
    setEditProperty(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this property?")) return;
    try {
      await axios.delete(`${API_BASE}/api/properties/${id}`, { params: { user_id: userId } });
      setProperties((prev) => prev.filter((p) => p.id !== id));
      if (selectedPropertyId === id && onPropertySelect) onPropertySelect(null);
    } catch (err) {
      console.error("Error deleting property:", err);
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-forest-800">My Properties</h3>
        <button
          type="button"
          onClick={() => { setEditProperty(null); setModalOpen(true); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sage-200 px-3 py-1.5 text-xs font-medium text-forest-600 transition-colors hover:bg-sage-50"
        >
          <FaPlus className="text-[10px]" /> Add
        </button>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sage-300 bg-sage-50 p-5 text-center">
          <FaHome className="mx-auto text-2xl text-sage-300" />
          <p className="mt-2 text-sm text-forest-500">No properties saved yet.</p>
          <p className="text-xs text-forest-400">Add one to quickly fill in service details later.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {properties.map((prop) => (
            <div
              key={prop.id}
              onClick={() => onPropertySelect && onPropertySelect(prop)}
              className={`flex items-start justify-between rounded-xl border-2 p-4 transition-all ${
                selectedPropertyId === prop.id
                  ? "border-forest-500 bg-sage-50 cursor-pointer"
                  : "border-sage-200 hover:border-sage-300 cursor-pointer"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FaHome className={`text-sm ${selectedPropertyId === prop.id ? "text-forest-600" : "text-sage-400"}`} />
                  <p className="text-sm font-bold text-forest-800 truncate">{prop.name}</p>
                </div>
                <p className="mt-1 text-xs text-forest-500 truncate">{formatAddress(prop)}</p>
                <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-forest-400">
                  {prop.property_type_name && <span className="rounded-full bg-sage-100 px-2 py-0.5">{prop.property_type_name}</span>}
                  {prop.bedrooms > 0 && <span>{prop.bedrooms} BR</span>}
                  {prop.bathrooms > 0 && <span>{prop.bathrooms} BA</span>}
                  {prop.has_pets && <span>Pets</span>}
                </div>
              </div>
              <div className="flex gap-1 ml-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditProperty(prop); setModalOpen(true); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sage-400 transition-colors hover:bg-sage-100 hover:text-forest-600"
                >
                  <FaPencilAlt className="text-[10px]" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleDelete(prop.id); }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-sage-400 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <FaTrash className="text-[10px]" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AddPropertyModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditProperty(null); }}
        onSave={handleSave}
        propertyTypes={propertyTypes}
        userId={userId}
        editProperty={editProperty}
      />
    </div>
  );
}
