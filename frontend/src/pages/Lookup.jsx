import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Lookup() {
  const [registrationId, setRegistrationId] = useState('');
  const navigate = useNavigate();

  const go = (path) => (e) => {
    e.preventDefault();
    if (registrationId.trim()) navigate(`/registrations/${registrationId.trim()}${path}`);
  };

  return (
    <div className="page">
      <h1>Lookup Registration</h1>
      <form className="card">
        <div className="field">
          <label>Registration ID</label>
          <input value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} placeholder="REG-10001" />
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button className="primary" onClick={go('')}>Partner Journey</button>
          <button className="secondary" onClick={go('/builder')}>Builder View</button>
          <button className="secondary" onClick={go('/audit')}>Audit Timeline</button>
        </div>
      </form>
    </div>
  );
}
