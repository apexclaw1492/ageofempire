// Central game configuration & balance.
export const MAP = {
  size: 200,        // world units (square)
  cells: 100,       // pathfinding grid resolution per side
  seed: 1337,
};

export const TEAM = {
  PLAYER: 0,
  ENEMY: 1,
};

export const TEAM_COLOR = {
  [TEAM.PLAYER]: 0x3da9fc, // blue
  [TEAM.ENEMY]: 0xef5350,  // red
};

export const AGES = [
  { name: 'Dark Age', advanceCost: { wood: 0, food: 0, gold: 0 } },
  { name: 'Feudal Age', advanceCost: { food: 400, gold: 0, wood: 0 } },
  { name: 'Castle Age', advanceCost: { food: 700, gold: 200, wood: 0 } },
];

// Resource node yields
export const NODE = {
  tree:  { type: 'wood', amount: 120 },
  gold:  { type: 'gold', amount: 220 },
  bush:  { type: 'food', amount: 180 },
};

export const GATHER_RATE = 0.62;      // resource / second per villager
export const CARRY_CAP = 12;          // villager carries this then returns
export const VILLAGER_SPEED = 7.2;
export const SOLDIER_SPEED = 6.4;
export const CAVALRY_SPEED = 9.6;

export const POP_PER_HOUSE = 5;
export const START_POP_CAP = 10;
export const MAX_POP = 60;

// Unit definitions
export const UNIT_DEFS = {
  villager: {
    name: 'Villager', hp: 40, dmg: 4, range: 0.9, speed: VILLAGER_SPEED,
    cost: { food: 50 }, trainTime: 12, pop: 1, minAge: 0, attackCooldown: 1.4,
    armor: 0, kind: 'villager',
  },
  militia: {
    name: 'Militia', hp: 60, dmg: 9, range: 1.0, speed: SOLDIER_SPEED,
    cost: { food: 60, gold: 20 }, trainTime: 16, pop: 1, minAge: 0, attackCooldown: 1.3,
    armor: 1, kind: 'infantry',
  },
  manatarms: {
    name: 'Man-at-Arms', hp: 95, dmg: 14, range: 1.0, speed: SOLDIER_SPEED,
    cost: { food: 60, gold: 30 }, trainTime: 18, pop: 1, minAge: 1, attackCooldown: 1.2,
    armor: 2, kind: 'infantry',
  },
  archer: {
    name: 'Archer', hp: 50, dmg: 11, range: 9.5, speed: SOLDIER_SPEED,
    cost: { wood: 40, gold: 35 }, trainTime: 18, pop: 1, minAge: 1, attackCooldown: 1.6,
    armor: 0, kind: 'archer', ranged: true,
  },
  knight: {
    name: 'Knight', hp: 150, dmg: 20, range: 1.1, speed: CAVALRY_SPEED,
    cost: { food: 90, gold: 70 }, trainTime: 24, pop: 1, minAge: 2, attackCooldown: 1.1,
    armor: 3, kind: 'cavalry',
  },
};

// Building definitions
export const BUILDING_DEFS = {
  towncenter: {
    name: 'Town Center', hp: 2400, size: 7, cost: { wood: 350, stone: 0 },
    buildTime: 0, minAge: 0, provides: ['villager'], dropoff: ['wood','food','gold'],
    popCap: START_POP_CAP, footprint: 4.4,
  },
  house: {
    name: 'House', hp: 550, size: 3, cost: { wood: 30 },
    buildTime: 12, minAge: 0, provides: [], popCap: POP_PER_HOUSE, footprint: 2.0,
  },
  lumbercamp: {
    name: 'Lumber Camp', hp: 600, size: 3, cost: { wood: 100 },
    buildTime: 18, minAge: 0, provides: [], dropoff: ['wood'], footprint: 2.0,
  },
  mill: {
    name: 'Mill', hp: 600, size: 3, cost: { wood: 100 },
    buildTime: 18, minAge: 0, provides: [], dropoff: ['food'], footprint: 2.2,
  },
  miningcamp: {
    name: 'Mining Camp', hp: 600, size: 3, cost: { wood: 100 },
    buildTime: 18, minAge: 0, provides: [], dropoff: ['gold'], footprint: 2.0,
  },
  barracks: {
    name: 'Barracks', hp: 1200, size: 4, cost: { wood: 175 },
    buildTime: 28, minAge: 0, provides: ['militia','manatarms','knight'], footprint: 2.8,
  },
  archery: {
    name: 'Archery Range', hp: 1200, size: 4, cost: { wood: 175 },
    buildTime: 28, minAge: 1, provides: ['archer'], footprint: 2.8,
  },
  tower: {
    name: 'Watch Tower', hp: 1020, size: 2, cost: { wood: 50, gold: 100 },
    buildTime: 22, minAge: 1, provides: [], footprint: 1.4,
    dmg: 16, range: 13, attackCooldown: 1.0, ranged: true,
  },
};

export const COMBAT = {
  projectileSpeed: 38,
  corpseFade: 2.4,
};
