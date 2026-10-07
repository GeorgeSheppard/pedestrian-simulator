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
  /** Seconds left looking in a shop window. */
  dwell: number;
  /** Whether they're standing at the kerb, waiting to cross. */
  waiting: boolean;
  /** 0 when absent, 1 when fully there; people fade in and out at the ends of their walks. */
  presence: number;
  leaving: boolean;
  /** Walk-cycle phase, in radians. */
  stride: number;
  /** Stable per-person random number in [0, 1), for picking looks. */
  seed: number;
}

export interface CrowdOptions {
  network: WalkNetwork;
  /** Nodes on the edge of the area, where people walk in and out of view. */
  entrances: readonly number[];
  /** Nodes inside the tube station, past the ticket gates, where people heading in go. */
  station: readonly number[];
  /** Nodes past the gates where people off a train come from; the same as `station` if not set. */
  stationExits?: readonly number[];
  /** Nodes outside shops. */
  shops: readonly number[];
  /** How many people to keep in the scene. */
  population: number;
  /**
   * Whether someone may take a step from one point to the next, such as off the kerb into the
   * road. If not, they wait where they are.
   */
  mayStep?: (from: Vec2, to: Vec2) => boolean;
  random?: () => number;
}

const ARRIVAL_RADIUS = 0.6;
const PERSONAL_SPACE = 0.75;
const FADE_SECONDS = 0.6;
const MAX_LANE_OFFSET = 1;
/** Roughly how long a person spends in the scene, which sets how often new people turn up. */
const AVERAGE_VISIT_SECONDS = 45;
const TRAIN_INTERVAL_SECONDS: [number, number] = [40, 80];
const TRAIN_PASSENGERS: [number, number] = [8, 18];
const TRAIN_UNLOADING_SECONDS = 10;

/**
 * People walking around the network by a few simple rules:
 *
 * - They turn up at the edges of the area, or come up through the station's gates when a train
 *   arrives.
 * - Each picks somewhere to go: off the other side of the area, into the station, or to a shop.
 * - They take the shortest route, keeping to their own lane, and step around anyone too close.
 * - They wait at the kerb when stepping into the road isn't safe.
 * - At a shop they look in the window for a few seconds, then head off somewhere else.
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

  constructor(options: CrowdOptions) {
    this.options = options;
    this.random = options.random ?? Math.random;
    this.untilTrain = this.between(...TRAIN_INTERVAL_SECONDS) / 2;
  }

  /** Fills the scene straight away, with people part-way along their walks. */
  populate() {
    let attempts = 0;
    while (this.pedestrians.length < this.options.population && attempts++ < 1000) {
      const person = this.spawn(this.pick(this.options.entrances), this.pickGoal('leave'));
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
    }
  }

  /** Moves the crowd on by `dt` seconds. */
  update(dt: number) {
    this.spawnNewArrivals(dt);
    for (const person of this.pedestrians) this.step(person, dt);
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const person = this.pedestrians[i]!;
      if (person.leaving && person.presence <= 0) this.pedestrians.splice(i, 1);
    }
  }

  private spawnNewArrivals(dt: number) {
    const { population, entrances } = this.options;
    const station = this.options.stationExits ?? this.options.station;

    this.spawnBudget += (dt * population) / AVERAGE_VISIT_SECONDS;
    while (this.spawnBudget >= 1) {
      this.spawnBudget -= 1;
      if (this.pedestrians.length < population) {
        this.spawn(this.pick(entrances), this.pickGoal('leave'));
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
        this.spawn(this.pick(station), this.pickGoal('station'));
      }
    } else {
      this.trainBudget = 0;
    }
  }

  private spawn(from: number, goal: Goal): Pedestrian | null {
    const person: Pedestrian = {
      id: this.nextId++,
      position: [...this.options.network.nodes[from]!],
      heading: 0,
      speed: this.between(1.05, 1.6),
      offset: this.between(-MAX_LANE_OFFSET, MAX_LANE_OFFSET),
      route: [],
      next: 1,
      goal,
      dwell: 0,
      waiting: false,
      presence: 0,
      leaving: false,
      stride: this.random() * Math.PI * 2,
      seed: this.random(),
    };
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
    if (person.leaving) {
      person.presence = Math.max(0, person.presence - dt / FADE_SECONDS);
      return;
    }
    person.presence = Math.min(1, person.presence + dt / FADE_SECONDS);

    if (person.dwell > 0) {
      person.dwell -= dt;
      if (person.dwell <= 0) {
        const here = this.nearestNode(person.route.at(-1)!);
        if (!this.plan(person, here, this.pickGoal('shop'))) person.leaving = true;
      }
      return;
    }

    const target = add(person.route[person.next]!, this.laneShift(person, person.next));
    const toTarget: Vec2 = [target[0] - person.position[0], target[1] - person.position[1]];
    const remaining = Math.hypot(...toTarget);

    if (remaining < ARRIVAL_RADIUS) {
      person.next++;
      if (person.next >= person.route.length) this.arrive(person);
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

  private arrive(person: Pedestrian) {
    if (person.goal === 'shop') {
      person.dwell = this.between(3, 9);
      person.next = person.route.length - 1;
    } else {
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
      if (other === person || other.leaving || other.waiting) continue;
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
