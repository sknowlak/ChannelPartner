import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { getCommissionEligibility } from '../api/client';

export default function BookingHandover() {
  const { registrationId } = useParams();
  const { state } = useLocation();
  const [commission, setCommission] = useState(state && state.booking ? { eligibilityStatus: state.booking.commissionEligibility } : null);
  const [booking] = useState(state && state.booking);

  useEffect(() => {
    if (!booking) {
      getCommissionEligibility(registrationId).then(({ data }) => setCommission(data)).catch(() => {});
    }
  }, [registrationId, booking]);

  return (
    <div className="page">
      <h1>Screen 5 — Booking Handover</h1>
      <div className="card">
        <h2>Booking Confirmed</h2>
        <dl className="kv">
          <dt>Operational Owner</dt>
          <dd>Builder</dd>
          <dt>Partner Attribution</dt>
          <dd>{booking ? booking.partnerAttribution : '—'}</dd>
          <dt>Commission Eligibility</dt>
          <dd>{commission ? commission.eligibilityStatus : 'Loading...'}</dd>
          <dt>Handover</dt>
          <dd>Completed</dd>
        </dl>
      </div>
    </div>
  );
}
