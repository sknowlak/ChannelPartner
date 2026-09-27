function prettyPrint(text) {
  if (!text) return '(empty)';
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ margin: 0 }}>Delivery Detail - {delivery.deliveryId}</h3>
          <button className="link" onClick={onClose}>Close</button>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem' }}>
          <span className={`badge ${delivery.status === 'SUCCESS' ? 'accepted' : 'rejected'}`}>
            {delivery.status === 'SUCCESS' ? 'Pass' : 'Fail'}
          </span>
          <span className="hint">HTTP {delivery.httpStatus ?? '(no response)'}</span>
          <span className="hint">Attempt {delivery.attempt}</span>
        </div>

        {delivery.errorMessage && <div className="error-box">{delivery.errorMessage}</div>}

        <h3 className="form-section-title"><span>Request Sent</span></h3>
        <div className="field">
          <label>URL</label>
          <input readOnly value={`${delivery.requestMethod} ${delivery.requestUrl}`} />
        </div>
        <div className="field">
          <label>Headers</label>
          <textarea readOnly rows={4} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(JSON.stringify(delivery.requestHeaders))} />
        </div>
        <div className="field">
          <label>Body</label>
          <textarea readOnly rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(delivery.requestBody)} />
        </div>

        <h3 className="form-section-title"><span>Response Received</span></h3>
        <div className="field">
          <label>Body</label>
          <textarea readOnly rows={6} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} value={prettyPrint(delivery.responseBody)} />
        </div>

        <p className="hint">
          A "Pass" here only means the target server returned an HTTP 2xx status - it does not confirm the
          receiving system actually stored or processed the lead. Check the response body above for what it
          actually said; if it's blank or just an acknowledgement, that system may be receiving the request
          but rejecting or ignoring the payload internally (wrong field names/format for its API, a
          required field on its side that this payload doesn't include, etc).
        </p>
      </div>
    </div>
  );
}
