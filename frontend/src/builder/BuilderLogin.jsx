import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { builderLogin, setBuilderSession } from './builderClient';

export default function BuilderLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await builderLogin(email, password);
      setBuilderSession(data.token, data.user);
      navigate('/builder/referrals');
    } catch (err) {
      setError(err.response?.data?.reason || err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <form className="card" onSubmit={submit} style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Builder sign in</h3>
        <p className="hint">Builder accounts are created by Leadrat. Ask your administrator if you don't have one.</p>
        {error && <div className="error-box">{error}</div>}
        <div className="field">
          <label>Email</label>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="primary" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in...' : 'Sign In'}</button>
      </form>
    </div>
  );
}
