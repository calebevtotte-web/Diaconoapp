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
  unavailableDates?: string[]; // Array of 'YYYY-MM-DD'
  addedAt: number;
}

export interface ScaleSwap {
  fromId: string;
  toId: string;
  at: number;
}

export type ServiceType = 'morning' | 'evening' | 'special' | 'rehearsal';

export interface Scale {
  id: string;
  event: string;
  date: string; // YYYY-MM-DD
  members: string[]; // Member IDs
  serviceType?: ServiceType;
  swaps: ScaleSwap[];
  createdAt: number;
  updatedAt?: number;
}

export const SERVICE_LABELS: Record<ServiceType, string> = {
  morning: 'Culto da Manhã',
  evening: 'Culto da Noite',
  special: 'Evento Especial',
  rehearsal: 'Ensaio/Treinamento'
};

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
