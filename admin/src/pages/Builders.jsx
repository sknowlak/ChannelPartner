import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createBuilder, listBuilders } from '../api/client';
import { errorMessage } from '../utils/errors';
import { enumLabel } from '../i18n/enumLabels';
import { formatNumber } from '../i18n/format';

// Builder organizations (section 52). Each builder gets portal users and the
// projects partners can refer leads to - managed on the detail page.
export default function Builders() {
  const { t } = useTranslation(['builders', 'common', 'enums']);
  const [builders, setBuilders] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => listBuilders().then(({ data }) => setBuilders(data.builders)).catch((err) => setError(errorMessage(err)));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createBuilder({ name });
      setName('');
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page page-wide">
      <h1>{t('builders:list.title')}</h1>
      <p className="hint">{t('builders:list.hint')}</p>
      {error && <div className="error-box">{error}</div>}
      <form className="card" onSubmit={create} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="new-builder-name">{t('builders:list.newOrg')}</label>
          <input id="new-builder-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('builders:list.namePlaceholder')} required />
        </div>
        <button className="primary" type="submit" disabled={busy}>{t('builders:list.add')}</button>
      </form>
      <div className="card">
        <table className="pro-table">
          <thead><tr>{['builder', 'status', 'users', 'projects'].map((k) => <th key={k}>{t(`builders:list.columns.${k}`)}</th>)}</tr></thead>
          <tbody>
            {(builders || []).map((b) => (
              <tr key={b.builderId}>
                <td><Link to={`/builders/${b.builderId}`}>{b.name}</Link></td>
                <td><span className={`badge ${b.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{enumLabel('status', b.status)}</span></td>
                <td>{formatNumber(b.userCount)}</td>
                <td>{formatNumber(b.projectCount)}</td>
              </tr>
            ))}
            {builders && builders.length === 0 && <tr><td colSpan={4} className="hint">{t('builders:list.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
