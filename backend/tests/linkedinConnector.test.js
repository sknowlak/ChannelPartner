// LinkedIn connector (section 59): pure parts - lead mapping, token
// encryption, webhook signature/challenge, conversion payload.
process.env.LINKEDIN_CLIENT_ID = 'cid';
process.env.LINKEDIN_CLIENT_SECRET = 'top-secret';

const crypto = require('crypto');
const { seal, open } = require('../src/utils/secretBox');
const { mapLinkedInLead, formIdOf } = require('../src/services/linkedin/linkedinLeadService');
const { challengeResponse, validSignature } = require('../src/services/linkedin/linkedinConnectorService');
const { eventBody } = require('../src/services/linkedin/linkedinCapiService');

const form = {
  content: {
    questions: [
      { questionId: 1, predefinedField: 'FIRST_NAME' },
      { questionId: 2, predefinedField: 'LAST_NAME' },
      { questionId: 3, predefinedField: 'EMAIL' },
      { questionId: 4, predefinedField: 'PHONE_NUMBER' },
      { questionId: 5, predefinedField: 'JOB_TITLE' },
      { questionId: 6, question: { localized: { en_US: 'Budget' } }, questionDetails: { multipleChoiceQuestionDetails: { options: [{ id: 1, text: { localized: { en_US: 'Under 1 Cr' } } }, { id: 2, text: { localized: { en_US: '1-2 Cr' } } }] } } }
    ]
  }
};
const text = (questionId, answer) => ({ questionId, answerDetails: { textQuestionAnswer: { answer } } });
const lead = (answers, extra = {}) => ({ id: 'L1', formResponse: { answers }, ...extra });

describe('LinkedIn lead mapping', () => {
  test('predefined fields -> customer + lead fields; custom answers -> notes', () => {
    const { body } = mapLinkedInLead(
      lead([text(1, 'Ananya'), text(2, 'Rao'), text(3, 'a@x.com'), text(4, '9876543210'), text(5, 'CTO'), { questionId: 6, answerDetails: { multipleChoiceAnswer: { options: [2] } } }]),
      form,
      { defaultCountry: 'IN', formName: 'Brochure', campaignName: 'Launch' }
    );
    expect(body.customer).toEqual({ name: 'Ananya Rao', mobile: '9876543210', mobileCountry: 'IN', email: 'a@x.com' });
    expect(body).toMatchObject({ leadSource: 'LinkedIn', subSource: 'Brochure', campaignNames: ['Launch'], designation: 'CTO' });
    expect(body.notes).toContain('Budget: 1-2 Cr');
    expect(body.notes).toContain('Campaign: Launch');
  });

  test('a +country number keeps its own country', () => {
    const { body } = mapLinkedInLead(lead([text(1, 'A'), text(2, 'B'), text(4, '+447400123456')]), form, { defaultCountry: 'IN' });
    expect(body.customer.mobile).toBe('+447400123456');
    expect(body.customer.mobileCountry).toBeUndefined();
  });

  test('no phone or no name -> not a lead, with a reason', () => {
    expect(mapLinkedInLead(lead([text(1, 'A'), text(2, 'B'), text(3, 'a@x.com')]), form).error).toMatch(/phone/);
    expect(mapLinkedInLead(lead([text(4, '9876543210')]), form).error).toMatch(/name/);
  });

  test('form ID from a versioned form URN', () => {
    expect(formIdOf('urn:li:versionedLeadGenForm:(urn:li:leadGenForm:3162,4)')).toBe('3162');
  });
});

describe('token encryption', () => {
  test('round-trips, is not plaintext, and differs every time', () => {
    const a = seal('AQX-access-token');
    expect(a.startsWith('enc:v1:')).toBe(true);
    expect(a).not.toContain('AQX');
    expect(seal('AQX-access-token')).not.toBe(a);
    expect(open(a)).toBe('AQX-access-token');
  });
  test('tampering is detected', () => {
    const a = seal('secret');
    const bad = `${a.slice(0, -4)}${a.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA'}`;
    expect(() => open(bad)).toThrow();
  });
});

describe('LinkedIn webhook', () => {
  test('challenge response is HMAC-SHA256(client secret, code)', () => {
    expect(challengeResponse('abc')).toEqual({ challengeCode: 'abc', challengeResponse: crypto.createHmac('sha256', 'top-secret').update('abc').digest('hex') });
  });
  test('signature over "hmacsha256=" + raw body', () => {
    const raw = '{"leadAction":"CREATED"}';
    const sig = crypto.createHmac('sha256', 'top-secret').update(`hmacsha256=${raw}`).digest('hex');
    expect(validSignature(raw, sig)).toBe(true);
    expect(validSignature(raw.replace('CREATED', 'DELETED'), sig)).toBe(false);
    expect(validSignature(raw, '')).toBe(false);
  });
});

describe('Conversions API payload', () => {
  test('lead ID + hashed email, never the plain email', () => {
    const body = eventBody(
      { conversionUrn: 'urn:lla:llaPartnerConversion:1', happenedAt: new Date(1700000000000), leadId: 'L1', eventId: 'leadrat-REG-1-qualified' },
      { contact: { name: 'Ananya Rao', email: ' A@X.com ' } }
    );
    expect(body.user.lead).toBe('urn:li:leadGenFormResponse:L1');
    expect(body.user.userIds).toEqual([{ idType: 'SHA256_EMAIL', idValue: crypto.createHash('sha256').update('a@x.com').digest('hex') }]);
    expect(body.user.userInfo).toEqual({ firstName: 'Ananya', lastName: 'Rao' });
    expect(JSON.stringify(body)).not.toContain('@');
    expect(body).toMatchObject({ conversion: 'urn:lla:llaPartnerConversion:1', conversionHappenedAt: 1700000000000, eventId: 'leadrat-REG-1-qualified' });
  });
});
