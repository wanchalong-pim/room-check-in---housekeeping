export type RoomStatus = 'available' | 'occupied' | 'dirty';

export interface Room {
  id: string;
  name: string;
  status: RoomStatus;
  lastGuestName?: string;
  updatedAt: any; // Firestore Timestamp
  alertsActive?: boolean;
}

export interface ActivityLog {
  roomId: string;
  type: 'check-in' | 'check-out' | 'cleaned';
  guestName?: string;
  timestamp: any; // Firestore Timestamp
}
