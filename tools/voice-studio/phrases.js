// Preset phrase banks. These are original lines written in the style of each
// unit type. Use "Import phrases" in the UI to load your own lists
// (same shape as tools/tts/terran_lines.json, or { race, units: { name: { voice, speed, lines: [] } } }).

export const PHRASES = {
  terran: {
    Marine: { voice: "am_adam", speed: 1.1, lines: ["Locked on and ready!", "Point me at something.", "Moving, moving!", "Copy that, sarge.", "Boots on the ground.", "Hostiles inbound!", "Light 'em up!"] },
    SCV: { voice: "am_michael", speed: 1.05, lines: ["Rig's warmed up.", "Yeah, I can build that.", "On my way, boss.", "Another day, another wall.", "Mining crew standing by.", "Built and bolted."] },
    Marauder: { voice: "am_onyx", speed: 0.95, lines: ["Heavy armor rolling.", "Say the word.", "Time to slow 'em down.", "Nothing gets past me.", "Shells loaded."] },
    Medic: { voice: "af_sarah", speed: 1.05, lines: ["Medic on station.", "Who needs patching up?", "Hold still, this'll sting.", "Keep your heads down.", "Vitals look good."] },
    Ghost: { voice: "af_nova", speed: 1.0, lines: ["Target acquired.", "Cloak engaged.", "Silent and ready.", "Nuke inbound.", "They never see it coming."] },
    "Siege Tank": { voice: "am_fenrir", speed: 1.0, lines: ["Tank crew ready.", "Locking down.", "Siege mode engaged.", "Give me coordinates.", "Big guns online."] },
    Battlecruiser: { voice: "bm_george", speed: 0.92, lines: ["Bridge, all systems green.", "Hull integrity holding.", "Charging main cannon.", "Plot a jump, helm.", "Fleet command acknowledged."] },
    Adjutant: { voice: "af_bella", speed: 1.0, fx: { drive: { on: false }, bitcrush: { on: false }, static: { level: 0.015 } }, lines: ["Supply is running low, Commander.", "Mineral reserves depleted.", "Upgrade finished.", "Hostile forces near the outpost.", "Warning: incoming strike.", "New unit deployed."] },
  },
  protoss: {
    Zealot: { voice: "am_onyx", speed: 1.0, lines: ["My blades are yours.", "For the homeworld.", "Honor guides me.", "I charge without fear.", "Victory or oblivion."] },
    Stalker: { voice: "am_fenrir", speed: 0.95, lines: ["I walk the shadows.", "Blinking forward.", "The hunt begins.", "Our enemies will fall.", "Awaiting command."] },
    "High Templar": { voice: "bm_lewis", speed: 0.88, lines: ["The storm gathers.", "I sense their fear.", "Our minds are one.", "Wisdom guides my hand.", "Let the psionic winds rise."] },
    Archon: { voice: "am_echo", speed: 0.85, fx: { ghost: { on: true, mix: 0.4, detune: 5 } }, lines: ["Our light consumes.", "We are united.", "Two minds, one flame.", "Burn bright."] },
    Carrier: { voice: "bm_george", speed: 0.9, lines: ["Interceptors launching.", "The fleet stands ready.", "Our sky, our will.", "Commence the assault."] },
    Executor: { voice: "bm_daniel", speed: 0.9, lines: ["Warp gate online.", "Pylon power required.", "Our forces assemble.", "Stand together, warriors.", "The Khala endures."] },
  },
  zerg: {
    Queen: { voice: "af_nicole", speed: 0.85, lines: ["The brood obeys.", "Spawn more larvae.", "My children hunger.", "Spread the creep.", "The hive grows."] },
    "Swarm Queen": { voice: "af_heart", speed: 0.8, lines: ["I am the swarm.", "Nothing escapes my reach.", "Feel my will.", "They will all kneel.", "Evolve, my children."] },
    Overmind: { voice: "am_onyx", speed: 0.75, fx: { pitch: { semis: -7 } }, lines: ["The swarm awakens.", "All shall be consumed.", "We hunger.", "Adapt and devour."] },
    Hivemind: { voice: "af_sky", speed: 0.8, lines: ["The swarm needs more control.", "Resources are scarce.", "A new chamber has formed.", "Our nest is threatened.", "The mutation is done."] },
  },
};
