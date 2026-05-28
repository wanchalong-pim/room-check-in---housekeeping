import React, { useState, useEffect, useRef } from 'react';
import { collection, onSnapshot, updateDoc, doc, query, orderBy, limit, addDoc, serverTimestamp, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { Room, ActivityLog } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Clock, User, Bell, CheckCircle2, History, AlertCircle, X, ExternalLink, Volume2, VolumeX } from 'lucide-react';
import { cn } from '../lib/utils';
import { formatDistanceToNow, format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function HousekeepingView() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [roomLogs, setRoomLogs] = useState<ActivityLog[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      return localStorage.getItem('sound_alert') !== 'false';
    } catch {
      return true;
    }
  });

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const playAlertSound = () => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      const playChimePair = (startTime: number) => {
        // Chime 1 (E5)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(659.25, ctx.currentTime + startTime);
        gain1.gain.setValueAtTime(0, ctx.currentTime + startTime);
        gain1.gain.linearRampToValueAtTime(0.12, ctx.currentTime + startTime + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 0.45);
        
        osc1.start(ctx.currentTime + startTime);
        osc1.stop(ctx.currentTime + startTime + 0.45);

        // Chime 2 (A5)
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880.00, ctx.currentTime + startTime + 0.15);
        gain2.gain.setValueAtTime(0, ctx.currentTime + startTime);
        gain2.gain.setValueAtTime(0, ctx.currentTime + startTime + 0.15);
        gain2.gain.linearRampToValueAtTime(0.12, ctx.currentTime + startTime + 0.17);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 0.65);
        
        osc2.start(ctx.currentTime + startTime + 0.15);
        osc2.stop(ctx.currentTime + startTime + 0.65);
      };

      // Play 5 cycles of the chime pairs to stretch the sound beautifully over ~5 seconds (0s, 1.2s, 2.4s, 3.6s, 4.8s)
      for (let i = 0; i < 5; i++) {
        playChimePair(i * 1.2);
      }
    } catch (err) {
      console.error('Web Audio context not allowed or supported by browser:', err);
    }
  };

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabled(newValue);
    try {
      localStorage.setItem('sound_alert', String(newValue));
    } catch (e) {
      console.error(e);
    }
    if (newValue) {
      // Play brief test sound so browser registers interaction and users verify sound works
      setTimeout(() => {
        playAlertSound();
      }, 50);
    }
  };

  useEffect(() => {
    const roomsUnsub = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const roomData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Room));
      setRooms(roomData.sort((a, b) => {
        const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
        return numA - numB;
      }));
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'rooms'));

    const logsQuery = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
    const logsUnsub = onSnapshot(logsQuery, (snapshot) => {
      const logsData = snapshot.docs.map(doc => doc.data() as ActivityLog);
      setLogs(logsData);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'logs'));

    return () => {
      roomsUnsub();
      logsUnsub();
    };
  }, []);

  const alertingRoomsStr = rooms
    .filter(r => r.status === 'dirty' && r.alertsActive)
    .map(r => r.id)
    .sort()
    .join(',');

  useEffect(() => {
    if (!alertingRoomsStr || !soundEnabled) {
      return;
    }

    // Play immediately when the alerting state begins or shifts to new alerting rooms
    playAlertSound();

    // Loop interval to replay the alarm sound every 6 seconds as long as rooms remain un-acknowledged
    const interval = setInterval(() => {
      playAlertSound();
    }, 6000);

    return () => clearInterval(interval);
  }, [alertingRoomsStr, soundEnabled]);

  useEffect(() => {
    setShowDeleteConfirm(false);
    setDeletePassword('');
    setDeleteError('');
    if (!selectedRoom) return;

    const q = query(
      collection(db, 'logs'), 
      where('roomId', '==', selectedRoom.id),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      setRoomLogs(snapshot.docs.map(doc => doc.data() as ActivityLog));
    });

    return () => unsub();
  }, [selectedRoom]);

  const handleClearRoomHistory = async () => {
    if (deletePassword !== '1234') {
      setDeleteError('รหัสผ่านไม่ถูกต้อง');
      return;
    }
    if (!selectedRoom) return;

    try {
      setDeleteError('');
      const q = query(collection(db, 'logs'), where('roomId', '==', selectedRoom.id));
      const querySnapshot = await getDocs(q);
      
      const batch = writeBatch(db);
      querySnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      setShowDeleteConfirm(false);
      setDeletePassword('');
    } catch (err) {
      console.error(err);
      setDeleteError('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const markCleaned = async (roomId: string) => {
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        status: 'available',
        alertsActive: false,
        updatedAt: serverTimestamp()
      });
      await addDoc(collection(db, 'logs'), {
        roomId,
        type: 'cleaned',
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาด');
    }
  };

  const acknowledgeAlert = async (roomId: string) => {
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        alertsActive: false,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการรับทราบข้อมูล');
    }
  };

  const formatTime = (ts: any) => {
    if (!ts || !ts.toDate) return '';
    return format(ts.toDate(), 'HH:mm', { locale: th });
  };

  const formatDate = (ts: any) => {
    if (!ts || !ts.toDate) return '';
    return format(ts.toDate(), 'dd MMM yyyy HH:mm', { locale: th });
  };

  const dirtyRooms = rooms.filter(r => r.status === 'dirty');
  const occupiedRooms = rooms.filter(r => r.status === 'occupied');
  const availableRooms = rooms.filter(r => r.status === 'available');

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Sidebar - Stats & Logs */}
      <div className="w-full lg:w-80 flex flex-col gap-6 shrink-0">
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
            <Bell size={14} className="text-indigo-600" />
            Quick Overview
          </h2>
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Available Now</p>
              <p className="text-4xl font-black text-slate-900">{availableRooms.length}/{rooms.length || 4}</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1 p-3 bg-rose-50 rounded-2xl border border-rose-100 text-center">
                <p className="text-[8px] font-black text-rose-600 uppercase mb-1">Occupied</p>
                <p className="text-xl font-black text-slate-900">{occupiedRooms.length}</p>
              </div>
              <div className="flex-1 p-3 bg-amber-50 rounded-2xl border border-amber-100 text-center">
                <p className="text-[8px] font-black text-amber-600 uppercase mb-1">Dirty</p>
                <p className="text-xl font-black text-slate-900">{dirtyRooms.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-indigo-950 text-white p-6 rounded-3xl shadow-xl flex-1 flex flex-col overflow-hidden max-h-[600px]">
          <h2 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-6 flex items-center justify-between">
            <span>Recent Activity</span>
            <History size={14} />
          </h2>
          <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="py-10 text-center text-indigo-800 text-xs font-bold">No activity detected</div>
            ) : (
              logs.map((log, i) => (
                <div key={i} className="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-800/50 hover:bg-indigo-900 transition-colors">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-300">Room {log.roomId.split('-')[1]}</span>
                    <span className="text-[9px] font-black text-indigo-500">{formatTime(log.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn(
                      "px-2 py-0.5 text-[8px] font-black rounded-md uppercase",
                      log.type === 'check-out' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" : 
                      log.type === 'check-in' ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    )}>
                      {log.type === 'check-out' ? 'Out' : log.type === 'check-in' ? 'In' : 'Clean'}
                    </span>
                    <p className="text-[11px] font-bold leading-tight">
                      {log.type === 'check-out' ? 'Guest Out' : 
                       log.type === 'check-in' ? `${log.guestName || 'Guest'} In` : 'Cleaned'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Grid */}
      <div className="flex-1 bg-white rounded-[3rem] p-8 shadow-2xl shadow-indigo-100 border border-slate-100 flex flex-col gap-8 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Room Management</h2>
            <button
              onClick={toggleSound}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border cursor-pointer",
                soundEnabled 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100" 
                  : "bg-slate-100 text-slate-500 border-slate-200/60 hover:bg-slate-200"
              )}
              title={soundEnabled ? "ปิดเสียงแจ้งเตือน" : "เปิดเสียงแจ้งเตือน"}
            >
              {soundEnabled ? (
                <>
                  <Volume2 size={13} className="text-emerald-600 animate-pulse" />
                  <span>เสียงเตือนเปิดอยู่</span>
                </>
              ) : (
                <>
                  <VolumeX size={13} className="text-slate-400" />
                  <span>เปิดเสียงเตือน</span>
                </>
              )}
            </button>
          </div>
          <div className="flex gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Vacant</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Occupied</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-6">
          <AnimatePresence>
            {rooms.map(room => (
              <motion.div 
                layout
                key={room.id}
                onClick={() => setSelectedRoom(room)}
                className={cn(
                  "relative rounded-[2rem] border-2 p-5 flex flex-col justify-between shadow-sm transition-all group cursor-pointer min-h-[160px]",
                  room.status === 'dirty' ? (room.alertsActive ? "bg-rose-50/70 border-rose-500 shadow-xl shadow-rose-100 ring-2 ring-rose-500/40 animate-pulse" : "bg-amber-50/50 border-amber-500 shadow-amber-50") : 
                  room.status === 'occupied' ? "bg-rose-50/50 border-rose-500 shadow-rose-50" : "bg-emerald-50/20 border-emerald-500 shadow-emerald-50"
                )}
              >
                <div className="flex justify-between items-start relative z-10">
                  <span className={cn(
                    "text-3xl font-black tracking-tighter leading-none",
                    room.status === 'dirty' ? (room.alertsActive ? "text-rose-600" : "text-amber-600") : 
                    room.status === 'occupied' ? "text-rose-600" : "text-emerald-600"
                  )}>{room.name.split(' ')[1]}</span>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={cn(
                      "text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest text-white",
                      room.status === 'dirty' ? (room.alertsActive ? "bg-rose-500 animate-bounce" : "bg-amber-500") : 
                      room.status === 'occupied' ? "bg-rose-500" : "bg-emerald-500"
                    )}>
                      {room.status === 'dirty' ? (room.alertsActive ? 'CHECK-OUT' : 'Dirty') : room.status === 'occupied' ? 'Occupied' : 'Vacant'}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400">{formatTime(room.updatedAt)}</span>
                  </div>
                </div>
                
                <div className="mt-6 relative z-10">
                  <p className={cn(
                    "text-[8px] font-black uppercase tracking-widest leading-none mb-1",
                    room.status === 'dirty' ? (room.alertsActive ? "text-rose-500/60" : "text-amber-500/60") : 
                    room.status === 'occupied' ? "text-rose-500/60" : "text-emerald-500/60"
                  )}>
                    {room.status === 'occupied' ? 'Current Guest' : room.status === 'dirty' ? 'Status' : 'Status'}
                  </p>
                  <p className="text-xs font-black text-slate-800 uppercase truncate">
                    {room.status === 'occupied' ? (room.lastGuestName || 'Guest') : 
                     room.status === 'dirty' ? (room.alertsActive ? 'เช็คเอาท์แล้ว' : 'Needs Clean') : 'Ready'}
                  </p>
                </div>

                {room.status === 'dirty' && (
                  room.alertsActive ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        acknowledgeAlert(room.id);
                      }}
                      className="mt-4 w-full py-2 bg-rose-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 transition-all hover:bg-rose-700 active:scale-95 z-20 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Bell size={10} className="animate-pulse" />
                      <span>รับทราบ (หยุดเสียง)</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markCleaned(room.id);
                      }}
                      className="mt-4 w-full py-2 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-amber-200 transition-all hover:bg-amber-600 active:scale-95 z-20 cursor-pointer"
                    >
                      Cleaned
                    </button>
                  )
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Room History Overlay */}
        <AnimatePresence>
          {selectedRoom && (
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="absolute inset-y-0 right-0 w-full sm:w-[400px] bg-white shadow-2xl border-l border-slate-100 z-50 flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">{selectedRoom.name}</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Room History & Logs</p>
                </div>
                <button 
                  onClick={() => setSelectedRoom(null)}
                  className="p-2 bg-slate-100 rounded-full text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">History</h4>
                    {!showDeleteConfirm && roomLogs.length > 0 && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="text-[10px] font-black uppercase tracking-wider text-rose-500 hover:text-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        ล้างประวัติ
                      </button>
                    )}
                  </div>

                  {showDeleteConfirm && (
                    <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-3">
                      <p className="text-[11px] font-black text-rose-800 uppercase tracking-widest">ยืนยันล้างประวัติห้องพัก</p>
                      <p className="text-[10px] text-rose-600 font-bold">พนักงานต้องการล้างประวัติใช่หรือไม่? กรุณากรอกรหัสผ่านเพื่อยืนยัน:</p>
                      <input
                        type="password"
                        placeholder="กรอกรหัสผ่านเพื่อลบประวัติ"
                        value={deletePassword}
                        onChange={(e) => {
                          setDeletePassword(e.target.value);
                          setDeleteError('');
                        }}
                        className="w-full text-xs font-mono px-3 py-2 bg-white border border-rose-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleClearRoomHistory();
                        }}
                      />
                      {deleteError && (
                        <p className="text-[10px] text-rose-600 font-black">{deleteError}</p>
                      )}
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                            setDeleteError('');
                          }}
                          className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button
                          onClick={handleClearRoomHistory}
                          className="px-3 py-1.5 bg-rose-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-rose-700 active:scale-95 cursor-pointer"
                        >
                          ยืนยัน
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    {roomLogs.length === 0 ? (
                      <div className="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">No history found</div>
                    ) : (
                      roomLogs.map((log, i) => (
                        <div key={i} className="flex gap-4 relative group">
                          {i !== roomLogs.length - 1 && (
                            <div className="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-slate-50 group-hover:bg-slate-100 transition-colors"></div>
                          )}
                          <div className={cn(
                            "w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10",
                            log.type === 'check-in' ? "bg-indigo-600 text-white" : 
                            log.type === 'check-out' ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"
                          )}>
                            {log.type === 'check-in' ? <User size={10} /> : log.type === 'check-out' ? <X size={10} /> : <CheckCircle2 size={10} />}
                          </div>
                          <div className="flex-1 space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] font-black uppercase text-slate-900">
                                {log.type === 'check-in' ? 'Check-In' : log.type === 'check-out' ? 'Check-Out' : 'Cleaned'}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400">{formatDate(log.timestamp)}</span>
                            </div>
                            <p className="text-xs font-bold text-slate-500">
                              {log.type === 'check-in' ? `Guest: ${log.guestName}` : 
                               log.type === 'check-out' ? `Guest: ${log.guestName} Left` : 'Room sanitized'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, icon, pulse }: any) {
  return (
    <div className={cn("flex items-center justify-between rounded-3xl border p-6 transition-all", color)}>
      <div className="space-y-1">
        <div className="text-sm font-medium opacity-80">{label}</div>
        <div className="text-3xl font-bold">{value}</div>
      </div>
      <div className={cn("rounded-2xl bg-white/50 p-3 shadow-sm", pulse && "animate-pulse")}>
        {icon}
      </div>
    </div>
  );
}
