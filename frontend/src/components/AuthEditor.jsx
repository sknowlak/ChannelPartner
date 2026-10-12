import { useTranslation } from 'react-i18next';
import PasswordInput from './PasswordInput';

// How Leadrat signs in to another system's API (section 51) - shared by
// push webhooks and pull sources, and (HMAC only) by receive sources to
// check incoming signatures. Secrets come back from the server masked
// ("••••abcd"); leaving a masked value as-is keeps the stored secret.

// Values are sent to the API; labels are translation keys (auth.types.*).
const TYPES = ['NONE', 'API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'HMAC'];

function Field({ label, children, hint }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <span className="hint" style={{ fontSize: '0.78rem' }}>{hint}</span>}
    </div>
  );
}

export default function AuthEditor({ value, onChange, allowedTypes, title, direction = 'outbound' }) {
  const { t } = useTranslation(['integrations', 'common']);
  const auth = value || { type: 'NONE' };
  const set = (patch) => onChange({ ...auth, ...patch });
  const types = allowedTypes ? TYPES.filter((type) => allowedTypes.includes(type)) : TYPES;
  const secret = (key, label, hint) => (
    <Field label={label} hint={hint}>
      <PasswordInput autoComplete="new-password" value={auth[key] || ''} onChange={(e) => set({ [key]: e.target.value })} />
    </Field>
  );

  return (
    <div className="card" style={{ background: '#fff', padding: '0.9rem 1rem' }}>
      <h4 style={{ margin: '0 0 0.6rem' }}>{title || t('auth.title')}</h4>
      <div className="form-grid">
        <Field label={t('auth.type')}>
          <select value={auth.type} onChange={(e) => onChange({ type: e.target.value })}>
            {types.map((type) => <option key={type} value={type}>{t(`auth.types.${type}`)}</option>)}
          </select>
        </Field>

        {auth.type === 'API_KEY' && (
          <>
            <Field label={t('auth.keyName')} hint={t('auth.keyNameHint')}>
              <input value={auth.keyName || ''} onChange={(e) => set({ keyName: e.target.value })} placeholder="X-Api-Key" />{/* i18n-ignore: header name */}
            </Field>
            {secret('keyValue', t('auth.keyValue'))}
            <Field label={t('auth.keyIn')}>
              <select value={auth.keyIn || 'HEADER'} onChange={(e) => set({ keyIn: e.target.value })}>
                <option value="HEADER">{t('auth.keyInHeader')}</option>
                <option value="QUERY">{t('auth.keyInQuery')}</option>
              </select>
            </Field>
          </>
        )}

        {auth.type === 'BEARER' && secret('token', t('auth.token'), t('auth.tokenHint'))}

        {auth.type === 'BASIC' && (
          <>
            <Field label={t('common:fields.username')}><input value={auth.username || ''} onChange={(e) => set({ username: e.target.value })} /></Field>
            {secret('password', t('common:fields.password'))}
          </>
        )}

        {auth.type === 'OAUTH2' && (
          <>
            <Field label={t('auth.tokenUrl')} hint={t('auth.tokenUrlHint')}>
              <input value={auth.tokenUrl || ''} onChange={(e) => set({ tokenUrl: e.target.value })} placeholder="https://auth.example.com/oauth/token" />
            </Field>
            <Field label={t('auth.clientId')}><input value={auth.clientId || ''} onChange={(e) => set({ clientId: e.target.value })} /></Field>
            {secret('clientSecret', t('auth.clientSecret'))}
            <Field label={t('auth.scope')}><input value={auth.scope || ''} onChange={(e) => set({ scope: e.target.value })} /></Field>
            <Field label={t('auth.audience')}><input value={auth.audience || ''} onChange={(e) => set({ audience: e.target.value })} /></Field>
            <Field label={t('auth.clientAuth')}>
              <select value={auth.clientAuth || 'BODY'} onChange={(e) => set({ clientAuth: e.target.value })}>
                <option value="BODY">{t('auth.clientAuthBody')}</option>
                <option value="HEADER">{t('auth.clientAuthHeader')}</option>
              </select>
            </Field>
          </>
        )}

        {auth.type === 'HMAC' && (
          <>
            {secret('secret', t('auth.sharedSecret'))}
            <Field label={t('auth.signatureHeader')} hint={direction === 'inbound' ? t('auth.signatureHeaderInbound') : t('auth.signatureHeaderOutbound')}>
              <input value={auth.signatureHeader || ''} onChange={(e) => set({ signatureHeader: e.target.value })} placeholder="X-Signature" />{/* i18n-ignore: header name */}
            </Field>
            <Field label={t('auth.algorithm')}>
              <select value={auth.algorithm || 'sha256'} onChange={(e) => set({ algorithm: e.target.value })}>
                <option value="sha256">SHA-256</option>{/* i18n-ignore: algorithm name */}
                <option value="sha1">SHA-1</option>{/* i18n-ignore: algorithm name */}
                <option value="sha512">SHA-512</option>{/* i18n-ignore: algorithm name */}
              </select>
            </Field>
            <Field label={t('auth.encoding')}>
              <select value={auth.encoding || 'hex'} onChange={(e) => set({ encoding: e.target.value })}>
                <option value="hex">Hex</option>{/* i18n-ignore: encoding name */}
                <option value="base64">Base64</option>{/* i18n-ignore: encoding name */}
              </select>
            </Field>
            <Field label={t('auth.prefix')} hint={t('auth.prefixHint')}>
              <input value={auth.signaturePrefix || ''} onChange={(e) => set({ signaturePrefix: e.target.value })} />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
