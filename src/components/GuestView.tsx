import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { Room, RoomStatus } from '../types';
import { motion } from 'motion/react';
import { LogIn, LogOut, CheckCircle2, AlertCircle, Loader2, Clock, ArrowLeft } from 'lucide-react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function GuestView({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
      if (docSnap.exists()) {
        setRoom(docSnap.data() as Room);
        setError(null);
      } else {
        setError('ไม่พบข้อมูลห้องพักนี้');
      }
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `rooms/${roomId}`);
    });

    return () => unsub();
  }, [roomId]);

  const handleAction = async (newStatus: RoomStatus) => {
    if (!room) return;
    setProcessing(true);
    try {
      const roomRef = doc(db, 'rooms', roomId);
      const updateData: any = {
        status: newStatus,
        updatedAt: serverTimestamp(),
      };

      if (newStatus === 'occupied') {
        updateData.lastGuestName = guestName || 'ไม่ระบุชื่อ';
      }

      if (newStatus === 'dirty') {
        updateData.alertsActive = true;
      }

      await updateDoc(roomRef, updateData);

      // Log the activity
      await addDoc(collection(db, 'logs'), {
        roomId,
        type: newStatus === 'occupied' ? 'check-in' : 'check-out',
        guestName: newStatus === 'occupied' ? (guestName || 'ไม่ระบุชื่อ') : room.lastGuestName,
        timestamp: serverTimestamp()
      });

      setGuestName('');
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการดำเนินการ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setProcessing(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts || !ts.toDate) return '';
    return format(ts.toDate(), 'HH:mm', { locale: th });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-600" size={48} />
        <p className="mt-4 text-slate-500 font-bold tracking-tight">กำลังโหลดข้อมูลห้องพัก...</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="text-rose-500" size={64} />
        <h2 className="mt-4 text-3xl font-black text-slate-900 tracking-tighter">{error || 'เกิดข้อผิดพลาด'}</h2>
        <p className="mt-2 text-slate-500 font-bold">กรุณาสแกน QR Code ใหม่อีกครั้ง</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <button 
        onClick={() => window.location.href = window.location.origin}
        className="mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-indigo-600 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Dashboard
      </button>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="overflow-hidden rounded-[3rem] bg-white shadow-2xl shadow-indigo-100/50 border border-slate-100"
      >
        <div className={cn(
          "h-48 p-10 text-white flex flex-col justify-end gap-2",
          room.status === 'available' ? "bg-emerald-600 shadow-inner" : 
          room.status === 'occupied' ? "bg-rose-600 shadow-inner" : "bg-amber-500 shadow-inner"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80">Guest Portal</span>
            <div className="rounded-lg bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
              {room.status === 'available' ? 'Vacant' : 
               room.status === 'occupied' ? 'Occupied' : 'Cleaning'}
            </div>
          </div>
          <h1 className="text-5xl font-black tracking-tighter">{room.name}</h1>
        </div>

        <div className="p-10 space-y-8">
          {room.status === 'available' && (
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Guest Name / ID</label>
                <input 
                  type="text" 
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Enter your name..."
                  className="w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-6 py-5 text-lg font-bold outline-none transition-all focus:border-indigo-600 focus:bg-white shadow-inner"
                />
              </div>
              <button
                onClick={() => handleAction('occupied')}
                disabled={processing}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-indigo-600 py-6 text-xl font-black text-white shadow-xl shadow-indigo-200 transition-all active:scale-[0.98] hover:bg-indigo-700 disabled:opacity-70"
              >
                {processing ? <Loader2 className="animate-spin" size={28} /> : <LogIn size={28} />}
                Confirm Check-In
              </button>
              <div className="flex justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <CheckCircle2 size={12} className="text-emerald-500" />
                <span>Sanitized & Ready for arrival</span>
              </div>
            </div>
          )}

          {room.status === 'occupied' && (
            <div className="space-y-8 text-center">
              <div className="py-4">
                <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-rose-50 text-rose-600 shadow-inner">
                  <User size={48} className="text-rose-600" />
                </div>
                <h3 className="text-2xl font-black text-slate-900">Welcome, {room.lastGuestName}</h3>
                <div className="mt-2 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <Clock size={12} />
                  <span>Checked-in at {formatTime(room.updatedAt)}</span>
                </div>
                <p className="mt-4 text-slate-500 font-bold">We hope you're enjoying your stay</p>
              </div>
              <button
                onClick={() => handleAction('dirty')}
                disabled={processing}
                className="flex w-full items-center justify-center gap-3 rounded-2xl bg-slate-900 py-6 text-xl font-black text-white shadow-xl shadow-slate-200 transition-all active:scale-[0.98] hover:bg-slate-800 disabled:opacity-70"
              >
                {processing ? <Loader2 className="animate-spin" size={28} /> : <LogOut size={28} />}
                Check-Out Now
              </button>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                By checking out, you notify Housekeeping <br/> that the room is ready for cleaning.
              </p>
            </div>
          )}

          {room.status === 'dirty' && (
            <div className="space-y-8 text-center py-6">
              <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-[2.5rem] bg-amber-50 text-amber-600 shadow-inner">
                <Loader2 className="animate-spin" size={48} />
              </div>
              <h3 className="text-2xl font-black text-slate-900">Cleaning in Progress</h3>
              <p className="text-slate-500 font-bold px-4">Our team is currently preparing this room for the next guest.</p>
              <div className="pt-4">
                <button 
                  onClick={() => window.location.reload()}
                  className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] underline underline-offset-8"
                >
                  Refresh Status
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function User({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={2} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
