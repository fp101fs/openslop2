/**
 * Pause switch for the menu's 3D model viewers (title hero, race / unit heroes, live figures). While the "Starting game" modal
 * is up they fade out quickly and stop drawing, so the match loading behind it gets the whole GPU / main thread (they would
 * only stutter anyway); they fade back in when the modal closes on the menu.
 */
let paused = false;
let timer = 0;

export const menu3dPaused = () => paused;

export function setMenu3dPaused(on: boolean) {
  window.clearTimeout(timer);
  if (on) {
    document.body.classList.add('menu3d-off'); // CSS fade (0.2 s)
    timer = window.setTimeout(() => { paused = true; }, 220); // then stop drawing
  } else {
    paused = false; // draw again first, then fade in
    requestAnimationFrame(() => document.body.classList.remove('menu3d-off'));
  }
}
