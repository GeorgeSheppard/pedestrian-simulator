import type { Vec2 } from './network';
import type { Polyline } from './path';

export type VehicleKind = 'cab' | 'car' | 'van';

export interface Vehicle {
  /** Which slot this is; each slot keeps its kind and look, and is reused as vehicles come and go. */
  slot: number;
  kind: VehicleKind;
  /** Bumper to bumper, in metres. */
  length: number;
  active: boolean;
  /** Distance of the vehicle's middle along the road, in metres. */
  s: number;
  /** Metres per second. */
  speed: number;
  /** The speed this driver likes to go at. */
  cruise: number;
  /** Seconds spent waiting at a crossing so far. */
  waited: number;
  position: Vec2;
  heading: number;
}

/** What vehicles need to give way to this step. */
export interface Hazards {
  /** How far along the road each person standing or walking in the lane is. */
  inLane: number[];
  /** For each crossing, whether someone is on it. */
  onCrossing: boolean[];
  /** For each crossing, whether someone is waiting at the kerb to step onto it. */
  atKerb: boolean[];
}

export interface TrafficOptions {
  /** The lane, in the direction of travel. */
  lane: Polyline;
  /** The kind of vehicle in each slot; this many vehicles at most are on the road at once. */
  slots: VehicleKind[];
  /** How far along the lane each zebra crossing is, in metres. */
  crossings: number[];
  random?: () => number;
}

export const LENGTHS: Record<VehicleKind, number> = { cab: 4.6, car: 4.3, van: 5.2 };

/** Comfortable acceleration and braking, and the hardest a driver will brake, in m/s². */
const ACCELERATION = 2;
const BRAKING = 3.5;
const HARDEST_BRAKING = 7;
/** The gap drivers leave to whatever they're stopping behind, in metres. */
const STOPPING_GAP = 2;
/** How far before a crossing's middle drivers stop: half the stripes, then the zigzag zone. */
const STOP_LINE = 3.5;
/** How far past the stop line, in metres, a vehicle has to be to carry on regardless. */
const COMMITTED = 1;
/** Below this speed, in m/s, a vehicle is creeping up to a stop rather than driving on. */
const CREEPING = 3;
/** Seconds a driver waits at a crossing before only waiting for people already on it. */
export const PATIENCE = 6;
/** How far ahead drivers look for people in the road, in metres. */
const LOOKAHEAD = 30;
/** Seconds between vehicles turning up, at most and at least, at the usual level of traffic. */
const ARRIVALS: [number, number] = [3, 9];
/** The usual number of vehicles allowed on the road at once. */
const USUAL_CAPACITY = 6;
/** The room a new vehicle needs at the start of the road, in metres. */
const ENTRY_ROOM = 12;
/** How far along the road has to be clear of people for a new vehicle to drive in, in metres. */
export const ENTRY_CLEAR = 22;

/**
 * Vehicles driving one way along a single lane, by a few rules:
 *
 * - They turn up at the start of the road every few seconds, when there's room, and leave at the
 *   far end.
 * - Each drives at its own cruising speed, slowing to keep a gap behind the vehicle in front.
 * - They stop for anyone on or about to step onto a zebra crossing, unless they're already too
 *   close to stop comfortably, and for anyone in the road ahead.
 * - After waiting a while at a crossing, a driver only waits for the people already on it, and
 *   edges across once they're clear; people at the kerb let them go.
 */
export class Traffic {
  readonly vehicles: Vehicle[];
  private readonly options: TrafficOptions;
  private readonly random: () => number;
  private untilArrival = 0;
  /** Whether a vehicle is waiting to drive in at the start of the road. */
  queued = false;
  /**
   * How many vehicles may be on the road at once, up to the number of slots. Busier roads also get
   * vehicles turning up more often; with none, no more turn up.
   */
  capacity: number;

  constructor(options: TrafficOptions) {
    this.options = options;
    this.random = options.random ?? Math.random;
    this.capacity = Math.min(USUAL_CAPACITY, options.slots.length);
    this.vehicles = options.slots.map((kind, slot) => ({
      slot,
      kind,
      length: LENGTHS[kind],
      active: false,
      s: 0,
      speed: 0,
      cruise: 0,
      waited: 0,
      position: [0, 0],
      heading: 0,
    }));
  }

  /** Fills the road straight away, with vehicles spread along it. */
  populate(count: number) {
    const { length } = this.options.lane;
    const spacing = length / (count + 1);
    for (let i = 0; i < count; i++) {
      const vehicle = this.vehicles.find((v) => !v.active);
      if (!vehicle) break;
      this.start(vehicle, spacing * (i + 1) + (this.random() - 0.5) * spacing * 0.4);
    }
  }

  /** Moves the traffic on by `dt` seconds. */
  update(dt: number, hazards: Hazards) {
    const { lane } = this.options;
    this.untilArrival -= dt;
    this.queued = false;
    if (this.untilArrival <= 0) {
      const active = this.vehicles.filter((v) => v.active).length;
      const free = active < this.capacity ? this.vehicles.filter((v) => !v.active) : [];
      const roomy = this.vehicles.every((v) => !v.active || v.s - v.length / 2 > ENTRY_ROOM);
      // Nor drive in on top of someone crossing near the start of the road: wait, and try again
      // each step, until they're clear.
      const crossing = hazards.inLane.some((s) => s < ENTRY_CLEAR);
      if (free.length > 0 && roomy && crossing) {
        this.queued = true;
      } else {
        const usual = Math.min(USUAL_CAPACITY, this.vehicles.length);
        const busyness = Math.max(this.capacity, 1) / usual;
        this.untilArrival = (ARRIVALS[0] + this.random() * (ARRIVALS[1] - ARRIVALS[0])) / busyness;
        if (free.length > 0 && roomy) this.start(free[Math.floor(this.random() * free.length)]!, 0);
      }
    }

    // Front to back, so each driver reacts to where the one ahead has got to.
    const ordered = this.vehicles.filter((v) => v.active).sort((a, b) => b.s - a.s);
    ordered.forEach((vehicle, i) => {
      const stop = this.stoppingPoint(vehicle, ordered[i - 1], hazards);
      const gap = stop - vehicle.s;
      const canStopFrom = Math.sqrt(2 * BRAKING * Math.max(0, gap));
      // Never further in one step than the room left, so vehicles stop at the line, not past it.
      const target = Math.min(vehicle.cruise, canStopFrom, Math.max(0, gap) / dt);
      vehicle.speed =
        target < vehicle.speed
          ? Math.max(target, vehicle.speed - HARDEST_BRAKING * dt)
          : Math.min(target, vehicle.speed + ACCELERATION * dt);
      vehicle.s += vehicle.speed * dt;
      // Count up while stopped at a crossing, and once out of patience, until past it.
      if (!this.atCrossing(vehicle)) vehicle.waited = 0;
      else if (vehicle.speed < 0.3 || vehicle.waited >= PATIENCE) vehicle.waited += dt;
      if (vehicle.s - vehicle.length / 2 > lane.length) {
        vehicle.active = false;
        return;
      }
      const { position, heading } = lane.at(vehicle.s);
      vehicle.position = position;
      vehicle.heading = heading;
    });
  }

  /** The furthest point this vehicle's middle can go before it must have stopped. */
  private stoppingPoint(vehicle: Vehicle, ahead: Vehicle | undefined, hazards: Hazards): number {
    const front = vehicle.s + vehicle.length / 2;
    let stop = Infinity;
    if (ahead) stop = ahead.s - ahead.length / 2 - STOPPING_GAP - vehicle.length / 2;
    for (const s of hazards.inLane) {
      if (s > front - 0.5 && s < front + LOOKAHEAD) {
        stop = Math.min(stop, s - STOPPING_GAP - vehicle.length / 2);
      }
    }
    this.options.crossings.forEach((crossing, i) => {
      const patient = vehicle.waited < PATIENCE;
      if (!hazards.onCrossing[i] && !(patient && hazards.atKerb[i])) return;
      const line = crossing - STOP_LINE - vehicle.length / 2;
      const gap = line - vehicle.s;
      // Already over the line, or going too fast to stop before it without slamming on the
      // brakes: carry on through. (Creeping up to the line doesn't count, however small the gap.)
      const tooClose =
        vehicle.speed > CREEPING &&
        (vehicle.speed * vehicle.speed) / (2 * Math.max(gap, 0.01)) > BRAKING * 1.6;
      if (gap < -COMMITTED || tooClose) return;
      stop = Math.min(stop, line);
    });
    return stop;
  }

  /** Whether this vehicle is near enough the line of a crossing to be waiting at it. */
  private atCrossing(vehicle: Vehicle): boolean {
    return this.options.crossings.some((crossing) => {
      const line = crossing - STOP_LINE - vehicle.length / 2;
      return vehicle.s > line - STOPPING_GAP - 1 && vehicle.s < line + COMMITTED + 4;
    });
  }

  /** Whether a vehicle is about to drive over or is on the given crossing, after waiting. */
  pullingAway(crossing: number): boolean {
    const s = this.options.crossings[crossing];
    if (s === undefined) return false;
    return this.vehicles.some(
      (v) =>
        v.active &&
        v.waited >= PATIENCE &&
        v.s + v.length / 2 > s - STOP_LINE - STOPPING_GAP - 1 &&
        v.s - v.length / 2 < s + STOP_LINE
    );
  }

  private start(vehicle: Vehicle, s: number) {
    vehicle.active = true;
    vehicle.s = s;
    vehicle.cruise = 6.5 + this.random() * 2.5;
    vehicle.waited = 0;
    vehicle.speed = vehicle.cruise;
    const { position, heading } = this.options.lane.at(s);
    vehicle.position = position;
    vehicle.heading = heading;
  }
}
