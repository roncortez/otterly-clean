import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "app/context/AuthContext";
import Loading from "shared/ui/Loading";
import WhatsAppButton from "shared/ui/WhatsAppButton";
import AddPropertyModal from "shared/ui/AddPropertyModal";
import {
  FaBroom,
  FaTshirt,
  FaTools,
  FaArrowRight,
  FaArrowLeft,
  FaCheck,
  FaPlus,
  FaTrash,
  FaHome,
} from "react-icons/fa";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const CATEGORIES = [
  { key: "cleaning", label: "Cleaning", icon: FaBroom, active: "border-forest-500 bg-sage-50", activeIcon: "text-forest-600" },
  { key: "laundry", label: "Laundry", icon: FaTshirt, active: "border-forest-500 bg-sage-50", activeIcon: "text-forest-600" },
  { key: "repair", label: "Repair", icon: FaTools, active: "border-forest-500 bg-sage-50", activeIcon: "text-forest-600" },
];

const EMPTY_FORM = {
  service_type: "",
  service_id: null,
  property_type_id: "",
  number_of_bedrooms: "",
  number_of_bathrooms: "",
  has_pets: false,
  service_address: "",
  access_instructions: "",
  scheduled_date: "",
  pickup_address: "",
  pickup_date: "",
  pickup_time_start: "",
  pickup_time_end: "",
  delivery_date: "",
  repair_description: "",
  special_instructions: "",
  items: [],
};

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-white px-3.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-forest-500 focus:ring-1 focus:ring-forest-500/20";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-forest-700";

function formatAddress(prop) {
  const parts = [prop.street_address, prop.city, prop.state].filter(Boolean);
  const line = parts.join(", ");
  return prop.zip_code ? `${line} ${prop.zip_code}` : line;
}

export default function ServiceRequestPage() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState(EMPTY_FORM);
  const [services, setServices] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [properties, setProperties] = useState([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState(null);
  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [servicesRes, propRes] = await Promise.all([
          axios.get(`${API_BASE}/api/services`),
          axios.get(`${API_BASE}/api/property-types`),
        ]);
        setServices(servicesRes.data);
        setPropertyTypes(propRes.data);
      } catch (err) {
        console.error(err);
        setError("Error loading services. Please try again.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    axios
      .post(`${API_BASE}/api/auth/getUser`, { email: currentUser.email })
      .then((res) => {
        setUser(res.data);
        if (res.data && res.data.id) {
          return axios.get(`${API_BASE}/api/properties`, { params: { user_id: res.data.id } });
        }
      })
      .then((res) => {
        if (res && res.data) setProperties(res.data);
      })
      .catch(() => {});
  }, [currentUser]);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handlePropertySelect = (prop) => {
    if (!prop) {
      setSelectedPropertyId(null);
      setField("property_type_id", "");
      setField("service_address", "");
      setField("number_of_bedrooms", "");
      setField("number_of_bathrooms", "");
      setField("has_pets", false);
      setField("access_instructions", "");
      return;
    }
    setSelectedPropertyId(prop.id);
    setField("property_type_id", prop.property_type_id || "");
    setField("service_address", formatAddress(prop));
    setField("number_of_bedrooms", prop.bedrooms || "");
    setField("number_of_bathrooms", prop.bathrooms || "");
    setField("has_pets", prop.has_pets || false);
    setField("access_instructions", prop.access_instructions || "");
  };

  const handlePropertySaved = (saved) => {
    setProperties((prev) => {
      const exists = prev.find((p) => p.id === saved.id);
      if (exists) return prev.map((p) => (p.id === saved.id ? saved : p));
      return [saved, ...prev];
    });
    setPropertyModalOpen(false);
    handlePropertySelect(saved);
  };

  const selectedService = services.find((s) => s.id === form.service_id);
  const filteredServices = form.service_type ? services.filter((s) => s.category === form.service_type) : [];
  const selectedProperty = properties.find((p) => p.id === selectedPropertyId);

  const canNext = () => {
    if (step === 1) return !!form.service_type;
    if (step === 2) return !!form.service_id;
    if (step === 3) {
      if (form.service_type === "cleaning") return !!selectedPropertyId && !!form.scheduled_date;
      if (form.service_type === "laundry" || form.service_type === "repair") return !!selectedPropertyId;
    }
    return true;
  };

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { garment_type: "", quantity: 1, notes: "", unit_price: 0 }],
    }));
  };

  const handleRemoveItem = (index) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const handleItemChange = (index, field, value) => {
    setForm((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const handleSubmit = async () => {
    if (!currentUser) { navigate("/login"); return; }
    setSubmitting(true);
    setError(null);

    const payload = {
      customer_id: user?.id || null,
      service_type: form.service_type,
      service_address: form.service_address || undefined,
      pickup_address: form.service_address || undefined,
      property_type_id: form.property_type_id ? Number(form.property_type_id) : undefined,
      number_of_bedrooms: form.number_of_bedrooms ? Number(form.number_of_bedrooms) : undefined,
      number_of_bathrooms: form.number_of_bathrooms ? Number(form.number_of_bathrooms) : undefined,
      has_pets: form.has_pets,
      pickup_date: form.pickup_date || form.scheduled_date || undefined,
      pickup_time_start: form.pickup_time_start || undefined,
      pickup_time_end: form.pickup_time_end || undefined,
      delivery_date: form.delivery_date || undefined,
      repair_description: form.repair_description || undefined,
      access_instructions: form.access_instructions || undefined,
      special_instructions: form.special_instructions || undefined,
      base_price: selectedService?.base_price || 0,
      total: selectedService?.base_price || 0,
      items: form.items.length > 0
        ? form.items.map((item) => ({
            service_id: form.service_id,
            garment_type: item.garment_type || undefined,
            quantity: Number(item.quantity) || 1,
            unit_price: Number(item.unit_price) || 0,
            total_price: (Number(item.unit_price) || 0) * (Number(item.quantity) || 1),
            notes: item.notes || undefined,
          }))
        : [{ service_id: form.service_id, quantity: 1 }],
    };

    try {
      const res = await axios.post(`${API_BASE}/api/orders`, payload);
      if (res.status === 201) {
        setResult({ order: res.data.order, items: res.data.items || [] });
        setStep(5);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Error submitting request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  const steps = [{ num: 1, label: "Service" }, { num: 2, label: "Select" }, { num: 3, label: "Details" }, { num: 4, label: "Review" }];

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-10 sm:px-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        {step <= 4 && (
          <div className="mb-10">
            <div className="flex items-center gap-0">
              {steps.map(({ num, label }, i) => (
                <React.Fragment key={num}>
                  <div className="flex flex-col items-center">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      step > num ? "bg-forest-600 text-white" : step === num ? "bg-forest-600 text-white ring-4 ring-forest-100" : "bg-gray-200 text-gray-500"
                    }`}>
                      {step > num ? <FaCheck className="text-[10px]" /> : num}
                    </div>
                    <span className={`mt-1.5 text-[11px] font-medium ${step >= num ? "text-gray-900" : "text-gray-400"}`}>{label}</span>
                  </div>
                  {i < 3 && <div className={`mx-3 mb-5 h-px flex-1 ${step > num ? "bg-forest-600" : "bg-sage-200"}`} />}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {error && <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {/* Step 1: Category */}
        {step === 1 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
            <h2 className="font-display text-xl font-bold text-forest-800">What service do you need?</h2>
            <p className="mt-1 text-sm text-forest-500">Select the category that best fits.</p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CATEGORIES.map(({ key, label, icon: Icon, active, activeIcon }) => (
                <button key={key} type="button" onClick={() => { setField("service_type", key); setField("service_id", null); setField("items", []); setSelectedPropertyId(null); }}
                  className={`flex flex-col items-center gap-3 rounded-xl border-2 p-6 transition-all ${form.service_type === key ? active : "border-sage-200 hover:border-sage-300 bg-white"}`}>
                  <Icon className={`text-2xl ${form.service_type === key ? activeIcon : "text-gray-300"}`} />
                  <span className={`text-sm font-semibold ${form.service_type === key ? "text-forest-800" : "text-forest-500"}`}>{label}</span>
                </button>
              ))}
            </div>
            <div className="mt-7 flex justify-end">
              <button type="button" disabled={!canNext()} onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40">
                Next <FaArrowRight className="text-xs" />
              </button>
            </div>
          </section>
        )}

        {/* Step 2: Specific service */}
        {step === 2 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
            <h2 className="font-display text-xl font-bold text-forest-800">Choose a service</h2>
            <p className="mt-1 text-sm text-forest-500">
              Services in <span className="font-medium text-gray-700">{CATEGORIES.find((c) => c.key === form.service_type)?.label}</span>
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {filteredServices.map((service) => (
                <button key={service.id} type="button" onClick={() => setField("service_id", service.id)}
                  className={`flex flex-col rounded-xl border-2 p-4 text-left transition-all sm:flex-row sm:items-center sm:justify-between ${
                    form.service_id === service.id ? "border-forest-500 bg-sage-50" : "border-sage-200 hover:border-sage-300"
                  }`}>
                  <div>
                    <h3 className="text-sm font-bold text-forest-800">{service.name}</h3>
                    <p className="mt-0.5 text-xs text-forest-500">{service.description}</p>
                  </div>
                  <div className="mt-2 text-right sm:mt-0 sm:min-w-[100px] sm:text-right">
                    <span className="text-base font-bold text-forest-800">
                      {service.base_price ? `$${Number(service.base_price).toFixed(2)}` : "Quote"}
                    </span>
                    {service.price_type && service.price_type !== "fixed" && service.price_type !== "quote" && (
                      <span className="ml-0.5 text-xs text-gray-400">
                        {service.price_type === "per_hour" ? "/hr" : service.price_type === "per_item" ? "/piece" : service.price_type === "per_pound" ? "/lb" : ""}
                      </span>
                    )}
                    {service.estimated_duration && <span className="block text-[11px] text-gray-400">{service.estimated_duration}</span>}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-7 flex justify-between">
              <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-2 rounded-lg border border-sage-200 px-5 py-2.5 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50">
                <FaArrowLeft className="text-xs" /> Back
              </button>
              <button type="button" disabled={!canNext()} onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40">
                Next <FaArrowRight className="text-xs" />
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Property + Date */}
        {step === 3 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
            <h2 className="font-display text-xl font-bold text-forest-800">Property & Schedule</h2>
            <p className="mt-1 text-sm text-forest-500">
              Service: <span className="font-medium text-forest-700">{selectedService?.name}</span>
            </p>

            <div className="mt-6 flex flex-col gap-5">
              {/* Property selection */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-forest-400">Select Property</p>
                {properties.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {properties.map((prop) => (
                      <button key={prop.id} type="button" onClick={() => handlePropertySelect(prop)}
                        className={`flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                          selectedPropertyId === prop.id ? "border-forest-500 bg-sage-50" : "border-sage-200 hover:border-sage-300"
                        }`}>
                        <FaHome className={`mt-0.5 text-sm ${selectedPropertyId === prop.id ? "text-forest-600" : "text-sage-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-forest-800">{prop.name}</p>
                          <p className="mt-0.5 text-xs text-forest-500 truncate">{formatAddress(prop)}</p>
                          <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-forest-400">
                            {prop.property_type_name && <span className="rounded-full bg-sage-100 px-2 py-0.5">{prop.property_type_name}</span>}
                            {prop.bedrooms > 0 && <span>{prop.bedrooms} BR</span>}
                            {prop.bathrooms > 0 && <span>{prop.bathrooms} BA</span>}
                            {prop.has_pets && <span>Pets</span>}
                          </div>
                        </div>
                        <div className={`mt-1 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                          selectedPropertyId === prop.id ? "border-forest-500 bg-forest-500" : "border-gray-300"
                        }`}>
                          {selectedPropertyId === prop.id && <div className="m-[3px] h-[8px] w-[8px] rounded-full bg-white" />}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-sage-300 bg-sage-50 p-5 text-center">
                    <FaHome className="mx-auto text-2xl text-sage-300" />
                    <p className="mt-2 text-sm text-forest-500">No properties saved yet.</p>
                  </div>
                )}
                <button type="button" onClick={() => setPropertyModalOpen(true)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-sage-200 px-3 py-1.5 text-xs font-medium text-forest-600 transition-colors hover:bg-sage-50">
                  <FaPlus className="text-[10px]" /> Add New Property
                </button>
              </div>

              {/* Selected property summary */}
              {selectedProperty && (
                <div className="rounded-xl bg-sage-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-forest-400">Selected Property</p>
                  <p className="mt-1.5 text-sm font-bold text-forest-800">{selectedProperty.name}</p>
                  <p className="text-xs text-forest-500">{formatAddress(selectedProperty)}</p>
                </div>
              )}

              {/* Date and time */}
              <div className="border-t border-sage-200 pt-5">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-forest-400">Schedule</p>

                {(form.service_type === "cleaning") && (
                  <label className={labelClass}>
                    Preferred Date *
                    <input type="date" value={form.scheduled_date} onChange={(e) => setField("scheduled_date", e.target.value)} className={inputClass} />
                  </label>
                )}

                {(form.service_type === "laundry" || form.service_type === "repair") && (
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <label className={labelClass}>
                        Pickup Date
                        <input type="date" value={form.pickup_date} onChange={(e) => setField("pickup_date", e.target.value)} className={inputClass} />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className={labelClass}>
                          From
                          <input type="time" value={form.pickup_time_start} onChange={(e) => setField("pickup_time_start", e.target.value)} className={inputClass} />
                        </label>
                        <label className={labelClass}>
                          To
                          <input type="time" value={form.pickup_time_end} onChange={(e) => setField("pickup_time_end", e.target.value)} className={inputClass} />
                        </label>
                      </div>
                    </div>
                    <label className={labelClass}>
                      Estimated Delivery Date
                      <input type="date" value={form.delivery_date} onChange={(e) => setField("delivery_date", e.target.value)} className={inputClass} />
                    </label>
                  </div>
                )}
              </div>

              {/* Items for laundry/repair */}
              {form.service_type === "repair" && (
                <label className={labelClass}>
                  Damage / Repair Description
                  <textarea value={form.repair_description} onChange={(e) => setField("repair_description", e.target.value)} placeholder="Describe what needs repair, fabric type, damage location..." rows={3} className={`${inputClass} h-auto py-2.5`} />
                </label>
              )}

              {(form.service_type === "laundry" || form.service_type === "repair") && (
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-forest-800">Items</h3>
                    <button type="button" onClick={handleAddItem} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50">
                      <FaPlus className="text-[10px]" /> Add
                    </button>
                  </div>
                  {form.items.length === 0 && <p className="mt-2 text-xs text-gray-400">Add the items you'd like to send.</p>}
                  <div className="mt-3 flex flex-col gap-2.5">
                    {form.items.map((item, idx) => (
                      <div key={idx} className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center">
                        <input type="text" value={item.garment_type} onChange={(e) => handleItemChange(idx, "garment_type", e.target.value)} placeholder="Garment type" className={`${inputClass} h-10 flex-1`} />
                        <input type="number" min="1" value={item.quantity} onChange={(e) => handleItemChange(idx, "quantity", e.target.value)} className={`${inputClass} h-10 w-16 text-center`} />
                        <input type="text" value={item.notes} onChange={(e) => handleItemChange(idx, "notes", e.target.value)} placeholder="Notes" className={`${inputClass} h-10 flex-1 sm:max-w-[160px]`} />
                        <button type="button" onClick={() => handleRemoveItem(idx)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500">
                          <FaTrash className="text-xs" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <label className={labelClass}>
                Special Instructions
                <textarea value={form.special_instructions} onChange={(e) => setField("special_instructions", e.target.value)} placeholder="Any additional instructions for our team..." rows={2} className={`${inputClass} h-auto py-2.5`} />
              </label>
            </div>

            <div className="mt-7 flex justify-between">
              <button type="button" onClick={() => setStep(2)} className="inline-flex items-center gap-2 rounded-lg border border-sage-200 px-5 py-2.5 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50">
                <FaArrowLeft className="text-xs" /> Back
              </button>
              <button type="button" disabled={!canNext()} onClick={() => setStep(4)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40">
                Review <FaArrowRight className="text-xs" />
              </button>
            </div>
          </section>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <section className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
            <h2 className="font-display text-xl font-bold text-forest-800">Review Your Request</h2>
            <p className="mt-1 text-sm text-forest-500">Verify everything is correct before submitting.</p>
            <div className="mt-6 flex flex-col gap-3">
              <div className="rounded-xl bg-sage-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-400">Service</h3>
                <p className="mt-1.5 text-sm font-medium text-forest-800">
                  {CATEGORIES.find((c) => c.key === form.service_type)?.label} &mdash; {selectedService?.name}
                </p>
                {selectedService?.base_price && (
                  <p className="mt-1 text-sm font-bold text-forest-800">
                    ${Number(selectedService.base_price).toFixed(2)}
                    {selectedService.price_type === "per_hour" && "/hr"}
                    {selectedService.price_type === "per_item" && "/piece"}
                    {selectedService.price_type === "per_pound" && "/lb"}
                  </p>
                )}
              </div>

              {selectedProperty && (
                <div className="rounded-xl bg-sage-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-400">Property</h3>
                  <div className="mt-2 flex flex-col gap-1 text-sm text-forest-600">
                    <p className="font-medium">{selectedProperty.name}</p>
                    <p>{formatAddress(selectedProperty)}</p>
                    {selectedProperty.property_type_name && <p>Type: {selectedProperty.property_type_name}</p>}
                    {selectedProperty.bedrooms > 0 && <p>Bedrooms: {selectedProperty.bedrooms}</p>}
                    {selectedProperty.bathrooms > 0 && <p>Bathrooms: {selectedProperty.bathrooms}</p>}
                    {selectedProperty.has_pets && <p>Pets: Yes</p>}
                    {selectedProperty.access_instructions && <p>Access: {selectedProperty.access_instructions}</p>}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-sage-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-400">Schedule</h3>
                <div className="mt-2 flex flex-col gap-1 text-sm text-forest-600">
                  {form.scheduled_date && <p>Date: {form.scheduled_date}</p>}
                  {form.pickup_date && <p>Pickup: {form.pickup_date}</p>}
                  {form.pickup_time_start && <p>Time: {form.pickup_time_start}{form.pickup_time_end && ` - ${form.pickup_time_end}`}</p>}
                  {form.delivery_date && <p>Delivery: {form.delivery_date}</p>}
                </div>
              </div>

              {form.items.length > 0 && (
                <div className="rounded-xl bg-sage-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-400">Items</h3>
                  <ul className="mt-2 flex flex-col gap-0.5">
                    {form.items.map((item, i) => (
                      <li key={i} className="text-sm text-forest-600">
                        {item.garment_type || "Item"} x{item.quantity}{item.notes && ` — ${item.notes}`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {form.special_instructions && (
                <div className="rounded-xl bg-sage-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-forest-400">Special Instructions</h3>
                  <p className="mt-1.5 text-sm text-forest-600">{form.special_instructions}</p>
                </div>
              )}
            </div>
            <div className="mt-7 flex justify-between">
              <button type="button" onClick={() => setStep(3)} className="inline-flex items-center gap-2 rounded-lg border border-sage-200 px-5 py-2.5 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50">
                <FaArrowLeft className="text-xs" /> Back
              </button>
              <button type="button" disabled={submitting} onClick={handleSubmit}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-40">
                {submitting ? "Submitting..." : "Submit Request"}{!submitting && <FaCheck className="text-xs" />}
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Success */}
        {step === 5 && result && (
          <section className="rounded-2xl border border-forest-200 bg-white p-7 shadow-sm">
            <div className="rounded-xl bg-sage-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-600">
                  <FaCheck className="text-[10px] text-white" />
                </div>
                <p className="font-display text-lg font-bold text-forest-800">Request Submitted!</p>
              </div>
              <p className="mt-1.5 text-sm text-forest-600">Your request #{result.order.id} has been registered successfully.</p>
            </div>
            <div className="mt-6 flex flex-col gap-2.5">
              <WhatsAppButton message={`Hi, I'd like to confirm my service request #${result.order.id}.`} />
              <Link to="/" className="inline-flex items-center justify-center gap-2 rounded-lg border border-sage-200 px-6 py-3 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50">
                Back to Home
              </Link>
            </div>
            <p className="mt-4 text-xs text-forest-400">If WhatsApp doesn't open, tap the button again. It's also saved in your account.</p>
          </section>
        )}
      </div>

      <AddPropertyModal
        isOpen={propertyModalOpen}
        onClose={() => setPropertyModalOpen(false)}
        onSave={handlePropertySaved}
        propertyTypes={propertyTypes}
        userId={user?.id}
      />
    </main>
  );
}
