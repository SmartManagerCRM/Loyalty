import React, { useState } from "react";
import { Heart } from "lucide-react";
import { C } from "../components/theme";
import { Btn, TextInput, Select, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";

const BUSINESS_TYPES = [
  { value: "clinic", label: "Clinic" },
  { value: "dental", label: "Dental" },
  { value: "physiotherapy", label: "Physiotherapy" },
  { value: "beauty_salon", label: "Beauty Salon" },
  { value: "spa", label: "Spa" },
  { value: "gym", label: "Gym" },
  { value: "barber", label: "Barber" },
  { value: "car_service", label: "Car Service" },
  { value: "training_center", label: "Training Center" },
  { value: "consultant", label: "Consultant" },
  { value: "other", label: "Other" },
];

const VISIT_LABELS = ["Visit", "Appointment", "Session", "Service", "Purchase"];
const LANGUAGES = [{ value: "en", label: "English" }, { value: "ar", label: "Arabic" }];
const CURRENCIES = ["SAR", "AED", "USD", "EGP", "QAR", "KWD", "BHD", "OMR", "JOD", "LBP", "MAD"];

export default function Onboarding() {
  const { createBusiness } = useAuth();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("clinic");
  const [visitLabel, setVisitLabel] = useState("Visit");
  const [language, setLanguage] = useState("en");
  const [currency, setCurrency] = useState("SAR");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBusiness({ name: name.trim(), businessType, visitLabel, language, currency });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center px-4" style={{ backgroundColor: C.bg }}>
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-sm" style={{ border: `1px solid ${C.border}` }}>
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: C.green }}>
            <Heart size={26} color="#fff" />
          </div>
          <h1 className="text-lg font-bold" style={{ color: C.ink }}>Set up your business</h1>
          <p className="mt-1 text-xs" style={{ color: C.slateLight }}>This is what your customers and staff will see.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Business name" span>
            <TextInput required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Al Noor Medical Center" />
          </Field>
          <Field label="Business type">
            <Select options={BUSINESS_TYPES} value={businessType} onChange={(e) => setBusinessType(e.target.value)} />
          </Field>
          <Field label="What do you call a visit?">
            <Select options={VISIT_LABELS} value={visitLabel} onChange={(e) => setVisitLabel(e.target.value)} />
          </Field>
          <Field label="Default language">
            <Select options={LANGUAGES} value={language} onChange={(e) => setLanguage(e.target.value)} />
          </Field>
          <Field label="Currency">
            <Select options={CURRENCIES} value={currency} onChange={(e) => setCurrency(e.target.value)} />
          </Field>
        </div>

        {error && <p className="mt-3 text-xs" style={{ color: C.red }}>{error}</p>}

        <Btn type="submit" disabled={busy} className="mt-6 w-full justify-center">
          {busy ? "Setting up…" : "Create business"}
        </Btn>
      </form>
    </div>
  );
}
