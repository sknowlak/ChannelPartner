import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMyRegistration } from '../api/client';

const initialForm = {
  name: '', mobile: '', email: '', alternateMobile: '',
  projectId: '', requirementType: '', propertyType: '', bhk: '',
  budgetMin: '', budgetMax: '', preferredLocation: '', possessionTimeline: '', leadSource: '',
  notes: '', externalReferenceId: ''
};

const REQUIREMENT_TYPES = ['Buy', 'Rent', 'Sell'];
const PROPERTY_TYPES = ['Apartment', 'Villa', 'Plot', 'Commercial', 'Office', 'Other'];
const BHK_OPTIONS = ['Studio', '1 BHK', '2 BHK', '3 BHK', '4+ BHK'];
const POSSESSION_OPTIONS = ['Immediate', '0-3 Months', '3-6 Months', '6-12 Months', '1 Year+'];
const LEAD_SOURCES = ['Website', 'Referral', 'Walk-in', 'Property Portal', 'Social Media', 'Cold Call', 'Other'];

// The authenticated counterpart to PartnerRegistration.jsx (Screen 1) - no
// partnerId field, since it's implicit from the logged-in session (spec
// section 31). Only the lead's name and mobile are mandatory - everything
// else is an optional real-estate requirement detail (section 33).
// PartnerRegistration.jsx is kept separately for the unauthenticated
// simulated-external-CRM demo flow (spec section 19).
export default function RegisterLead() {
  const [form, setForm] = useState(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await createMyRegistration({
        customer: {
          name: form.name,
          mobile: form.mobile,
          email: form.email || undefined,
          alternateMobile: form.alternateMobile || undefined
        },
        projectId: form.projectId || undefined,
        requirementType: form.requirementType || undefined,
        propertyType: form.propertyType || undefined,
        bhk: form.bhk || undefined,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : undefined,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : undefined,
        preferredLocation: form.preferredLocation || undefined,
        possessionTimeline: form.possessionTimeline || undefined,
        leadSource: form.leadSource || undefined,
        notes: form.notes || undefined,
        externalReferenceId: form.externalReferenceId || undefined
      });
      navigate(`/registrations/result`, { state: { result: data } });
    } catch (err) {
      if (err.response && err.response.data) {
        navigate(`/registrations/result`, { state: { result: err.response.data } });
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page page-wide">
      <h1>Register New Lead</h1>
      <p className="hint">Only Name and Mobile Number are required - fill in whatever else you know about the buyer's requirement.</p>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <h3 style={{ marginTop: 0 }}>Contact Information</h3>
        <div className="form-grid">
          <div className="field">
            <label>Lead Name *</label>
            <input value={form.name} onChange={update('name')} required />
          </div>
          <div className="field">
            <label>Mobile Number *</label>
            <input value={form.mobile} onChange={update('mobile')} required placeholder="+91XXXXXXXXXX" />
          </div>
          <div className="field">
            <label>Alternate Mobile</label>
            <input value={form.alternateMobile} onChange={update('alternateMobile')} />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={update('email')} />
          </div>
        </div>

        <h3>Property Requirement</h3>
        <div className="form-grid">
          <div className="field">
            <label>Project / Property Name</label>
            <input value={form.projectId} onChange={update('projectId')} placeholder="e.g. Skyline Heights" />
          </div>
          <div className="field">
            <label>Requirement Type</label>
            <select value={form.requirementType} onChange={update('requirementType')}>
              <option value="">Select...</option>
              {REQUIREMENT_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Property Type</label>
            <select value={form.propertyType} onChange={update('propertyType')}>
              <option value="">Select...</option>
              {PROPERTY_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>BHK</label>
            <select value={form.bhk} onChange={update('bhk')}>
              <option value="">Select...</option>
              {BHK_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Budget Min (₹)</label>
            <input type="number" min="0" value={form.budgetMin} onChange={update('budgetMin')} />
          </div>
          <div className="field">
            <label>Budget Max (₹)</label>
            <input type="number" min="0" value={form.budgetMax} onChange={update('budgetMax')} />
          </div>
          <div className="field">
            <label>Preferred Location</label>
            <input value={form.preferredLocation} onChange={update('preferredLocation')} placeholder="e.g. Whitefield, Bengaluru" />
          </div>
          <div className="field">
            <label>Possession Timeline</label>
            <select value={form.possessionTimeline} onChange={update('possessionTimeline')}>
              <option value="">Select...</option>
              {POSSESSION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Lead Source</label>
            <select value={form.leadSource} onChange={update('leadSource')}>
              <option value="">Select...</option>
              {LEAD_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>External CRM Reference</label>
            <input value={form.externalReferenceId} onChange={update('externalReferenceId')} placeholder="CRM-12345" />
          </div>
        </div>

        <div className="field">
          <label>Notes / Requirement Details</label>
          <textarea rows={3} value={form.notes} onChange={update('notes')} />
        </div>

        <button className="primary" type="submit" disabled={submitting}>
          {submitting ? 'Registering...' : 'Register Lead'}
        </button>
      </form>
    </div>
  );
}
