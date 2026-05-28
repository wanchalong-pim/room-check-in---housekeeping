import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { setDoc, doc, collection, getDocs, deleteDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../services/firebase';
import { RefreshCw, Download, ExternalLink, AlertCircle, ArrowLeft, X } from 'lucide-react';
import { cn } from '../lib/utils';

const ROOM_COUNT = 4;
const TARGET_ROOMS = [
  { id: 'room-211', name: 'Room 211' },
  { id: 'room-213', name: 'Room 213' },
  { id: 'room-215', name: 'Room 215' },
  { id: 'room-217', name: 'Room 217' }
];

interface RoomCardProps {
  key?: React.Key;
  room: any;
  baseUrl: string;
  onRoomClick: (id: string) => void;
  onDownloadQR: (id: string, name: string) => void;
}

function RoomCard({ 
  room, 
  baseUrl, 
  onRoomClick, 
  onDownloadQR 
}: RoomCardProps) {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const qrUrl = `${cleanBase}/?room=${room.id}`;

  return (
    <div className="relative flex flex-col items-center gap-6 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50 transition-all hover:translate-y-[-4px]">
      <div className="w-full text-center">
        <div className="w-full text-center text-2xl font-black text-slate-900 py-2">
          {room.name}
        </div>
      </div>
      <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6">
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
           <QRCodeSVG id={`qr-${room.id}`} value={qrUrl} size={160} />
         </div>
      </div>
      <div className="flex w-full gap-3">
        <button
          onClick={() => onRoomClick(room.id)}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-200"
        >
          <ExternalLink size={18} />
          ทดสอบ
        </button>
        <button
          onClick={() => onDownloadQR(room.id, room.name)}
          className="flex items-center justify-center rounded-2xl bg-indigo-600 px-5 text-white transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-100"
        >
          <Download size={20} />
        </button>
      </div>
      <div className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 break-all px-4">
        Scan to Check-In / Out
      </div>
    </div>
  );
}

export default function SetupView({ onRoomClick }: { onRoomClick: (id: string) => void }) {
  const [initializing, setInitializing] = useState(false);
  const [roomsExist, setRoomsExist] = useState(false);
  const [rooms, setRooms] = useState<any[]>([]);
  const [baseUrl, setBaseUrl] = useState('');

  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    fetchRooms();
    // Default to the shared origin
    const currentOrigin = window.location.origin;
    const isDev = currentOrigin.includes('-dev-');
    const sharedOrigin = isDev ? currentOrigin.replace('-dev-', '-pre-') : currentOrigin;
    setBaseUrl(sharedOrigin);
  }, []);

  const fetchRooms = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'rooms'));
      if (snapshot.size > 0) {
        const roomsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort naturally
        roomsData.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
        setRooms(roomsData);
        
        // Check if existing rooms exactly match our 4 target rooms
        const currentIds = roomsData.map(r => r.id).sort();
        const targetIds = TARGET_ROOMS.map(t => t.id).sort();
        const matches = currentIds.length === targetIds.length && 
                        currentIds.every((id, index) => id === targetIds[index]);
        
        setRoomsExist(matches);
      } else {
        setRooms([]);
        setRoomsExist(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const clearAllData = async () => {
    if (!confirm('ยืนยันการล้างข้อมูลทั้งหมด? (ห้องพักและกิจกรรมล่าสุดจะถูกลบออกทั้งหมด)')) return;
    setInitializing(true);
    try {
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      const logsSnapshot = await getDocs(collection(db, 'logs'));
      const batch = writeBatch(db);
      
      roomsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      logsSnapshot.docs.forEach((doc) => batch.delete(doc.ref));
      
      await batch.commit();
      setRooms([]);
      setRoomsExist(false);
      alert('ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clear');
    } finally {
      setInitializing(false);
    }
  };

  const seedRooms = async () => {
    setInitializing(true);
    try {
      // 1. Clear ALL existing rooms
      const roomsSnapshot = await getDocs(collection(db, 'rooms'));
      const batch = writeBatch(db);
      roomsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // 2. Clear ALL existing logs (Recent Activity)
      const logsSnapshot = await getDocs(collection(db, 'logs'));
      logsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();

      // 3. Setup new target rooms
      const newRooms = [];
      for (const target of TARGET_ROOMS) {
        const roomData = {
          id: target.id,
          name: target.name,
          status: 'available',
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'rooms', target.id), roomData);
        newRooms.push(roomData);
      }
      setRooms(newRooms);
      setRoomsExist(true);
      alert('ติดตั้ง 4 ห้องพัก (211, 213, 215, 217) เรียบร้อยแล้ว!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'rooms');
    } finally {
      setInitializing(false);
    }
  };

  const downloadQR = (roomId: string, roomName: string) => {
    const svg = document.getElementById(`qr-${roomId}`);
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    
    const svgSize = 512; // High resolution for download
    canvas.width = svgSize;
    canvas.height = svgSize;

    img.onload = () => {
      if (ctx) {
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const pngFile = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `QR-${roomName}.png`;
        downloadLink.href = `${pngFile}`;
        downloadLink.click();
      }
    };
    
    // Use URL.createObjectURL for better reliability with binary data
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    img.src = url;
  };

  return (
    <div className="space-y-8">
      {/* Dynamic Instruction Button */}
      {!baseUrl.includes('-pre-') && !showInstructions && (
        <button 
          onClick={() => setShowInstructions(true)}
          className="w-full p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors animate-pulse"
        >
          <AlertCircle size={16} />
          คุณกำลังใช้ Dev URL? วิธีเปิดให้ลูกค้าใช้ได้ฟรี (ไม่ต้อง Login)
        </button>
      )}

      {showInstructions && (
        <div className="rounded-[2rem] border-2 p-8 transition-all bg-emerald-50 border-emerald-200 relative overflow-hidden">
          <button 
            onClick={() => setShowInstructions(false)}
            className="absolute top-6 right-6 p-2 bg-white/50 rounded-full hover:bg-white text-slate-500 transition-all"
          >
            <X size={18} />
          </button>
          <div className="flex flex-col md:flex-row gap-6 items-start">
            <div className="p-4 rounded-2xl shrink-0 shadow-lg bg-emerald-500 text-white shadow-emerald-100">
              <ExternalLink size={32} />
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">วิธีใช้งานแบบไม่ต้อง Login</h3>
                <p className="text-sm font-bold text-slate-500 mt-1">
                  ทำตามขั้นตอนดังนี้เพื่อเปิดให้แขกเข้าใช้งานได้ทันที
                </p>
              </div>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white/60 p-4 rounded-xl border border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Step 1</span>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">กดปุ่ม <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-[10px] font-black">Share</span> มุมขวาบนหน้าจอ</p>
                </div>
                <div className="bg-white/60 p-4 rounded-xl border border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Step 2</span>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">เลือก <span className="text-blue-600 font-black">Anyone with link</span> และ <span className="font-black">Public</span></p>
                </div>
                <div className="bg-white/60 p-4 rounded-xl border border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Step 3</span>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">ก๊อปปี้ลิงก์ <span className="text-indigo-600 font-black">.run.app</span> มาวางช่องด้านล่าง</p>
                </div>
                <div className="bg-white/60 p-4 rounded-xl border border-slate-200/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Step 4</span>
                  <p className="text-xs font-bold text-slate-700 leading-relaxed">บันทึกรูป QR ไปติดหน้าห้องให้แขกสแกน</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-end">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <button 
              onClick={() => window.location.href = window.location.origin + '?view=housekeeping'}
              className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200 transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Settings</span>
          </div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900">ตัวจัดการ QR Code</h2>
          <p className="text-slate-500 font-medium">จัดการข้อมูลห้องพักและลิงก์สำหรับนักท่องเที่ยว</p>
        </div>
        
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end lg:w-2/3">
          <div className="flex-1 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">🌐 Public URL (วางลิงก์ที่ได้จากปุ่ม Share)</label>
            <div className="relative group">
              <input 
                type="text" 
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://ais-pre-...run.app"
                className={cn(
                  "w-full rounded-xl border-2 px-4 py-3 text-sm font-bold outline-none shadow-sm transition-all",
                  baseUrl.includes('-dev-') ? "border-rose-200 bg-rose-50 focus:border-rose-500" : "border-indigo-100 bg-white focus:border-indigo-600"
                )}
              />
              {baseUrl.includes('-dev-') && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[9px] font-black uppercase text-rose-600">
                  <AlertCircle size={12} />
                  Dev URL (ล็อคอินเท่านั้น)
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearAllData}
              disabled={initializing}
              className="flex h-[48px] items-center gap-2 rounded-xl bg-slate-100 px-4 font-bold text-slate-600 transition-all hover:bg-slate-200 active:scale-95 disabled:opacity-50"
              title="Clear all rooms and logs"
            >
              <RefreshCw className={initializing ? "animate-spin" : ""} size={20} />
              ล้างทั้งหมด
            </button>
            {!roomsExist ? (
              <button
                onClick={seedRooms}
                disabled={initializing}
                className="flex h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-6 font-bold text-white shadow-lg shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={initializing ? "animate-spin" : ""} size={20} />
                {initializing ? "กำลังติดตั้ง..." : "เริ่มใช้งาน 4 ห้อง"}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (!baseUrl.startsWith('http')) {
                    alert('กรุณาวางลิงก์ที่ถูกต้องจากปุ่ม Share ก่อนครับ');
                    return;
                  }
                  navigator.clipboard.writeText(baseUrl);
                  alert('คัดลอกลิงก์เรียบร้อย! คุณสามารถนำลิงก์นี้ไปส่งให้ลูกค้าได้');
                }}
                className="flex h-[48px] items-center gap-2 rounded-xl bg-slate-900 px-6 font-bold text-white shadow-lg shadow-slate-200 transition-all hover:bg-black active:scale-95"
              >
                Copy Link
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <RoomCard 
            key={room.id}
            room={room}
            baseUrl={baseUrl}
            onRoomClick={onRoomClick}
            onDownloadQR={downloadQR}
          />
        ))}
      </div>
    </div>
  );
}

