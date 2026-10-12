const Builder = require('../../models/Builder');
const BuilderUser = require('../../models/BuilderUser');
const Project = require('../../models/Project');
const Registration = require('../../models/Registration');
const { nextId } = require('../../utils/idGenerator');
const { hashPassword, passwordProblem } = require('../../services/partnerAuthService');
const { isValidEmail } = require('../../utils/email');
const { logEvent } = require('../../services/auditService');

// Admin management of builders, their portal users and their projects
// (section 52). Builders don't sign themselves up: an admin creates the
// organization, its users and the projects partners can refer leads to.

const str = (v, max = 200) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const STATUSES = ['ACTIVE', 'INACTIVE'];

function safeUser(u) {
  const { passwordHash, passwordChangedAt, ...rest } = u.toObject(); // eslint-disable-line no-unused-vars
  return rest;
}

async function audit(req, eventType, description, newValue) {
  await logEvent({ registrationId: 'BUILDERS', eventType, actor: `ADMIN:${req.admin.email}`, newValue, description });
}

async function listBuilders(req, res, next) {
  try {
    const builders = await Builder.find().sort({ name: 1 });
    const [users, projects] = await Promise.all([BuilderUser.find(), Project.find()]);
    return res.json({
      builders: builders.map((b) => ({
        ...b.toObject(),
        userCount: users.filter((u) => u.builderId === b.builderId).length,
        projectCount: projects.filter((p) => p.builderId === b.builderId).length
      }))
    });
  } catch (err) {
    next(err);
  }
}

async function getBuilder(req, res, next) {
  try {
    const builder = await Builder.findOne({ builderId: String(req.params.builderId) });
    if (!builder) return res.status(404).json({ reason: 'Builder not found' });
    const [users, projects] = await Promise.all([
      BuilderUser.find({ builderId: builder.builderId }).sort({ name: 1 }),
      Project.find({ builderId: builder.builderId }).sort({ name: 1 })
    ]);
    return res.json({ builder, users: users.map(safeUser), projects });
  } catch (err) {
    next(err);
  }
}

async function createBuilder(req, res, next) {
  try {
    const name = str(req.body.name, 120);
    if (!name) return res.status(400).json({ reason: 'name is required', fieldKey: 'name' });
    const builder = await Builder.create({ builderId: await nextId('BLD'), name, createdBy: `ADMIN:${req.admin.email}` });
    await audit(req, 'BUILDER_CREATED', `Created builder ${name}`, { builderId: builder.builderId });
    return res.status(201).json(builder);
  } catch (err) {
    next(err);
  }
}

async function updateBuilder(req, res, next) {
  try {
    const builder = await Builder.findOne({ builderId: String(req.params.builderId) });
    if (!builder) return res.status(404).json({ reason: 'Builder not found' });
    if (req.body.name !== undefined) builder.name = str(req.body.name, 120) || builder.name;
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ reason: 'status must be ACTIVE or INACTIVE' });
      builder.status = req.body.status;
    }
    await builder.save();
    await audit(req, 'BUILDER_UPDATED', `Updated builder ${builder.name}`, { builderId: builder.builderId, status: builder.status });
    return res.json(builder);
  } catch (err) {
    next(err);
  }
}

async function createBuilderUser(req, res, next) {
  try {
    const builder = await Builder.findOne({ builderId: String(req.params.builderId) });
    if (!builder) return res.status(404).json({ reason: 'Builder not found' });
    const name = str(req.body.name, 120);
    const email = str(req.body.email, 254).toLowerCase();
    if (!name) return res.status(400).json({ reason: 'name is required', fieldKey: 'name' });
    if (!isValidEmail(email)) return res.status(400).json({ reason: 'Enter a valid email address', fieldKey: 'email' });
    const problem = passwordProblem(req.body.password);
    if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
    if (await BuilderUser.exists({ email })) return res.status(409).json({ reason: 'A builder user with this email already exists', fieldKey: 'email' });

    const user = await BuilderUser.create({
      builderUserId: await nextId('BUSR'),
      builderId: builder.builderId,
      name,
      email,
      passwordHash: await hashPassword(req.body.password)
    });
    await audit(req, 'BUILDER_USER_CREATED', `Added ${name} to builder ${builder.name}`, { builderUserId: user.builderUserId });
    return res.status(201).json(safeUser(user));
  } catch (err) {
    next(err);
  }
}

async function updateBuilderUser(req, res, next) {
  try {
    const user = await BuilderUser.findOne({ builderUserId: String(req.params.builderUserId) });
    if (!user) return res.status(404).json({ reason: 'Builder user not found' });
    if (req.body.name !== undefined) user.name = str(req.body.name, 120) || user.name;
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ reason: 'status must be ACTIVE or INACTIVE' });
      user.status = req.body.status;
    }
    if (req.body.password) {
      const problem = passwordProblem(req.body.password);
      if (problem) return res.status(400).json({ reason: problem, fieldKey: 'password' });
      user.passwordHash = await hashPassword(req.body.password);
      user.passwordChangedAt = new Date(); // signs the user out everywhere
    }
    await user.save();
    await audit(req, 'BUILDER_USER_UPDATED', `Updated builder user ${user.name}`, { builderUserId: user.builderUserId, status: user.status, passwordReset: !!req.body.password });
    return res.json(safeUser(user));
  } catch (err) {
    next(err);
  }
}

async function listProjects(req, res, next) {
  try {
    const filter = {};
    if (req.query.builderId) filter.builderId = String(req.query.builderId);
    return res.json({ projects: await Project.find(filter).sort({ name: 1 }) });
  } catch (err) {
    next(err);
  }
}

async function createProject(req, res, next) {
  try {
    const projectId = str(req.body.projectId, 60);
    const name = str(req.body.name, 120);
    const builderId = str(req.body.builderId, 60);
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.-]*$/.test(projectId)) {
      return res.status(400).json({ reason: 'Project code may use letters, numbers, spaces, dot, dash and underscore', fieldKey: 'projectId' });
    }
    if (!name) return res.status(400).json({ reason: 'name is required', fieldKey: 'name' });
    if (!(await Builder.exists({ builderId }))) return res.status(400).json({ reason: 'Unknown builder', fieldKey: 'builderId' });
    if (await Project.exists({ projectId })) return res.status(409).json({ reason: 'A project with this code already exists', fieldKey: 'projectId' });

    const project = await Project.create({ projectId, name, builderId, city: str(req.body.city, 100) });
    // Leads already registered with this project code start waiting for the builder's decision.
    const linked = await Registration.updateMany({ projectId, referralStatus: 'NOT_REFERRED' }, { $set: { referralStatus: 'PENDING_BUILDER' } });
    await audit(req, 'PROJECT_CREATED', `Created project ${name} (${projectId})`, { projectId, builderId, linkedLeads: linked.modifiedCount });
    return res.status(201).json(project);
  } catch (err) {
    next(err);
  }
}

// The owning builder is fixed once set - moving a project would silently
// hand its referrals (and their history) to another organization.
async function updateProject(req, res, next) {
  try {
    const project = await Project.findOne({ projectId: String(req.params.projectId) });
    if (!project) return res.status(404).json({ reason: 'Project not found' });
    if (req.body.builderId !== undefined && req.body.builderId !== project.builderId) {
      return res.status(400).json({ reason: 'A project cannot be moved to another builder' });
    }
    if (req.body.name !== undefined) project.name = str(req.body.name, 120) || project.name;
    if (req.body.city !== undefined) project.city = str(req.body.city, 100);
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ reason: 'status must be ACTIVE or INACTIVE' });
      project.status = req.body.status;
    }
    await project.save();
    await audit(req, 'PROJECT_UPDATED', `Updated project ${project.name}`, { projectId: project.projectId, status: project.status });
    return res.json(project);
  } catch (err) {
    next(err);
  }
}

module.exports = { listBuilders, getBuilder, createBuilder, updateBuilder, createBuilderUser, updateBuilderUser, listProjects, createProject, updateProject };
