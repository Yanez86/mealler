// SPDX-License-Identifier: AGPL-3.0-or-later
// Scrolls a message into view when it appears: errors sit at the bottom of long forms, out of sight
// when they come from a button higher up (a photo that couldn't be read).
export function reveal(node: HTMLElement) {
  node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
