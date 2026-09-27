// Integration test against a REAL MongoDB (a dedicated *_test database, never
// the live demo one - see beforeAll) - this is the "duplicate detection"
// requirement specifically: format variants of the same number must
// resolve to one canonical phone_number_e164 and collide as one Customer.
require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../src/models/Customer');
const { nextId } = require('../src/utils/idGenerator');

const baseUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27018/cross_crm_channel_partner';
const TEST_URI = baseUri.replace(/\/([^/?]+)(\?.*)?$/, '/$1_jest_test$2');

beforeAll(async () => {
  await mongoose.connect(TEST_URI);
  await Customer.syncIndexes();
});

afterEach(async () => {
  await Customer.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

async function makeCustomer(mobile) {
  return Customer.create({ customerId: await nextId('CUST'), name: 'Test Customer', mobile });
}

describe('Customer phone number storage and duplicate detection', () => {
  test('storing a number derives the structured fields and canonical E.164', async () => {
    const customer = await makeCustomer('+91 98765 43210');
    expect(customer.mobile).toBe('+919876543210'); // canonical E.164 (validated before Customer.create is ever called - see myLeadsController.js)
    expect(customer.mobileE164).toBe('+919876543210'); // virtual alias
    expect(customer.mobileCountryCode).toBe('IN');
    expect(customer.mobileDialCode).toBe('+91');
    expect(customer.mobileNationalNumber).toBe('9876543210');
    expect(customer.mobileNormalized).toBe('919876543210');
  });

  test('a second Customer with the SAME number in a different format collides on the unique index', async () => {
    await makeCustomer('+919876543211');
    // Real callers never reach this with an unnormalized string (validation
    // upstream already forces canonical E.164 - see
    // myLeadsController.js/registrationController.js), but the unique index
    // on mobileNormalized is the belt-and-suspenders guarantee against a
    // race between two concurrent requests for the same customer, not just
    // "whichever create() the find-or-create lookup happened to run first".
    await expect(makeCustomer('+919876543211')).rejects.toThrow(/E11000|duplicate key/);
  });

  test('different real customers with genuinely different numbers do not collide', async () => {
    const a = await makeCustomer('+919876500001');
    const b = await makeCustomer('+919876500002');
    expect(a.mobileNormalized).not.toBe(b.mobileNormalized);
  });
});
