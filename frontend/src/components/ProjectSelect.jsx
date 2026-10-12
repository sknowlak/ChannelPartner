import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listProjects } from '../api/client';

// Projects come from the builder catalogue (section 52) - the project
// decides which builder a lead is referred to, so it's picked from a list
// instead of typed. Fetched once per page load and shared between fields.
let cache;
function loadProjects() {
  if (!cache) cache = listProjects().then(({ data }) => data.projects).catch((err) => { cache = undefined; throw err; });
  return cache;
}

export default function ProjectSelect({ value, onChange, required }) {
  const { t } = useTranslation('leads');
  const [projects, setProjects] = useState([]);
  useEffect(() => { loadProjects().then(setProjects).catch(() => setProjects([])); }, []);
  // A lead registered before the catalogue existed may hold an unknown code - keep showing it.
  const known = projects.some((p) => p.projectId === value);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{t('project.none')}</option>
      {!known && value && <option value={value}>{t('project.notInList', { project: value })}</option>}
      {projects.map((p) => (
        <option key={p.projectId} value={p.projectId}>{p.name} - {p.builderName}{p.city ? ` (${p.city})` : ''}</option>
      ))}
    </select>
  );
}
