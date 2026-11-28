// Five real units, one soldier each, with the stats of the game's own tables (patch 9.0.5).
// Read from land_units (melee attack, melee defence, armour type, bonus hit points),
// unit_armour_types (armour value), battle_entities (the soldier's 8 base hit points) and
// melee_weapons (damage, armour-piercing damage, attack interval). Hit points per soldier
// = 8 + the unit's bonus. Charge bonus, the shield and weapon bonuses against large targets
// are not part of this duel model. men = soldiers in the unit at the game's largest unit
// size (main_units.num_men), used by stage 6.
// The pictures are simple drawings made for this page, not the game's unit cards.
export const UNITS = [
  {
    id: 'zombies', name: 'Zombies', faction: 'Vampire Counts', cost: 100, rank: 'trash',
    stats: { attack: 5, defence: 6, base: 16, ap: 2, armour: 0, hp: 77, interval: 43, men: 160 },
    // A rotting head: uneven eyes, a stitched mouth.
    icon: `<ellipse cx="20" cy="21" rx="11" ry="13" fill="#8a9b6e"/>
      <path d="M11 15 q4 -9 12 -7" stroke="#5d6b48" stroke-width="2" fill="none"/>
      <circle cx="15.5" cy="19" r="3.2" fill="#1d2016"/><circle cx="25" cy="20" r="2.2" fill="#1d2016"/>
      <circle cx="15.5" cy="19" r="1" fill="#c9d48a"/>
      <path d="M13 28 h14" stroke="#1d2016" stroke-width="1.6"/>
      <path d="M15 26 v4 M18.5 26 v4 M22 26 v4 M25.5 26 v4" stroke="#1d2016" stroke-width="1.2"/>`,
  },
  {
    id: 'goblins', name: 'Goblins (Spears)', faction: 'Greenskins', cost: 325, rank: 'low',
    stats: { attack: 18, defence: 28, base: 17, ap: 6, armour: 25, hp: 56, interval: 46, men: 160 },
    // A goblin head: long pointed ears, a big nose, small yellow eyes.
    icon: `<path d="M9 17 L1 10 L11 22 Z M31 17 L39 10 L29 22 Z" fill="#5f8a2e"/>
      <ellipse cx="20" cy="21" rx="10.5" ry="11" fill="#6f9a3a"/>
      <circle cx="16" cy="18" r="2.4" fill="#f3d23a"/><circle cx="24" cy="18" r="2.4" fill="#f3d23a"/>
      <circle cx="16.4" cy="18.3" r="1" fill="#b3261e"/><circle cx="23.6" cy="18.3" r="1" fill="#b3261e"/>
      <path d="M20 19 L23.5 25 L18.5 25 Z" fill="#577f27"/>
      <path d="M14.5 28 q5.5 3 11 0" stroke="#2c3d12" stroke-width="1.5" fill="none"/>
      <path d="M17 28.6 l1 2 l1 -1.6 M22 28.6 l1 1.8 l1 -2" fill="#f2efe4"/>`,
  },
  {
    id: 'swordsmen', name: 'Swordsmen', faction: 'Empire', cost: 375, rank: 'average',
    stats: { attack: 32, defence: 32, base: 21, ap: 7, armour: 30, hp: 69, interval: 43, men: 120 },
    // A sword in front of a halved Empire shield.
    icon: `<path d="M8 7 h24 v12 q0 11 -12 16 q-12 -5 -12 -16 Z" fill="#b8312f"/>
      <path d="M20 7 h12 v12 q0 11 -12 16 Z" fill="#e5b83b"/>
      <path d="M20 4 L22.2 8 V26 H17.8 V8 Z" fill="#e8e8ea" stroke="#5b5b60" stroke-width=".8"/>
      <rect x="13" y="26" width="14" height="3" rx="1" fill="#6b4a2b"/>
      <rect x="18.6" y="29" width="2.8" height="5.5" fill="#4a3320"/><circle cx="20" cy="35.8" r="1.8" fill="#6b4a2b"/>`,
  },
  {
    id: 'graveguard', name: 'Grave Guard', faction: 'Vampire Counts', cost: 850, rank: 'good',
    stats: { attack: 26, defence: 36, base: 28, ap: 12, armour: 90, hp: 82, interval: 44, men: 120 },
    // A skull in an old helmet.
    icon: `<path d="M10 22 q0 -12 10 -12 q10 0 10 12 v4 q0 3 -3 3 h-1 v4 h-12 v-4 h-1 q-3 0 -3 -3 Z" fill="#e6e1d3"/>
      <path d="M8.5 18 q0 -12 11.5 -12 q11.5 0 11.5 12 Z" fill="#4b5560"/>
      <path d="M19 3 h2 v4 h-2 Z" fill="#7c2730"/><rect x="8" y="17" width="24" height="2.6" rx="1" fill="#2f363d"/>
      <ellipse cx="15.5" cy="23" rx="3" ry="2.8" fill="#16181b"/><ellipse cx="24.5" cy="23" rx="3" ry="2.8" fill="#16181b"/>
      <path d="M20 25.5 l-1.5 3 h3 Z" fill="#16181b"/>
      <path d="M15 30 v3 M18.3 30 v3 M21.7 30 v3 M25 30 v3" stroke="#16181b" stroke-width="1"/>`,
  },
  {
    id: 'chosen', name: 'Chosen', faction: 'Warriors of Chaos', cost: 1250, rank: 'elite',
    stats: { attack: 46, defence: 60, base: 34, ap: 14, armour: 120, hp: 131, interval: 38, men: 80 },
    // A horned Chaos helmet with a glowing visor.
    icon: `<path d="M11 17 q-9 -4 -8 -14 q4 8 11 9 Z M29 17 q9 -4 8 -14 q-4 8 -11 9 Z" fill="#d9cfb4"/>
      <path d="M10 18 q0 -11 10 -11 q10 0 10 11 v8 q0 6 -10 10 q-10 -4 -10 -10 Z" fill="#3a3f47"/>
      <path d="M10 18 q0 -11 10 -11 q10 0 10 11" fill="none" stroke="#b08d3c" stroke-width="1.4"/>
      <path d="M13 20 h14 v2.6 h-5.6 v9 h-2.8 v-9 h-5.6 Z" fill="#ff5a2a"/>`,
  },
];

// The small square button that holds a unit's picture.
export const unitIcon = (u) => `<svg viewBox="0 0 40 40" aria-hidden="true">${u.icon}</svg>`;
