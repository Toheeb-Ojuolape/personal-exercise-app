// Inline 24×24 stroke icons. Single source so weight/joins stay consistent.

const ICON_PATHS = {
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-5.2-4.2-6.6-4.2-10.4 0 0-3.2 1.9-3.2 5.1 0 1.6-1 2.2-1.7 1.3-.6-.8-1-2.1-1-2.1C6.6 11 5 13 5 15a7 7 0 0 0 7 7Z"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3 9.5v5M21 9.5v5M6.5 12h11"/>',
  // Split into separate elements so the tab bar can animate the parts.
  chart:
    '<path class="bar b1" d="M4.5 20.5V12"/>' +
    '<path class="bar b2" d="M12 20.5V4.5"/>' +
    '<path class="bar b3" d="M19.5 20.5v-5.5"/>',
  user:
    '<circle class="head" cx="12" cy="8" r="3.75"/>' +
    '<path class="body" d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2.5 12h2M19.5 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M20.5 13.4A8.5 8.5 0 1 1 10.6 3.5a6.7 6.7 0 0 0 9.9 9.9Z"/>',
  check: '<path d="m20 6.5-10.5 11L4 12"/>',
  play: '<path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" stroke="none"/>',
  edit: '<path d="M12 20.5h8.5"/><path d="M16.8 3.7a2.1 2.1 0 0 1 3 3L8.4 18.1l-4 1 1-4L16.8 3.7Z"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M3.5 6.5h17M9 6.5V4.5h6v2M6 6.5l1 14h10l1-14"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/>',
  scale: '<path d="M4.5 20.5h15M6.5 20.5V9.5h11v11M12 9.5V5.5M9 5.5h6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.75v.5"/>',
  fire: '<path d="M12 22a7 7 0 0 0 7-7c0-5.2-4.2-6.6-4.2-10.4 0 0-3.2 1.9-3.2 5.1 0 1.6-1 2.2-1.7 1.3-.6-.8-1-2.1-1-2.1C6.6 11 5 13 5 15a7 7 0 0 0 7 7Z"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  camera:
    '<path d="M21.5 18.5a1.8 1.8 0 0 1-1.8 1.8H4.3a1.8 1.8 0 0 1-1.8-1.8V8.8A1.8 1.8 0 0 1 4.3 7h3.4l1.7-2.6h5.2L16.3 7h3.4a1.8 1.8 0 0 1 1.8 1.8Z"/><circle cx="12" cy="13.2" r="3.4"/>',
  image:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4 17 5-4.5 4.5 4L17 13l3 2.6"/>',

  // Human-figure pictograms for the four training days — Olympic-pictogram
  // style: filled head, chunky rounded limbs, solid barbell.
  dayPush: // push-up, side on
    '<circle cx="17.1" cy="9.3" r="2.05" fill="currentColor" stroke="none"/>' +
    '<path d="M15.2 10.8 7 14.6" stroke-width="2.6"/>' +
    '<path d="M15.5 11.1v6.8" stroke-width="2.2"/>' +
    '<path d="M7 14.6 3.9 17.9" stroke-width="2.2"/>' +
    '<rect x="2.2" y="19.2" width="19.6" height="1.85" rx="0.92" fill="currentColor" stroke="none"/>',

  daySquat: // bodyweight squat, side on — one leg, so the knee bend stays readable
    '<circle cx="9.7" cy="4.1" r="2.05" fill="currentColor" stroke="none"/>' +
    '<path d="M10.3 6.1 12.7 11.5" stroke-width="2.6"/>' +
    '<path d="M10.9 7.8 16.6 9" stroke-width="2.15"/>' +
    '<path d="M12.7 11.5 7.2 13.7l1 6.5" stroke-width="2.3" stroke-linejoin="round"/>' +
    '<rect x="5.2" y="20.2" width="7.4" height="1.8" rx="0.9" fill="currentColor" stroke="none"/>',

  dayPull: // pull-up, front on — hanging body is unmistakable next to the others
    '<rect x="2.4" y="1.9" width="19.2" height="1.85" rx="0.92" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="9.1" r="2.05" fill="currentColor" stroke="none"/>' +
    '<path d="M8.1 4.1 8.7 7.9l1.6 2.8" stroke-width="2.15"/>' +
    '<path d="M15.9 4.1 15.3 7.9l-1.6 2.8" stroke-width="2.15"/>' +
    '<path d="M12 11.5v4.9" stroke-width="2.6"/>' +
    '<path d="M12 16.4 10.2 21.2" stroke-width="2.15"/>' +
    '<path d="m12 16.4 1.8 4.8" stroke-width="2.15"/>',

  dayHinge: // deadlift, side on — hinged torso with the bar at the shins
    '<circle cx="6.2" cy="6" r="2.05" fill="currentColor" stroke="none"/>' +
    '<path d="M8.1 7.9 14.8 10.8" stroke-width="2.6"/>' +
    '<path d="M9 8.7v6.1" stroke-width="2.15"/>' +
    '<rect x="4.4" y="15" width="9.2" height="1.85" rx="0.92" fill="currentColor" stroke="none"/>' +
    '<path d="M14.8 10.8 14.3 16l1 4.8" stroke-width="2.25" stroke-linejoin="round"/>',
};

function icon(name, size = 24) {
  const d = ICON_PATHS[name] || "";
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false">${d}</svg>`;
}
