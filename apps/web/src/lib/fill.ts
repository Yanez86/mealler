// SPDX-License-Identifier: AGPL-3.0-or-later
// Progress bar fill: starts empty when the bar appears, then grows to its value; later values glide
// from the current width. The CSS transition on `.bar > span` does the animation.

export function fill(node: HTMLElement, percent: number) {
  node.style.width = '0%';
  // Two frames: the empty width is painted first, so the transition has somewhere to start from.
  let frame = requestAnimationFrame(() => {
    frame = requestAnimationFrame(() => (node.style.width = `${percent}%`));
  });
  return {
    update(next: number) {
      cancelAnimationFrame(frame);
      node.style.width = `${next}%`;
    },
    destroy() {
      cancelAnimationFrame(frame);
    }
  };
}
