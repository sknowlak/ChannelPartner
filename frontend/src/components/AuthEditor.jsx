// How Leadrat signs in to another system's API (section 51) - shared by
// push webhooks and pull sources, and (HMAC only) by receive sources to
// check incoming signatures. Secrets come back from the server masked
// ("••••abcd"); leaving a masked value as-is keeps the stored secret.

const TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'API_KEY', label: 'API key' },
  { value: 'BEARER', label: 'Bearer token' },
  { value: 'BASIC', label: 'Basic (username + password)' },
  { value: 'OAUTH2', label: 'OAuth 2.0 (client credentials)' },
  { value: 'HMAC', label: 'HMAC signature' }
];

function Field({ label, children, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint" style={{ fontSize: '0.78rem' }}>{hint}</span>}
    </div>
  );
}

export default function AuthEditor({ value, onChange, allowedTypes, title = 'Authentication', direction = 'outbound' }) {
  const auth = value || { type: 'NONE' };
  const set = (patch) => onChange({ ...auth, ...patch });
  const types = allowedTypes ? TYPES.filter((t) => allowedTypes.includes(t.value)) : TYPES;
  const secret = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <input type="password" autoComplete="new-password" value={auth[key] || ''} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );

  return (
    <div className="card" style={{ background: '#fff', padding: '0.9rem 1rem' }}>
      <h4 style={{ margin: '0 0 0.6rem' }}>{title}</h4>
      <div className="form-grid">
        <Field label="Type">
          <select value={auth.type} onChange={(e) => onChange({ type: e.target.value })}>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Field>

        {auth.type === 'API_KEY' && (
          <>
            <Field label="Key name" hint="Header or query parameter name, e.g. X-Api-Key, API-Key, api_key">
              <input value={auth.keyName || ''} onChange={(e) => set({ keyName: e.target.value })} placeholder="X-Api-Key" />
            </Field>
            {secret('keyValue', 'Key value')}
            <Field label="Send key in">
              <select value={auth.keyIn || 'HEADER'} onChange={(e) => set({ keyIn: e.target.value })}>
                <option value="HEADER">Header</option>
                <option value="QUERY">URL query string</option>
              </select>
            </Field>
          </>
        )}

        {auth.type === 'BEARER' && secret('token', 'Token', 'Sent as "Authorization: Bearer <token>"')}

        {auth.type === 'BASIC' && (
          <>
            <Field label="Username"><input value={auth.username || ''} onChange={(e) => set({ username: e.target.value })} /></Field>
            {secret('password', 'Password')}
          </>
        )}

        {auth.type === 'OAUTH2' && (
          <>
            <Field label="Token URL" hint="Leadrat fetches and refreshes the access token automatically">
              <input value={auth.tokenUrl || ''} onChange={(e) => set({ tokenUrl: e.target.value })} placeholder="https://auth.example.com/oauth/token" />
            </Field>
            <Field label="Client ID"><input value={auth.clientId || ''} onChange={(e) => set({ clientId: e.target.value })} /></Field>
            {secret('clientSecret', 'Client secret')}
            <Field label="Scope (optional)"><input value={auth.scope || ''} onChange={(e) => set({ scope: e.target.value })} /></Field>
            <Field label="Audience (optional)"><input value={auth.audience || ''} onChange={(e) => set({ audience: e.target.value })} /></Field>
            <Field label="Send client credentials">
              <select value={auth.clientAuth || 'BODY'} onChange={(e) => set({ clientAuth: e.target.value })}>
                <option value="BODY">In the request body</option>
                <option value="HEADER">As a Basic auth header</option>
              </select>
            </Field>
          </>
        )}

        {auth.type === 'HMAC' && (
          <>
            {secret('secret', 'Shared secret')}
            <Field label="Signature header" hint={direction === 'inbound' ? 'Header the sender puts the signature in' : 'Header Leadrat puts the signature in'}>
              <input value={auth.signatureHeader || ''} onChange={(e) => set({ signatureHeader: e.target.value })} placeholder="X-Signature" />
            </Field>
            <Field label="Algorithm">
              <select value={auth.algorithm || 'sha256'} onChange={(e) => set({ algorithm: e.target.value })}>
                <option value="sha256">SHA-256</option>
                <option value="sha1">SHA-1</option>
                <option value="sha512">SHA-512</option>
              </select>
            </Field>
            <Field label="Encoding">
              <select value={auth.encoding || 'hex'} onChange={(e) => set({ encoding: e.target.value })}>
                <option value="hex">Hex</option>
                <option value="base64">Base64</option>
              </select>
            </Field>
            <Field label="Prefix (optional)" hint='e.g. "sha256=" for GitHub/Meta style signatures'>
              <input value={auth.signaturePrefix || ''} onChange={(e) => set({ signaturePrefix: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
