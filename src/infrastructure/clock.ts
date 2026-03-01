/**
 * Clock abstraction for testable time.
 */

import type { ISOTimestamp } from '../types/common.js';

export interface Clock {
  now(): ISOTimestamp;
}

export class SystemClock implements Clock {
  now(): ISOTimestamp {
    return new Date().toISOString();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly fixedTime: ISOTimestamp) {}

  now(): ISOTimestamp {
    return this.fixedTime;
  }
}

export const systemClock = new SystemClock();
