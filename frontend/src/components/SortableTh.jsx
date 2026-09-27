// Clickable column header cycling normal -> ascending -> descending -> normal
// (section 39). Pair with utils/sort.js's applySort() using the same colKey.
export default function SortableTh({ label, colKey, sort, onSort }) {
  const active = sort.key === colKey;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th className="sortable-th" onClick={() => onSort(colKey)}>
      {label}<span className={`sort-arrow ${active ? 'active' : ''}`}>{arrow}</span>
    </th>
  );
}
