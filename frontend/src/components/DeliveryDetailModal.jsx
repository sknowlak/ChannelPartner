import { useTranslation } from 'react-i18next';

function prettyPrint(text, emptyText) {
  if (!text) return emptyText;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

// Shows the EXACT request that was sent and the EXACT response that came
// back for one delivery (section 44) - "showing pass but lead not received
// on client account". A 2xx HTTP status only means the receiving server
// acknowledged the request; it says nothing about whether that system's own
// business logic actually accepted the payload. The only way to tell the
// difference is to read what was actually sent and what it actually replied
// with, which the delivery log's summary table doesn't have room for.
export default function DeliveryDetailModal({ delivery, onClose }) {
  const { t } = useTranslation(['integrations', 'common']);
  const empty = t('delivery.empty');
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>{t('delivery.title', { id: delivery.deliveryId })}</h3>
          <button className="link" onClick={onClose}>{t('common:actions.close')}</button>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
          <span className={`badge ${delivery.status === 'SUCCESS' ? 'accepted' : 'rejected'}`}>
            {delivery.status === 'SUCCESS' ? t('delivery.pass') : t('delivery.fail')}
          </span>
          <span className="hint">{t('delivery.http', { status: delivery.httpStatus ?? t('delivery.noResponse') })}</span>
          <span className="hint">{t('delivery.attempt', { attempt: delivery.attempt })}</span>
        </div>

        {delivery.errorMessage && <div className="error-box">{delivery.errorMessage}</div>}

        <h3 className="form-section-title"><span>{t('delivery.requestSent')}</span></h3>
        <div className="field">
          <label>{t('delivery.url')}</label>
          <input readOnly value={`${delivery.requestMethod} ${delivery.requestUrl}`} />
        </div>
        <div className="field">
          <label>{t('delivery.headers')}</label>
          <textarea readOnly rows={4} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(JSON.stringify(delivery.requestHeaders), empty)} />
        </div>
        <div className="field">
          <label>{t('delivery.body')}</label>
          <textarea readOnly rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(delivery.requestBody, empty)} />
        </div>

        <h3 className="form-section-title"><span>{t('delivery.responseReceived')}</span></h3>
        <div className="field">
          <label>{t('delivery.body')}</label>
          <textarea readOnly rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(delivery.responseBody, empty)} />
        </div>

        <p className="hint">{t('delivery.passExplainer')}</p>
      </div>
    </div>
  );
}
