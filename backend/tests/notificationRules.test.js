const { computeFireAt, resolveRecipients } = require('../src/services/notificationService');

// Section 49 - when a rule fires, and who receives it.
describe('computeFireAt', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  const visit = new Date('2026-10-10T09:30:00Z');
  const rule = (mode, amount = 0, unit = 'MINUTES') => ({ timing: { mode, amount, unit } });

  test('IMMEDIATE fires now, with or without a schedule', () => {
    expect(computeFireAt(rule('IMMEDIATE'), null, now)).toEqual(now);
  });

  test('BEFORE / AT / AFTER count from the scheduled time', () => {
    expect(computeFireAt(rule('BEFORE', 15, 'MINUTES'), visit, now).toISOString()).toBe('2026-10-10T09:15:00.000Z');
    expect(computeFireAt(rule('BEFORE', 1, 'DAYS'), visit, now).toISOString()).toBe('2026-10-09T09:30:00.000Z');
    expect(computeFireAt(rule('AT'), visit, now).toISOString()).toBe(visit.toISOString());
    expect(computeFireAt(rule('AFTER', 2, 'HOURS'), visit, now).toISOString()).toBe('2026-10-10T11:30:00.000Z');
  });

  test('month and year offsets use calendar arithmetic', () => {
    expect(computeFireAt(rule('BEFORE', 1, 'MONTHS'), visit, now).toISOString()).toBe('2026-09-10T09:30:00.000Z');
    expect(computeFireAt(rule('BEFORE', 1, 'YEARS'), visit, now).toISOString()).toBe('2025-10-10T09:30:00.000Z');
  });

  test('schedule-based rules need a schedule', () => {
    expect(computeFireAt(rule('BEFORE', 15), null, now)).toBeNull();
  });
});

describe('resolveRecipients', () => {
  const users = [
    { userId: 'PARTNER-1', name: 'Owner', roleId: 'ROLE-SA', status: 'ACTIVE' },
    { userId: 'TM-1', name: 'Priya', roleId: 'ROLE-MGR', status: 'ACTIVE' },
    { userId: 'TM-2', name: 'Ravi', roleId: 'ROLE-MGR', status: 'INACTIVE' },
    { userId: 'TM-3', name: 'Asha', roleId: 'ROLE-EXEC', status: 'ACTIVE' }
  ];
  const registration = { partnerId: 'PARTNER-1', assignedTo: 'TM-3' };
  const job = { context: { actorUserId: 'TM-1' } };
  const names = (recipients) => recipients.map((u) => u.name).sort();

  test('combines assigned user, owner, updater, roles and specific users without duplicates', () => {
    const rule = { recipients: { assignedUser: true, owner: true, updatedBy: true, roleIds: ['ROLE-MGR'], userIds: ['TM-3'] } };
    expect(names(resolveRecipients(rule, { registration, users, job }))).toEqual(['Asha', 'Owner', 'Priya']);
  });

  test('never includes inactive users, even by role or by name', () => {
    const rule = { recipients: { roleIds: ['ROLE-MGR'], userIds: ['TM-2'] } };
    expect(names(resolveRecipients(rule, { registration, users, job }))).toEqual(['Priya']);
  });

  test('assigned-user rule on an unassigned lead sends to nobody', () => {
    const rule = { recipients: { assignedUser: true } };
    expect(resolveRecipients(rule, { registration: { partnerId: 'PARTNER-1', assignedTo: '' }, users, job })).toEqual([]);
  });
});
