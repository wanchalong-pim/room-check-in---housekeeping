/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, UserCheck, Settings, Home } from 'lucide-react';
import HousekeepingView from './components/HousekeepingView';
import GuestView from './components/GuestView';
import SetupView from './components/SetupView';
import { cn } from './lib/utils';

export default function App() {
  const [view, setView] = useState<'landing' | 'guest' | 'housekeeping' | 'setup'>('landing');
  const [roomId, setRoomId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    const v = params.get('view');

    if (r) {
      setRoomId(r);
      setView('guest');
    } else if (v === 'housekeeping') {
      setView('housekeeping');
    } else if (v === 'setup') {
      setView('setup');
    } else {
      setView('landing');
    }
  }, []);

  const navigateTo = (newView: typeof view, newRoomId?: string) => {
    const params = new URLSearchParams();
    if (newRoomId) params.set('room', newRoomId);
    if (newView === 'housekeeping') params.set('view', 'housekeeping');
    if (newView === 'setup') params.set('view', 'setup');
    
    const url = params.toString() ? `?${params.toString()}` : '/';
    window.history.pushState({}, '', url);
    
    setRoomId(newRoomId || null);
    setView(newView);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-indigo-100 italic-serif-headers">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button 
            onClick={() => navigateTo('landing')}
            className="flex items-center gap-2 text-xl font-black tracking-tighter text-slate-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-indigo-600 text-white shadow-lg shadow-indigo-100">
              <Home size={20} />
            </div>
            <span>SmartStay</span>
          </button>

          <nav className="flex items-center gap-1">
            <button
              id="nav-housekeeping"
              onClick={() => navigateTo('housekeeping')}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                view === 'housekeeping' 
                  ? "bg-zinc-900 text-white" 
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:inline">แม่บ้าน</span>
            </button>
            <button
              id="nav-setup"
              onClick={() => navigateTo('setup')}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200",
                view === 'setup' 
                  ? "bg-zinc-900 text-white" 
                  : "text-zinc-600 hover:bg-zinc-100"
              )}
            >
              <Settings size={16} />
              <span className="hidden sm:inline">ตั้งค่า QR</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={view + (roomId || '')}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {view === 'landing' && (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-8 rounded-[2.5rem] bg-indigo-50 p-6 text-indigo-600 shadow-inner">
                  <UserCheck size={64} />
                </div>
                <h1 className="mb-6 text-5xl font-black tracking-tighter sm:text-6xl text-slate-900">
                  Room Management <br/> Simplified.
                </h1>
                <p className="mb-10 max-w-lg text-lg font-medium text-slate-500 leading-relaxed">
                  Fast self check-in, real-time housekeeping, and automated room tracking. Unified in one powerful portal.
                </p>
                <div className="flex flex-wrap justify-center gap-6">
                  <button
                    onClick={() => navigateTo('housekeeping')}
                    className="flex h-16 items-center gap-4 rounded-2xl bg-slate-900 px-10 text-xl font-black text-white shadow-2xl shadow-slate-200 transition-all hover:bg-black active:scale-[0.98]"
                  >
                    <LayoutDashboard size={28} />
                    Open Dashboard
                  </button>
                </div>
              </div>
            )}

            {view === 'guest' && roomId && (
              <GuestView roomId={roomId} />
            )}

            {view === 'housekeeping' && (
              <HousekeepingView />
            )}

            {view === 'setup' && (
              <SetupView onRoomClick={(id) => navigateTo('guest', id)} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white py-12">
        <div className="mx-auto max-w-5xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row text-slate-500">
            <div className="text-sm font-bold">
              © 2024 SmartStay 10 - Premium Room Management
            </div>
            <div className="flex gap-8 text-sm font-bold">
              <span className="cursor-pointer hover:text-indigo-600 transition-colors">ช่วยเหลือ</span>
              <span className="cursor-pointer hover:text-indigo-600 transition-colors">นโยบายความเป็นส่วนตัว</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
