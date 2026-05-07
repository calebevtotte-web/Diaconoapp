/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Member {
  id: string;
  name: string;
  phone?: string;
  flagged: boolean; // Priority flag
  availableDays: number[]; // 0-6 (Sunday to Saturday)
  addedAt: number;
}

export interface ScaleSwap {
  fromId: string;
  toId: string;
  at: number;
}

export interface Scale {
  id: string;
  event: string;
  date: string; // YYYY-MM-DD
  members: string[]; // Member IDs
  swaps: ScaleSwap[];
  createdAt: number;
  updatedAt?: number;
}

export interface Settings {
  church: string;
  ministry: string;
  leader: string;
}

export interface AppDB {
  members: Member[];
  scales: Scale[];
  settings: Settings;
}
