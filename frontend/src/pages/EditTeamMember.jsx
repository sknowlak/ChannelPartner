import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getMyProfile, getTeamMember, listRoles, listUserFields, updateTeamMember } from '../api/client';
import { formatDateTime } from '../utils/timezone';
import { PERMISSIONS, PERMISSION_LABELS } from '../utils/permissions';
import { useAuth } from '../context/AuthContext';
import DynamicFieldInput from '../components/DynamicFieldInput';
import { findFieldErrors, focusField } from '../utils/formValidation';

const GROUP_ORDER = ['Basic Information', 'Preferences'];

function sortGroups(groups) {
  return [...groups].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a);
    const bi = GROUP_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function EditTeamMember() {
  const { memberId } = useParams();
  const navigate = useNavigate();
  const { partner } = useAuth();
  const [permissions, setPermissions] = useState(null);
  const [roles, setRoles] = useState([]);
  const [fieldDefs, setFieldDefs] = useState(null);
  const [member, setMember] = useState(null);
  const [values, setValues] = useState(null);
  const [roleId, setRoleId] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState(new Map());

  useEffect(() => {
    Promise.all([getTeamMember(memberId), getMyProfile(), listRoles(), listUserFields()])
      .then(([{ data: memberData }, { data: me }, { data: roleData }, { data: fieldData }]) => {
        setMember(memberData);
        // Username is immutable (shown read-only in the footer meta), so it's
        // excluded from the editable field list even though it's a core field.
        setFieldDefs(fieldData.definitions.filter((d) => d.isEnabled && d.fieldKey !== 'username'));
        setValues({
          name: memberData.name, mobile: memberData.mobile || '', email: memberData.email || '',
          timezone: memberData.timezone, password: '', ...(memberData.customFields || {})
        });
        setRoleId(memberData.roleId);
        setStatus(memberData.status);
        setPermissions(me.permissions || []);
        setRoles(roleData.roles);
      })
      .catch((err) => setError(err.response?.data?.reason || err.message));
  }, [memberId]);

  const setValue = (fieldKey, val) => {
    setValues((v) => ({ ...v, [fieldKey]: val }));
    setFieldErrors((m) => {
      if (!m.has(fieldKey)) return m;
      const next = new Map(m);
      next.delete(fieldKey);
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Password is required to CREATE a member but optional on edit (blank
    // = keep unchanged) - the field catalogue itself doesn't know which
    // form it's rendered in, so that one override stays local to this form.
    const validationDefs = fieldDefs.map((d) => (d.fieldKey === 'password' ? { ...d, isRequired: false } : d));
    const errs = findFieldErrors(validationDefs, values);
    if (errs.length > 0) {
      setFieldErrors(new Map(errs.map((e2) => [e2.fieldKey, e2.message])));
      setError(`${errs.length === 1 ? 'A field needs' : `${errs.length} fields need`} your attention - see below.`);
      focusField(errs[0].fieldKey);
      return;
    }

    setBusy(true);
    try {
      // Only send role/status when they actually changed - the server refuses
      // role changes without MANAGE_ROLES and any change to your own role/status.
      const payload = {};
      if (roleId !== member.roleId) payload.roleId = roleId;
      if (status !== member.status) payload.status = status;
      for (const def of fieldDefs) {
        const val = values[def.fieldKey];
        if (def.fieldKey === 'password') {
          if (val) payload.password = val;
          continue;
        }
        if (val === undefined) continue;
        payload[def.fieldKey] = def.dataType === 'NUMBER' && val !== '' ? Number(val) : val;
      }
      await updateTeamMember(memberId, payload);
      navigate('/team');
    } catch (err) {
      const data = err.response?.data;
      if (data?.fieldKey) {
        setFieldErrors(new Map([[data.fieldKey, data.reason]]));
        setError(data.reason);
        focusField(data.fieldKey);
      } else {
        setError(data?.reason || err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !values) return <div className="page page-wide"><div className="error-box">{error}</div></div>;
  if (!values || !fieldDefs) return <div className="page page-wide">Loading...</div>;

  if (!permissions.includes(PERMISSIONS.MANAGE_TEAM)) {
    return (
      <div className="page page-wide">
        <div className="error-box">You don't have permission to edit team members.</div>
        <Link to="/team"><button className="secondary">Back to Team</button></Link>
      </div>
    );
  }

  // Mirrors the server rules (teamController): you can't change your own
  // role or status, changing a role needs MANAGE_ROLES, and you can only
  // hand out a role whose permissions you hold yourself.
  const isSelf = partner?.memberId === memberId;
  const canAssignRoles = permissions.includes(PERMISSIONS.MANAGE_ROLES) && !isSelf;
  const withinReach = (r) => r.permissions.every((p) => permissions.includes(p));
  const pickRole = (r) => {
    if (canAssignRoles && withinReach(r)) setRoleId(r.roleId);
  };

  return (
    <div className="page page-wide">
      <h1>Edit User</h1>
      {error && <div className="error-box">{error}</div>}

      <form className="card" onSubmit={handleSubmit} noValidate>
        <div className="edit-form-sections">
          {sortGroups([...new Set(fieldDefs.map((d) => d.group))]).map((group) => (
            <div key={group}>
              <h3 className="form-section-title"><span>{group}</span></h3>
              {fieldDefs.filter((d) => d.group === group).map((def) => {
                const isPassword = def.fieldKey === 'password';
                const renderDef = isPassword ? { ...def, isRequired: false } : def;
                return (
                  <div className={`field ${fieldErrors.has(def.fieldKey) ? 'invalid' : ''}`} key={def.fieldKey} id={`field-${def.fieldKey}`}>
                    <label>
                      {isPassword ? 'New Password (leave blank to keep unchanged)' : `${def.label}${def.isRequired ? ' *' : ''}`}
                    </label>
                    <DynamicFieldInput def={renderDef} value={values[def.fieldKey]} onChange={(val) => setValue(def.fieldKey, val)} />
                    {fieldErrors.has(def.fieldKey) && <span className="field-error">{fieldErrors.get(def.fieldKey)}</span>}
                  </div>
                );
              })}
              {group === 'Preferences' && (
                <div className="field">
                  <label>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={isSelf}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              )}
            </div>
          ))}

          <div>
            <h3 className="form-section-title"><span>Role &amp; Permissions</span></h3>
            {isSelf && <p className="hint">You can't change your own role or status.</p>}
            {!isSelf && !permissions.includes(PERMISSIONS.MANAGE_ROLES) && (
              <p className="hint">Changing a member's role needs the Manage Roles permission.</p>
            )}
            <div className="role-picker">
              {roles.map((r) => (
                <div
                  key={r.roleId}
                  className={`role-picker-item ${roleId === r.roleId ? 'selected' : ''}`}
                  style={canAssignRoles && withinReach(r) ? undefined : { opacity: roleId === r.roleId ? 1 : 0.5, cursor: 'not-allowed' }}
                  onClick={() => pickRole(r)}
                >
                  <div className="role-name">
                    <input type="radio" checked={roleId === r.roleId} onChange={() => pickRole(r)} disabled={!canAssignRoles || !withinReach(r)} />
                    {r.name}
                  </div>
                  <div className="role-perms">
                    {r.permissions.length ? r.permissions.map((p) => PERMISSION_LABELS[p]).join(' · ') : 'No permissions'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="edit-form-footer">
          <div className="meta">
            <span><strong>Username</strong>{member.username}</span>
            <span><strong>Added By</strong>{member.createdBy || '-'}</span>
            <span><strong>Added On</strong>{formatDateTime(member.createdAt, partner.timezone)}</span>
          </div>
          <div className="actions">
            <button className="secondary" type="button" onClick={() => navigate('/team')}>Cancel</button>
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      </form>
    </div>
  );
}
