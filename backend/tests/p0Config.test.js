// Section 52: configuration guards and helpers that need no database.
// (Authorization behaviour is covered end to end by tests/e2e/accessControl.e2e.mjs.)
const { getJwtSecret } = require('../src/config/jwtSecret');
const { outboundUrlProblem } = require('../src/utils/outboundUrl');
const { generateApiKey, hashApiKey, apiKeyFields } = require('../src/utils/apiKey');
const { contactView, CONTACT_FIELDS } = require('../src/utils/contact');
const { referralStatusFor } = require('../src/services/projectService');

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('JWT secret is mandatory and strong', () => {
  test.each([
    ['missing (outside tests)', { NODE_ENV: 'production', JWT_SECRET: undefined }],
    ['the documented default', { NODE_ENV: 'production', JWT_SECRET: 'change-this-in-production' }],
    ['too short', { NODE_ENV: 'development', JWT_SECRET: 'short-secret' }]
  ])('refuses a secret that is %s', (_, env) => {
    expect(() => withEnv(env, getJwtSecret)).toThrow(/JWT_SECRET/);
  });
  test('accepts a long random secret', () => {
    const secret = 'x'.repeat(48);
    expect(withEnv({ NODE_ENV: 'production', JWT_SECRET: secret }, getJwtSecret)).toBe(secret);
  });
});

describe('private webhook targets', () => {
  test('the development switch allows localhost outside production', async () => {
    const problem = await withEnv({ NODE_ENV: 'development', ALLOW_PRIVATE_WEBHOOK_TARGETS: 'true' }, () => outboundUrlProblem('http://127.0.0.1:5055/x'));
    expect(problem).toBeNull();
  });
  test('...and is ignored in production', async () => {
    const problem = await withEnv({ NODE_ENV: 'production', ALLOW_PRIVATE_WEBHOOK_TARGETS: 'true' }, () => outboundUrlProblem('http://127.0.0.1:5055/x'));
    expect(problem).toMatch(/public/);
  });
});

describe('integration API keys are stored hashed', () => {
  test('hash is stable, never the key itself; prefix is display-only', () => {
    const key = generateApiKey();
    const fields = apiKeyFields(key);
    expect(key).toMatch(/^lr_[a-f0-9]{48}$/);
    expect(fields.apiKeyHash).toBe(hashApiKey(key));
    expect(fields.apiKeyHash).not.toContain(key.slice(3));
    expect(fields.apiKeyPrefix).toBe(key.slice(0, 7));
  });
});

describe('referrals and per-lead contact copies', () => {
  test('a lead is referred only once it has a project', () => {
    expect(referralStatusFor('')).toBe('NOT_REFERRED');
    expect(referralStatusFor('PROJECT-A')).toBe('PENDING_BUILDER');
  });
  test('contactView exposes only the lead\'s own copy, in the shape clients expect', () => {
    const view = contactView({ contact: { name: 'A', mobile: '+919876543210', email: 'a@x.co' }, customerId: 'CUST-1' });
    expect(view).toMatchObject({ name: 'A', mobile: '+919876543210', email: 'a@x.co', alternateMobile: '' });
    expect(view).not.toHaveProperty('customerId');
    expect(CONTACT_FIELDS).toEqual(['name', 'mobile', 'email', 'alternateMobile']);
  });
});
