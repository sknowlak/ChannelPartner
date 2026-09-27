// Three-state column sort (normal -> ascending -> descending -> normal),
// shared by every data-grid page (section 39) so "click a column header to
// sort" behaves identically everywhere in the app.

export function nextSortDir(current) {
  if (current === 'asc') return 'desc';
  if (current === 'desc') return null;
  return 'asc';
}

function compareValues(a, b) {
  const av = a === undefined || a === null ? '' : a;
  const bv = b === undefined || b === null ? '' : b;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' });
}

export function applySort(rows, sort, accessors) {
  if (!sort.key || !sort.dir) return rows;
  const accessor = accessors[sort.key];
  if (!accessor) return rows;
  const sorted = [...rows].sort((a, b) => compareValues(accessor(a), accessor(b)));
  return sort.dir === 'desc' ? sorted.reverse() : sorted;
}
