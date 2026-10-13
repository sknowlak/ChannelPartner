// Page numbers to show in a pager: always the first and last page, the
// current page with `siblings` pages either side, and 'gap' where pages are
// skipped - e.g. 100 pages, on page 50: [1, 'gap', 49, 50, 51, 'gap', 100].
// Always 2 * siblings + 5 items once there are more pages than that, so the
// pager never changes width while paging; a gap never hides a single page.
export function pageWindow(current, total, siblings = 1) {
  const size = 2 * siblings + 5;
  if (total <= size) return Array.from({ length: total }, (_, i) => i + 1);

  const start = Math.max(Math.min(current - siblings, total - 2 * siblings - 2), 3);
  const end = Math.min(Math.max(current + siblings, 2 * siblings + 3), total - 2);
  const pages = [1, start > 3 ? 'gap' : 2];
  for (let p = start; p <= end; p++) pages.push(p);
  pages.push(end < total - 2 ? 'gap' : total - 1, total);
  return pages;
}
