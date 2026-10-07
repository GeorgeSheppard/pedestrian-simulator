import { Crowd, type CrowdOptions } from './crowd';
import type { Vec2 } from './network';
import { Polyline } from './path';
import { Traffic, type VehicleKind } from './traffic';

export interface SimulationOptions {
  crowd: Omit<CrowdOptions, 'mayStep' | 'random'>;
  road: {
    /** The middle of the single lane, in the direction traffic drives. */
    lane: Vec2[];
    /** Half the carriageway's width, kerb to kerb, in metres. */
    halfWidth: number;
    /** Where the zebra crossings are. */
    crossings: Vec2[];
  };
  vehicles: VehicleKind[];
  random?: () => number;
}

/** How far ahead of a vehicle the road has to be clear when the scene fills, in metres. */
const CLEARANCE = 20;
/** How far off the kerb someone in the carriageway has to be for drivers to stop, in metres. */
const OFF_KERB = 0.3;
/** How far along the road from a crossing's middle counts as being on it, in metres. */
const CROSSING_HALF_LENGTH = 2.2;
/** How far beyond the kerb someone waiting to cross is noticed, in metres. */
const KERB_REACH = 1.4;
/**
 * Seconds of warning someone wants before stepping out in front of a moving vehicle: a little at a
 * zebra crossing, where drivers stop, more where there's no crossing.
 */
const LOOK_SECONDS = { zebra: 1.6, road: 3 };

/**
 * The street: the crowd and the traffic on Long Acre, taking turns. Drivers give way to anyone on
 * or waiting at a zebra crossing, and to anyone in the carriageway ahead; people wait at the kerb rather
 * than step out right in front of a moving vehicle, and let a driver who's been waiting at the
 * crossing for a while go.
 */
export class Simulation {
  readonly crowd: Crowd;
  readonly traffic: Traffic;
  readonly road: Polyline;
  private readonly halfWidth: number;
  private readonly crossings: number[];

  constructor(options: SimulationOptions) {
    this.road = new Polyline(options.road.lane);
    this.halfWidth = options.road.halfWidth;
    this.crossings = options.road.crossings.map((c) => this.road.project(c).s);
    this.crowd = new Crowd({
      ...options.crowd,
      random: options.random,
      mayStep: (from, to) => this.mayStep(from, to),
    });
    this.traffic = new Traffic({
      lane: this.road,
      slots: options.vehicles,
      crossings: this.crossings,
      random: options.random,
    });
  }

  /** Fills the street straight away. */
  populate() {
    this.crowd.populate();
    this.traffic.populate(Math.ceil(this.traffic.vehicles.length / 2));
    // Clear away any vehicle that's turned up where someone's crossing, or too close behind them
    // to stop.
    for (const vehicle of this.traffic.vehicles) {
      if (!vehicle.active) continue;
      vehicle.active = !this.crowd.pedestrians.some((person) => {
        const { s, lateral } = this.road.project(person.position);
        const ahead = s - vehicle.s;
        return Math.abs(lateral) < this.halfWidth && ahead > -vehicle.length && ahead < CLEARANCE;
      });
    }
  }

  /** Moves everything on by `dt` seconds. */
  update(dt: number) {
    const inLane: number[] = [];
    const onCrossing = this.crossings.map(() => false);
    const atKerb = this.crossings.map(() => false);
    for (const person of this.crowd.pedestrians) {
      if (person.leaving) continue;
      const { s, lateral } = this.road.project(person.position);
      if (Math.abs(lateral) < this.halfWidth - OFF_KERB) inLane.push(s);
      if (Math.abs(lateral) > this.halfWidth + KERB_REACH) continue;
      // At the kerb counts only for someone about to cross, not someone walking past.
      const inRoad = Math.abs(lateral) < this.halfWidth;
      const waypoint = person.route[person.next];
      const aboutToCross =
        waypoint !== undefined && Math.abs(this.road.project(waypoint).lateral) < this.halfWidth;
      if (!inRoad && !aboutToCross) continue;
      this.crossings.forEach((crossing, i) => {
        if (Math.abs(s - crossing) >= CROSSING_HALF_LENGTH) return;
        if (inRoad) onCrossing[i] = true;
        else atKerb[i] = true;
      });
    }
    this.traffic.update(dt, { inLane, onCrossing, atKerb });
    this.crowd.update(dt);
  }

  /** Whether stepping from one point to the next is safe: off the kerb only if no vehicle's close. */
  private mayStep(from: Vec2, to: Vec2): boolean {
    const before = this.road.project(from);
    const after = this.road.project(to);
    const steppingOut =
      Math.abs(before.lateral) >= this.halfWidth && Math.abs(after.lateral) < this.halfWidth;
    if (!steppingOut) return true;
    // Let a driver who's been waiting at a crossing go first.
    const crossing = this.crossings.findIndex((c) => Math.abs(after.s - c) < CROSSING_HALF_LENGTH);
    if (crossing >= 0 && this.traffic.pullingAway(crossing)) return false;
    const look = crossing >= 0 ? LOOK_SECONDS.zebra : LOOK_SECONDS.road;
    return !this.traffic.vehicles.some((vehicle) => {
      if (!vehicle.active) return false;
      const ahead = after.s - vehicle.s;
      const reach = vehicle.length / 2 + 1;
      // Alongside already, or moving and about to be.
      if (Math.abs(ahead) < reach) return true;
      return vehicle.speed > 1.5 && ahead > 0 && ahead < reach + vehicle.speed * look;
    });
  }
}
