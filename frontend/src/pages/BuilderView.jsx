import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getRegistration } from '../api/client';

export default function BuilderView() {
  const { registrationId } = useParams();
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRegistration(registrationId, 'builder')
      .then(({ data }) => setView(data))
      .catch((err) => setError(err.response ? err.response.data.reason : err.message));
  }, [registrationId]);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!view) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>Screen 4 — Builder View</h1>
      <p className="hint">Only permitted information is shown. Builder actions are restricted before booking.</p>
      <div className="card">
        <dl className="kv">
          <dt>Customer</dt>
          <dd>{view.customer ?? 'Not shared'}</dd>
          <dt>Project</dt>
          <dd>{view.project}</dd>
          <dt>Partner</dt>
          <dd>{view.partner}</dd>
          <dt>Registration Status</dt>
          <dd>{view.registrationStatus}</dd>
          <dt>Current Stage</dt>
          <dd>{view.currentStage ?? 'Not shared'}</dd>
          <dt>Booking Status</dt>
          <dd>{view.bookingStatus}</dd>
          <dt>Ownership</dt>
          <dd>{view.ownership}</dd>
        </dl>
      </div>

      <div className="card">
        <h3>Builder Restrictions</h3>
        <ul>
          <li>Take ownership: {view.restrictions.canTakeOwnership ? 'Allowed' : 'Not allowed'}</li>
          <li>Assign to another partner: {view.restrictions.canAssignToAnotherPartner ? 'Allowed' : 'Not allowed'}</li>
          <li>Delete partner registration: {view.restrictions.canDeletePartnerRegistration ? 'Allowed' : 'Not allowed'}</li>
          <li>Change partner attribution: {view.restrictions.canChangePartnerAttribution ? 'Allowed' : 'Not allowed'}</li>
          <li>Override duplicate protection: {view.restrictions.canOverrideDuplicateProtection ? 'Allowed' : 'Not allowed'}</li>
        </ul>
      </div>
    </div>
  );
}
