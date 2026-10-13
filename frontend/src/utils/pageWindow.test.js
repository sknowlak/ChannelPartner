import { describe, expect, test } from 'vitest';
import { pageWindow } from './pageWindow';

describe('pageWindow', () => {
  test('few pages: every page number', () => {
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test('many pages: first, last, current with neighbours, gaps between', () => {
    expect(pageWindow(1, 100)).toEqual([1, 2, 3, 4, 5, 'gap', 100]);
    expect(pageWindow(50, 100)).toEqual([1, 'gap', 49, 50, 51, 'gap', 100]);
    expect(pageWindow(100, 100)).toEqual([1, 'gap', 96, 97, 98, 99, 100]);
  });

  test('fixed width, current page shown, never a gap hiding one page', () => {
    for (let total = 1; total <= 60; total++) {
      for (let current = 1; current <= total; current++) {
        const items = pageWindow(current, total);
        const pages = items.filter((p) => p !== 'gap');
        expect(items).toContain(current);
        expect(pages[0]).toBe(1);
        expect(pages[pages.length - 1]).toBe(total);
        expect(items.length).toBe(Math.min(total, 7));
        items.forEach((p, i) => {
          if (p === 'gap') expect(items[i + 1] - items[i - 1]).toBeGreaterThan(2);
        });
      }
    }
  });
});
