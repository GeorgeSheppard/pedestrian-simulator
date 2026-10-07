import { distance, type Vec2, type WalkNetwork } from './network';

export type Goal = 'leave' | 'station' | 'shop';

export interface Pedestrian {
  id: number;
  position: Vec2;
  /** Direction faced, in radians: 0 faces +x, π/2 faces +z. */
  heading: number;
  /** Walking speed, in metres per second. */
  speed: number;
  /** How far to the right of the path's centre line this person walks, in metres. */
  offset: number;
  route: Vec2[];
  /** Index of the waypoint in `route` being walked towards. */
  next: number;
  goal: Goal;
  /** Seconds left inside a shop; they fade out as they go in, and back in as they come out. */
  indoors: number;
  /** Whether they're standing at the kerb, waiting to cross. */
  waiting: boolean;
  /** 0 when absent, 1 when fully there; people fade in and out at the ends of their walks. */
  presence: number;
  leaving: boolean;
  /** Walk-cycle phase, in radians. */
  stride: number;
  /** Stable per-person random number in [0, 1), for picking looks. */
  seed: number;
  /** Who they're walking with, if they're one of a group and not the one leading it. */
  leader: Pedestrian | null;
  /** Where they walk relative to their leader: metres ahead, and metres to the right. */
  formation: Vec2;
}

export interface CrowdOptions {
  network: WalkNetwork;
  /** Nodes on the edge of the area, where people walk in and out of view. */
  entrances: readonly number[];
  /** Nodes inside the tube station, past the ticket gates, where people heading in go. */
  station: readonly number[];
  /** Nodes past the gates where people off a train come from; the same as `station` if not set. */
  stationExits?: readonly number[];
  /** Nodes just inside shop doors, where people go in to shop. */
  shops: readonly number[];
  /** How many people to keep in the scene, to begin with; see `Crowd.population`. */
  population: number;
  /**
   * Whether someone may take a step from one point to the next, such as off the kerb into the
   * road. If not, they wait where they are.
   */
  mayStep?: (from: Vec2, to: Vec2) => boolean;
  /** Whether a point is in the road, so companions only go into it when their leader does. */
  inRoad?: (point: Vec2) => boolean;
  random?: () => number;
}

const ARRIVAL_RADIUS = 0.6;
const PERSONAL_SPACE = 0.75;
const FADE_SECONDS = 0.6;
const MAX_LANE_OFFSET = 1;
/** How long people spend inside a shop, at least and at most. */
const SHOPPING_SECONDS: [number, number] = [10, 40];
/** Roughly how long a person spends in the scene, which sets how often new people turn up. */
const AVERAGE_VISIT_SECONDS = 45;
const TRAIN_INTERVAL_SECONDS: [number, number] = [40, 80];
const TRAIN_PASSENGERS: [number, number] = [8, 18];
const TRAIN_UNLOADING_SECONDS = 10;

/**
 * Walking paces, in metres per second, and how common each is: tourists stroll, most people walk,
 * and some are in a hurry. People heading for or off a train are more often hurrying.
 */
const PACES = {
  stroll: [0.75, 1.1],
  walk: [1.1, 1.45],
  hurry: [1.5, 1.95],
} satisfies Record<string, [number, number]>;
/** Groups amble together at a stroll. */
const GROUP_PACE: [number, number] = [0.85, 1.2];
/** How often people turn up in a group, rather than alone, and how big groups are. */
const GROUP_CHANCE = 0.35;
const TRAIN_GROUP_CHANCE = 0.15;
const GROUP_SIZES = [2, 2, 2, 3, 3, 4];
/** Where companions walk relative to the one leading: ahead, and to the right, in metres. */
const FORMATIONS: Vec2[] = [
  [0, 0.8],
  [0, -0.8],
  [-0.9, 0.35],
];
/** How much faster than their leader companions can walk to catch up. */
const CATCH_UP = 1.5;
/** How quickly extra people drift away when the crowd is made smaller, as a share per second. */
const THIN_OUT = 0.08;

/**
 * People walking around the network by a few simple rules:
 *
 * - They turn up at the edges of the area, or come up through the station's gates when a train
 *   arrives.
 * - Some come alone, at their own pace, from a stroll to a hurry; some come in groups of two to
 *   four, who keep together, side by side, at a stroll.
 * - Each picks somewhere to go: off the other side of the area, into the station, or to a shop.
 * - They take the shortest route, keeping to their own lane, and step around anyone too close.
 * - They wait at the kerb when stepping into the road isn't safe.
 * - At a shop they go in for a while, then come back out and head off somewhere else.
 */
export class Crowd {
  readonly pedestrians: Pedestrian[] = [];
  private readonly options: CrowdOptions;
  private readonly random: () => number;
  private nextId = 0;
  private spawnBudget = 0;
  private untilTrain: number;
  private trainPassengers = 0;
  private trainBudget = 0;
  private thinBudget = 0;
  /** How many people to keep in the scene; change it and the crowd grows or thins out to match. */
  population: number;

  constructor(options: CrowdOptions) {
    this.options = options;
    this.random = options.random ?? Math.random;
    this.population = options.population;
    this.untilTrain = this.between(...TRAIN_INTERVAL_SECONDS) / 2;
  }

  /** Fills the scene straight away, with people part-way along their walks. */
  populate() {
    let attempts = 0;
    while (this.pedestrians.length < this.population && attempts++ < 1000) {
      const person = this.arrive(
        this.pick(this.options.entrances),
        this.pickGoal('leave'),
        GROUP_CHANCE
      );
      if (!person) continue;
      // Skip ahead a random distance along the route.
      person.next = 1 + Math.floor(this.random() * (person.route.length - 1));
      const from = person.route[person.next - 1]!;
      const to = person.route[person.next]!;
      const t = this.random();
      person.position = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
      person.position = add(person.position, this.laneShift(person, person.next));
      person.heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
      person.presence = 1;
      for (const companion of this.companionsOf(person)) {
        companion.position = this.formationPoint(companion, person);
        companion.heading = person.heading;
        companion.presence = 1;
      }
    }
  }

  /** Moves the crowd on by `dt` seconds. */
  update(dt: number) {
    this.spawnNewArrivals(dt);
    this.thinOut(dt);
    for (const person of this.pedestrians) this.step(person, dt);
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const person = this.pedestrians[i]!;
      if (person.leaving && person.presence <= 0) this.pedestrians.splice(i, 1);
    }
  }

  private spawnNewArrivals(dt: number) {
    const { entrances } = this.options;
    const { population } = this;
    const station = this.options.stationExits ?? this.options.station;

    this.spawnBudget += (dt * population) / AVERAGE_VISIT_SECONDS;
    while (this.spawnBudget >= 1) {
      this.spawnBudget -= 1;
      if (this.pedestrians.length < population) {
        this.arrive(this.pick(entrances), this.pickGoal('leave'), GROUP_CHANCE);
      }
    }

    if (station.length === 0) return;
    this.untilTrain -= dt;
    if (this.untilTrain <= 0) {
      this.untilTrain = this.between(...TRAIN_INTERVAL_SECONDS);
      this.trainPassengers += Math.round(this.between(...TRAIN_PASSENGERS));
    }
    if (this.trainPassengers > 0) {
      this.trainBudget += (dt * TRAIN_PASSENGERS[1]) / TRAIN_UNLOADING_SECONDS;
      while (this.trainBudget >= 1 && this.trainPassengers > 0) {
        this.trainBudget -= 1;
        this.trainPassengers--;
        this.arrive(this.pick(station), this.pickGoal('station'), TRAIN_GROUP_CHANCE, true);
      }
    } else {
      this.trainBudget = 0;
    }
  }

  /**
   * Someone turning up at `from`, perhaps with companions, all heading for `goal`. Returns whoever
   * leads, or null if there's nowhere for them to go.
   */
  private arrive(from: number, goal: Goal, groupChance: number, offTrain = false) {
    const size = this.random() < groupChance ? this.pick(GROUP_SIZES) : 1;
    const hurrying = offTrain || goal === 'station' ? 0.45 : 0.2;
    const roll = this.random();
    const pace =
      size > 1
        ? GROUP_PACE
        : roll < hurrying
          ? PACES.hurry
          : roll < hurrying + 0.3
            ? PACES.stroll
            : PACES.walk;
    const leader = this.spawn(from, goal, this.between(...pace));
    if (!leader) return null;
    for (let i = 1; i < size; i++) {
      const companion = this.newPerson(leader.position, leader.speed);
      companion.leader = leader;
      companion.formation = FORMATIONS[i - 1]!;
      companion.route = leader.route;
      companion.goal = leader.goal;
      companion.heading = leader.heading;
      this.pedestrians.push(companion);
    }
    return leader;
  }

  private newPerson(position: Vec2, speed: number): Pedestrian {
    return {
      id: this.nextId++,
      position: [...position],
      heading: 0,
      speed,
      offset: this.between(-MAX_LANE_OFFSET, MAX_LANE_OFFSET),
      route: [],
      next: 1,
      goal: 'leave',
      indoors: 0,
      waiting: false,
      presence: 0,
      leaving: false,
      stride: this.random() * Math.PI * 2,
      seed: this.random(),
      leader: null,
      formation: [0, 0],
    };
  }

  private spawn(from: number, goal: Goal, speed: number): Pedestrian | null {
    const person = this.newPerson(this.options.network.nodes[from]!, speed);
    if (!this.plan(person, from, goal)) return null;
    person.position = add(person.position, this.laneShift(person, 1));
    const first = person.route[1]!;
    person.heading = Math.atan2(first[1] - person.position[1], first[0] - person.position[0]);
    this.pedestrians.push(person);
    return person;
  }

  /** Picks a destination for the given goal and routes there. Returns false if none is reachable. */
  private plan(person: Pedestrian, from: number, goal: Goal): boolean {
    const { network, entrances, station, shops } = this.options;
    const candidates = goal === 'station' ? station : goal === 'shop' ? shops : entrances;
    for (let attempt = 0; attempt < 8; attempt++) {
      const to = this.pick(candidates);
      if (to === from || to === undefined) continue;
      const route = network.route(from, to);
      if (!route || route.length < 2) continue;
      person.route = route.map((node) => network.nodes[node]!);
      person.next = 1;
      person.goal = goal;
      return true;
    }
    return false;
  }

  /** Where someone who has just appeared, or finished at a shop, decides to go next. */
  private pickGoal(cameFrom: Goal): Goal {
    const roll = this.random();
    if (cameFrom === 'station') return roll < 0.7 ? 'leave' : 'shop';
    if (cameFrom === 'shop') return roll < 0.75 ? 'leave' : 'station';
    return roll < 0.5 ? 'leave' : roll < 0.75 ? 'station' : 'shop';
  }

  private step(person: Pedestrian, dt: number) {
    if (person.leader) {
      this.follow(person, person.leader, dt);
      return;
    }
    if (person.leaving) {
      person.presence = Math.max(0, person.presence - dt / FADE_SECONDS);
      return;
    }
    person.presence = Math.min(1, person.presence + dt / FADE_SECONDS);

    if (person.indoors > 0) {
      person.indoors -= dt;
      if (person.indoors > 0) {
        person.presence = Math.max(0, person.presence - (2 * dt) / FADE_SECONDS);
        return;
      }
      // Done shopping: back out of the door and off somewhere else.
      const here = this.nearestNode(person.route.at(-1)!);
      if (!this.plan(person, here, this.pickGoal('shop'))) person.leaving = true;
      return;
    }

    const target = add(person.route[person.next]!, this.laneShift(person, person.next));
    const toTarget: Vec2 = [target[0] - person.position[0], target[1] - person.position[1]];
    const remaining = Math.hypot(...toTarget);

    if (remaining < ARRIVAL_RADIUS) {
      person.next++;
      if (person.next >= person.route.length) this.reachEnd(person);
      return;
    }

    const velocity: Vec2 = [
      (toTarget[0] / remaining) * person.speed,
      (toTarget[1] / remaining) * person.speed,
    ];
    const push = this.separation(person);
    velocity[0] += push[0];
    velocity[1] += push[1];

    const next: Vec2 = [
      person.position[0] + velocity[0] * dt,
      person.position[1] + velocity[1] * dt,
    ];
    person.waiting = !!this.options.mayStep && !this.options.mayStep(person.position, next);
    if (person.waiting) return;
    person.position = next;
    person.heading = turnTowards(
      person.heading,
      Math.atan2(velocity[1], velocity[0]),
      Math.min(1, dt * 8)
    );
    person.stride += dt * person.speed * 7;
  }

  /** At the end of their route: into the shop, or out of the scene. */
  private reachEnd(person: Pedestrian) {
    if (person.goal === 'shop') {
      person.indoors = this.between(...SHOPPING_SECONDS);
      person.next = person.route.length - 1;
    } else {
      person.leaving = true;
    }
  }

  /** A companion keeping their place beside or behind the one leading their group. */
  private follow(person: Pedestrian, leader: Pedestrian, dt: number) {
    // They go where their leader goes: in and out of shops, and off.
    person.leaving = leader.leaving;
    person.indoors = leader.indoors;
    person.goal = leader.goal;
    person.route = leader.route;
    person.next = leader.next;
    if (person.leaving || person.indoors > 0) {
      person.presence = Math.min(person.presence, leader.presence);
    } else {
      person.presence = Math.min(1, person.presence + dt / FADE_SECONDS);
    }
    // Walking into a shop or out of the scene, they follow straight on. Their place in the
    // formation can fall in the road while their leader waits at the kerb, so then they stay
    // with their leader instead.
    const inRoad = this.options.inRoad ?? (() => false);
    const place = this.formationPoint(person, leader);
    const offRoad = !inRoad(leader.position) && (inRoad(place) || inRoad(person.position));
    const target = person.indoors > 0 || person.leaving || offRoad ? leader.position : place;
    const toTarget: Vec2 = [target[0] - person.position[0], target[1] - person.position[1]];
    const remaining = Math.hypot(...toTarget);
    if (remaining < 0.05) {
      person.heading = turnTowards(person.heading, leader.heading, Math.min(1, dt * 4));
      return;
    }
    const speed = Math.min(remaining * 3, leader.speed * CATCH_UP);
    const velocity: Vec2 = [(toTarget[0] / remaining) * speed, (toTarget[1] / remaining) * speed];
    const push = this.separation(person);
    velocity[0] += push[0];
    velocity[1] += push[1];
    const next: Vec2 = [
      person.position[0] + velocity[0] * dt,
      person.position[1] + velocity[1] * dt,
    ];
    person.waiting = !!this.options.mayStep && !this.options.mayStep(person.position, next);
    if (person.waiting) return;
    const moved = Math.hypot(next[0] - person.position[0], next[1] - person.position[1]);
    person.position = next;
    if (moved > dt * 0.2) {
      person.heading = turnTowards(
        person.heading,
        Math.atan2(velocity[1], velocity[0]),
        Math.min(1, dt * 8)
      );
    }
    person.stride += moved * 7;
  }

  /** Where a companion should be, relative to where their leader is and which way they face. */
  private formationPoint(person: Pedestrian, leader: Pedestrian): Vec2 {
    const [ahead, right] = person.formation;
    const forward: Vec2 = [Math.cos(leader.heading), Math.sin(leader.heading)];
    // Right of facing, as for lanes: (-z, x) of the way they face.
    return [
      leader.position[0] + forward[0] * ahead - forward[1] * right,
      leader.position[1] + forward[1] * ahead + forward[0] * right,
    ];
  }

  private companionsOf(leader: Pedestrian): Pedestrian[] {
    return this.pedestrians.filter((p) => p.leader === leader);
  }

  /** When the crowd's been made smaller, sends extra people on their way out, a few at a time. */
  private thinOut(dt: number) {
    const excess = this.pedestrians.length - this.population;
    if (excess <= 0) {
      this.thinBudget = 0;
      return;
    }
    this.thinBudget += Math.max(1, excess * THIN_OUT) * dt;
    while (this.thinBudget >= 1) {
      this.thinBudget -= 1;
      // Whoever's leading a group, or alone, and out on the pavement rather than in the road.
      const candidates = this.pedestrians.filter(
        (p) => !p.leader && !p.leaving && p.indoors <= 0 && !p.waiting
      );
      const person = candidates[Math.floor(this.random() * candidates.length)];
      if (!person) return;
      person.leaving = true;
    }
  }

  /**
   * A push away from anyone inside this person's personal space. People waiting at the kerb make
   * way, so anyone stepping up out of the road can always get past them.
   */
  private separation(person: Pedestrian): Vec2 {
    const push: Vec2 = [0, 0];
    for (const other of this.pedestrians) {
      if (other === person || other.leaving || other.waiting || other.indoors > 0) continue;
      // Companions walk close together; they keep their spacing by their formation instead.
      if (other.leader === person || person.leader === other) continue;
      if (person.leader && person.leader === other.leader) continue;
      const dx = person.position[0] - other.position[0];
      const dz = person.position[1] - other.position[1];
      const d = Math.hypot(dx, dz);
      if (d >= PERSONAL_SPACE || d === 0) continue;
      const strength = ((PERSONAL_SPACE - d) / PERSONAL_SPACE) * 1.5;
      push[0] += (dx / d) * strength;
      push[1] += (dz / d) * strength;
    }
    return push;
  }

  /** The sideways shift that keeps this person in their lane on the way to waypoint `index`. */
  private laneShift(person: Pedestrian, index: number): Vec2 {
    const to = person.route[index]!;
    const from = person.route[Math.max(0, index - 1)]!;
    const length = distance(from, to);
    if (length === 0) return [0, 0];
    // Right of the direction of travel, so people heading opposite ways pass each other.
    return [
      (-(to[1] - from[1]) / length) * person.offset,
      ((to[0] - from[0]) / length) * person.offset,
    ];
  }

  private nearestNode(point: Vec2): number {
    let best = 0;
    this.options.network.nodes.forEach((node, i) => {
      if (distance(node, point) < distance(this.options.network.nodes[best]!, point)) best = i;
    });
    return best;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.random() * items.length)]!;
  }

  private between(min: number, max: number): number {
    return min + this.random() * (max - min);
  }
}

function add(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

function turnTowards(from: number, to: number, amount: number): number {
  const difference = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + difference * amount;
}
