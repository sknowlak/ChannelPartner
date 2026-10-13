import { useTranslation } from 'react-i18next';
import { COMMON_TIMEZONES, detectBrowserTimezone } from '../utils/timezone';

// Timezone picker (section 60). '' = Automatic: times follow the device the
// person is using (and change with it when they travel); any other value is
// a fixed IANA zone. A saved zone outside the common list stays selectable.
export default function TimezoneSelect({ value, onChange, required, id }) {
  const { t } = useTranslation('common');
  const v = value || '';
  const zones = !v || COMMON_TIMEZONES.includes(v) ? COMMON_TIMEZONES : [v, ...COMMON_TIMEZONES];
  return (
    <select id={id} value={v} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{t('fields.autoTimezone', { timezone: detectBrowserTimezone() })}</option>
      {zones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
    </select>
  );
}
