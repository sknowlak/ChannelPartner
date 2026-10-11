const Project = require('../models/Project');
const Builder = require('../models/Builder');

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

// What partners pick from: active projects of active builders.
async function listOpenProjects() {
  const builders = await Builder.find({ status: 'ACTIVE' });
  const nameById = new Map(builders.map((b) => [b.builderId, b.name]));
  const projects = await Project.find({ status: 'ACTIVE', builderId: { $in: [...nameById.keys()] } }).sort({ name: 1 });
  return projects.map((p) => ({ projectId: p.projectId, name: p.name, city: p.city, builderName: nameById.get(p.builderId) }));
}

module.exports = { resolveProject, referralStatusFor, projectIdsForBuilder, listOpenProjects };
