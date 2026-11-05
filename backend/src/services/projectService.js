const Project = require('../models/Project');
const Builder = require('../models/Builder');
const { getSettings, MATCH_FIELDS } = require('./settingsService');

// Projects decide which builder a referral goes to (section 52). A lead's
// projectId must be blank (not referred yet) or an ACTIVE project whose
// builder is ACTIVE - free text used to be accepted, which meant no builder
// could ever be scoped to it.
async function resolveProject(projectId) {
  const code = String(projectId || '').trim();
  if (!code) return { project: null };
  const project = await Project.findOne({ projectId: code, status: 'ACTIVE' });
  if (!project) return { error: `Unknown project "${code}" - pick one from the project list` };
  const builder = await Builder.findOne({ builderId: project.builderId, status: 'ACTIVE' });
  if (!builder) return { error: `Project "${code}" is not open for referrals` };
  return { project };
}

function referralStatusFor(projectId) {
  return projectId ? 'PENDING_BUILDER' : 'NOT_REFERRED';
}

async function projectIdsForBuilder(builderId) {
  return (await Project.find({ builderId }).select('projectId')).map((p) => p.projectId);
}

// How long a new registration for this project is protected (section 62):
// the project's own window when the admin set one, else the global setting.
async function protectionDaysFor(projectId) {
  const code = String(projectId || '').trim();
  if (code) {
    const project = await Project.findOne({ projectId: code }).select('protectionDays');
    if (project?.protectionDays) return project.protectionDays;
  }
  return (await getSettings()).duplicateProtectionDays;
}

// The identifiers duplicate matching uses for this project (section 62):
// the project's own list when the admin set one, else the global one.
async function matchFieldsFor(projectId) {
  const code = String(projectId || '').trim();
  if (code) {
    const project = await Project.findOne({ projectId: code }).select('duplicateMatchFields');
    if (project?.duplicateMatchFields?.length) return project.duplicateMatchFields;
  }
  return (await getSettings()).duplicateMatchFields;
}

// Parses the admin's duplicateMatchFields input: null / [] clears the
// override. Returns { value } or { error }.
function parseMatchFields(raw) {
  if (raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) return { value: undefined };
  if (!Array.isArray(raw) || raw.some((f) => !MATCH_FIELDS.includes(f))) {
    return { error: `Duplicate match fields must be a list from: ${MATCH_FIELDS.join(', ')}, or empty for the global default` };
  }
  return { value: [...new Set(raw)] };
}

// Parses the admin's protectionDays input: '' / null clears the override.
// Returns { value } or { error }.
function parseProtectionDays(raw) {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: 'Protection days must be a whole number from 1 to 3650, or empty for the global default' };
  return { value: n };
}

// What partners pick from: active projects of active builders.
async function listOpenProjects() {
  const builders = await Builder.find({ status: 'ACTIVE' });
  const nameById = new Map(builders.map((b) => [b.builderId, b.name]));
  const projects = await Project.find({ status: 'ACTIVE', builderId: { $in: [...nameById.keys()] } }).sort({ name: 1 });
  const { duplicateProtectionDays, duplicateMatchFields: globalMatchFields } = await getSettings();
  return projects.map((p) => ({
    projectId: p.projectId,
    name: p.name,
    city: p.city,
    builderName: nameById.get(p.builderId),
    protectionDays: p.protectionDays || duplicateProtectionDays,
    matchFields: p.duplicateMatchFields?.length ? p.duplicateMatchFields : globalMatchFields
  }));
}

module.exports = { resolveProject, referralStatusFor, projectIdsForBuilder, listOpenProjects, protectionDaysFor, parseProtectionDays, matchFieldsFor, parseMatchFields };
