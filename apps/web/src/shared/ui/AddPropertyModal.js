import React, { useState, useEffect } from "react";
import axios from "axios";
import { FaTimes } from "react-icons/fa";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-forest-500 focus:ring-1 focus:ring-forest-500/20";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-forest-700";

const EMPTY_FORM = {
  name: "",
  property_type_id: "",
  street_address: "",
  city: "",
  state: "",
  zip_code: "",
  bedrooms: 0,
  bathrooms: 0,
  has_pets: false,
  access_instructions: "",
};

export default function AddPropertyModal({ isOpen, onClose, onSave, propertyTypes, userId, editProperty }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (editProperty) {
      setForm({
        name: editProperty.name || "",
        property_type_id: editProperty.property_type_id || "",
        street_address: editProperty.street_address || "",
        city: editProperty.city || "",
        state: editProperty.state || "",
        zip_code: editProperty.zip_code || "",
        bedrooms: editProperty.bedrooms || 0,
        bathrooms: editProperty.bathrooms || 0,
        has_pets: editProperty.has_pets || false,
        access_instructions: editProperty.access_instructions || "",
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setError(null);
  }, [editProperty, isOpen]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.street_address.trim()) {
      setError("Name and street address are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        user_id: userId,
        name: form.name.trim(),
        property_type_id: form.property_type_id ? Number(form.property_type_id) : null,
        street_address: form.street_address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        zip_code: form.zip_code.trim(),
        bedrooms: Number(form.bedrooms) || 0,
        bathrooms: Number(form.bathrooms) || 0,
        has_pets: form.has_pets,
        access_instructions: form.access_instructions.trim(),
      };
      if (editProperty) {
        const res = await axios.put(`${API_BASE}/api/properties/${editProperty.id}`, payload);
        onSave(res.data);
      } else {
        const res = await axios.post(`${API_BASE}/api/properties`, payload);
        onSave(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Error saving property.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-forest-800">
            {editProperty ? "Edit Property" : "Add Property"}
          </h2>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
            <FaTimes className="text-sm" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
          <label className={labelClass}>
            Name *
            <input type="text" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="My Home, Office, etc." className={inputClass} />
          </label>

          <label className={labelClass}>
            Property Type
            <select value={form.property_type_id} onChange={(e) => setField("property_type_id", e.target.value)} className={inputClass}>
              <option value="">Select...</option>
              {propertyTypes.map((pt) => (
                <option key={pt.id} value={pt.id}>{pt.name}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-forest-400">Address</p>
            <div className="flex flex-col gap-3">
              <label className={labelClass}>
                Street Address *
                <input type="text" value={form.street_address} onChange={(e) => setField("street_address", e.target.value)} placeholder="123 Main St, Apt 4B" className={inputClass} />
              </label>
              <div className="grid grid-cols-6 gap-3">
                <label className={`${labelClass} col-span-3`}>
                  City
                  <input type="text" value={form.city} onChange={(e) => setField("city", e.target.value)} placeholder="New York" className={inputClass} />
                </label>
                <label className={`${labelClass} col-span-1`}>
                  State
                  <input type="text" value={form.state} onChange={(e) => setField("state", e.target.value)} placeholder="NY" className={inputClass} />
                </label>
                <label className={`${labelClass} col-span-2`}>
                  Zip Code
                  <input type="text" value={form.zip_code} onChange={(e) => setField("zip_code", e.target.value)} placeholder="10001" className={inputClass} />
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className={labelClass}>
              Bedrooms
              <input type="number" min="0" value={form.bedrooms} onChange={(e) => setField("bedrooms", e.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>
              Bathrooms
              <input type="number" min="0" value={form.bathrooms} onChange={(e) => setField("bathrooms", e.target.value)} className={inputClass} />
            </label>
          </div>

          <label className="flex items-center gap-2.5 text-sm font-medium text-gray-700">
            <input type="checkbox" checked={form.has_pets} onChange={(e) => setField("has_pets", e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-forest-600" />
            There are pets on the property
          </label>

          <label className={labelClass}>
            Access Instructions
            <textarea value={form.access_instructions} onChange={(e) => setField("access_instructions", e.target.value)} placeholder="Gate code, apartment number, ring bell..." rows={2} className={`${inputClass} h-auto py-2.5`} />
          </label>

          <div className="flex justify-end gap-3 mt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-sage-200 px-5 py-2.5 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:opacity-50">
              {saving ? "Saving..." : editProperty ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
