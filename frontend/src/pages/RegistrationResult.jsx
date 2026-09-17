import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { formatDate } from '../utils/timezone';

export default function RegistrationResult() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { partner } = useAuth();
  const result = state && state.result;

  if (!result) {
    return (
      <div className="page">
        <h1>Screen 2 — Registration Result</h1>
        <p className="hint">No registration result to show. Start a new registration.</p>
        <button className="secondary" onClick={() => navigate('/')}>Back to Registration</button>
      </div>
    );
  }

  const isAccepted = result.status === 'ACCEPTED';

  return (
    <div className="page">
      <h1>Screen 2 — Registration Result</h1>
      <div className="card">
        <p>
          Registration Status:{' '}
          <span className={`badge ${isAccepted ? 'accepted' : 'rejected'}`}>{result.status}</span>
        </p>

        {isAccepted ? (
          <dl className="kv">
            <dt>Registration ID</dt>
            <dd>{result.registrationId}</dd>
            <dt>Ownership</dt>
            <dd>{result.owner}</dd>
            <dt>Protection Window</dt>
            <dd>{result.protectionDays} Days</dd>
            <dt>Protected Until</dt>
            <dd>{formatDate(result.expiryDate, partner?.timezone)}</dd>
          </dl>
        ) : (
          <dl className="kv">
            <dt>Reason</dt>
            <dd>{result.reasonCode}</dd>
            <dt>Existing registration protected until</dt>
            <dd>{result.protectedUntil ? formatDate(result.protectedUntil, partner?.timezone) : '-'}</dd>
          </dl>
        )}

        {isAccepted && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem' }}>
            <Link to={`/registrations/${result.registrationId}`}>
              <button className="primary">Open Partner Journey</button>
            </Link>
            <Link to={`/registrations/${result.registrationId}/builder`}>
              <button className="secondary">Open Builder View</button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
