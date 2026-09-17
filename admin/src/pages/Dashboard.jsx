import { useEffect, useState } from 'react';
import { getDashboard } from '../api/client';

const TILES = [
  { key: 'totalPartners', label: 'Total Channel Partners' },
  { key: 'activePartners', label: 'Active Partners' },
  { key: 'totalRegistrations', label: 'Total Registrations' },
  { key: 'acceptedRegistrations', label: 'Accepted Registrations' },
  { key: 'rejectedRegistrations', label: 'Rejected (Duplicate)' },
  { key: 'pendingBookings', label: 'Pending Booking' },
  { key: 'totalBookings', label: 'Total Bookings' },
  { key: 'totalCommissionEligible', label: 'Commission Eligible' }
];

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getDashboard()
      .then(({ data }) => setSummary(data))
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, []);

  if (error) return <div className="page"><div className="error-box">{error}</div></div>;
  if (!summary) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <h1>Dashboard</h1>
      <div className="stat-grid">
        {TILES.map((t) => (
          <div className="stat-tile" key={t.key}>
            <div className="value">{summary[t.key]}</div>
            <div className="label">{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
