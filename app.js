import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  collection, 
  getDocs, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  onSnapshot, 
  writeBatch, 
  query, 
  orderBy, 
  limit, 
  where, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Global App State ---
let db = null;
let currentView = 'landing';
let currentRoomId = null;

let rooms = [];
let logs = [];
let selectedRoom = null;
let selectedRoomLogs = [];
let soundEnabled = true;

let roomsUnsubscribe = null;
let logsUnsubscribe = null;
let selectedRoomLogsUnsubscribe = null;
let alertInterval = null;

const TARGET_ROOMS = [
  { id: 'room-211', name: 'Room 211' },
  { id: 'room-213', name: 'Room 213' },
  { id: 'room-215', name: 'Room 215' },
  { id: 'room-217', name: 'Room 217' }
];

// --- Audio Controller using Web Audio API ---
function playAlertSound() {
  if (!soundEnabled) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    
    const playChimePair = (startTime) => {
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

    // Play 5 cycles of the chime pairs beautifully over ~5 seconds (0s, 1.2s, 2.4s, 3.6s, 4.8s)
    for (let i = 0; i < 5; i++) {
      playChimePair(i * 1.2);
    }
  } catch (err) {
    console.warn('Web Audio context not allowed or supported by browser:', err);
  }
}

// --- Date Formatter Helper ---
function formatDateThai(timestamp, showTimeOnly = false) {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  if (showTimeOnly) {
    return new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date);
  }
  
  return new Intl.DateTimeFormat('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

// --- Init Firebase and start App ---
async function initFirebase() {
  const globalLoading = document.getElementById('global-loading');
  try {
    const configResponse = await fetch('./firebase-applet-config.json');
    if (!configResponse.ok) throw new Error("Can't find configuration file");
    
    const firebaseConfig = await configResponse.json();
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    
    // Hide global loader
    globalLoading.classList.add('hidden');
    
    // Check initial sound state
    soundEnabled = localStorage.getItem('sound_alert') !== 'false';
    const soundToggle = document.getElementById('hk-sound-toggle');
    updateSoundButtonUI(soundEnabled, soundToggle);
    
    console.log("Firebase connected to:", firebaseConfig.firestoreDatabaseId);
    
    // Setup Navigation event listeners
    setupNavigationListeners();
    
    // Boot logic listeners
    startSyncingRealtimeData();
    
    // Initial router check
    handleRouting();
    
  } catch (error) {
    console.error("Failed to boot app:", error);
    globalLoading.innerHTML = `
      <div class="flex flex-col items-center justify-center p-8 text-center text-rose-600 bg-rose-50 rounded-[2rem] border border-rose-200">
        <i data-lucide="alert-circle" class="w-12 h-12 text-rose-500 mb-3"></i>
        <h3 class="text-xl font-black">ไม่สามารถอัปโหลดฐานข้อมูลได้</h3>
        <p class="mt-2 text-sm text-rose-500 font-bold">กรุณาตรวจสอบว่าคุณได้กำหนด Firebase Setup สมบูรณ์แล้ว</p>
      </div>
    `;
    lucide.createIcons();
  }
}

// --- Setup Router navigation ---
function setupNavigationListeners() {
  const navLogo = document.getElementById('nav-logo');
  const navHousekeeping = document.getElementById('nav-housekeeping');
  const navSetup = document.getElementById('nav-setup');
  
  navLogo.addEventListener('click', () => navigateTo('landing'));
  navHousekeeping.addEventListener('click', () => navigateTo('housekeeping'));
  navSetup.addEventListener('click', () => navigateTo('setup'));
  
  // Landing Button
  document.getElementById('landing-open-dashboard').addEventListener('click', () => {
    navigateTo('housekeeping');
  });
  
  // Setup Back Button
  document.getElementById('setup-back-btn').addEventListener('click', () => {
    navigateTo('housekeeping');
  });

  // Guest Back Button
  document.getElementById('guest-back-btn').addEventListener('click', () => {
    navigateTo('landing');
  });

  // Routing on browser nav pop back
  window.addEventListener('popstate', () => {
    handleRouting();
  });
}

function handleRouting() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  const view = params.get('view');
  
  if (room) {
    navigateTo('guest', room);
  } else if (view === 'housekeeping') {
    navigateTo('housekeeping');
  } else if (view === 'setup') {
    navigateTo('setup');
  } else {
    navigateTo('landing');
  }
}

function navigateTo(view, roomId = null) {
  currentView = view;
  currentRoomId = roomId;
  
  // Modify location search parameters
  const params = new URLSearchParams();
  if (roomId) params.set('room', roomId);
  else if (view === 'housekeeping') params.set('view', 'housekeeping');
  else if (view === 'setup') params.set('view', 'setup');
  
  const searchStr = params.toString() ? `?${params.toString()}` : '';
  const expectedUrl = window.location.pathname + searchStr;
  
  if (window.location.search !== searchStr) {
    window.history.pushState({}, '', expectedUrl);
  }
  
  // Render views toggle
  showActiveViewDetails();
}

function updateNavbarActiveStyles() {
  const navHousekeeping = document.getElementById('nav-housekeeping');
  const navSetup = document.getElementById('nav-setup');

  // De-active
  navHousekeeping.className = "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 text-zinc-600 hover:bg-zinc-100 active-scale";
  navSetup.className = "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 text-zinc-600 hover:bg-zinc-100 active-scale";

  if (currentView === 'housekeeping') {
    navHousekeeping.className = "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 bg-zinc-900 text-white active-scale";
  } else if (currentView === 'setup') {
    navSetup.className = "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 bg-zinc-900 text-white active-scale";
  }
}

function showActiveViewDetails() {
  // Hide all
  document.getElementById('view-landing').classList.add('hidden');
  document.getElementById('view-guest').classList.add('hidden');
  document.getElementById('view-housekeeping').classList.add('hidden');
  document.getElementById('view-setup').classList.add('hidden');

  updateNavbarActiveStyles();

  if (currentView === 'landing') {
    document.getElementById('view-landing').classList.remove('hidden');
  } else if (currentView === 'guest') {
    document.getElementById('view-guest').classList.remove('hidden');
    startSyncingGuestRoom(currentRoomId);
  } else if (currentView === 'housekeeping') {
    document.getElementById('view-housekeeping').classList.remove('hidden');
  } else if (currentView === 'setup') {
    document.getElementById('view-setup').classList.remove('hidden');
    renderSetupView();
  }
  lucide.createIcons();
}

// --- Realtime Subscriptions ---
function startSyncingRealtimeData() {
  // Subscribe to rooms list
  roomsUnsubscribe = onSnapshot(collection(db, 'rooms'), (snapshot) => {
    rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    rooms.sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
      return numA - numB;
    });
    
    // Check alarm status
    checkTriggerSoundAlarm();
    
    // Renders
    renderHousekeepingOverview();
    renderHousekeepingGrid();
    if (currentView === 'setup') {
      renderSetupRoomsGrid();
    }
  }, (err) => console.error("Error fetching rooms snapshot:", err));

  // Subscribe to recent logs
  const logsQuery = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
  logsUnsubscribe = onSnapshot(logsQuery, (snapshot) => {
    logs = snapshot.docs.map(doc => doc.data());
    renderRecentActivitySection();
  }, (err) => console.error("Error fetching logs snapshot:", err));
}

// Check if any room has status === 'dirty' and alertsActive === true
function checkTriggerSoundAlarm() {
  const needsAlarm = rooms.some(r => r.status === 'dirty' && r.alertsActive === true);
  
  if (alertInterval) {
    clearInterval(alertInterval);
    alertInterval = null;
  }

  if (needsAlarm && soundEnabled) {
    // Play immediately
    playAlertSound();
    
    // Loop every 6 seconds as long as alarm has state active
    alertInterval = setInterval(() => {
      playAlertSound();
    }, 6000);
  }
}

// --- Sync individual guest view ---
let guestRoomUnsubscribe = null;
function startSyncingGuestRoom(roomId) {
  if (guestRoomUnsubscribe) {
    guestRoomUnsubscribe();
    guestRoomUnsubscribe = null;
  }

  const roomNameEl = document.getElementById('guest-room-name');
  const statusBadge = document.getElementById('guest-status-badge');
  const headerBg = document.getElementById('guest-header-bg');
  
  const subAvailable = document.getElementById('guest-sub-available');
  const subOccupied = document.getElementById('guest-sub-occupied');
  const subDirty = document.getElementById('guest-sub-dirty');

  guestRoomUnsubscribe = onSnapshot(doc(db, 'rooms', roomId), (docSnap) => {
    if (!docSnap.exists()) {
      roomNameEl.innerText = "Error: Room not found";
      return;
    }
    
    const room = docSnap.data();
    roomNameEl.innerText = room.name || room.id.toUpperCase();
    
    // Reset Subviews
    subAvailable.classList.add('hidden');
    subOccupied.classList.add('hidden');
    subDirty.classList.add('hidden');
    
    // Theme styling based on room state
    if (room.status === 'available') {
      statusBadge.innerText = 'Vacant';
      statusBadge.className = 'rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md bg-white/20 text-white';
      headerBg.className = 'h-48 p-10 text-white flex flex-col justify-end gap-2 bg-emerald-600 shadow-inner';
      subAvailable.classList.remove('hidden');
    } else if (room.status === 'occupied') {
      statusBadge.innerText = 'Occupied';
      statusBadge.className = 'rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md bg-white/20 text-white';
      headerBg.className = 'h-48 p-10 text-white flex flex-col justify-end gap-2 bg-rose-600 shadow-inner';
      
      document.getElementById('guest-welcome-title').innerText = `Welcome, ${room.lastGuestName || 'Guest'}`;
      document.getElementById('guest-checkin-time').innerText = `Checked-in at ${formatDateThai(room.updatedAt, true)}`;
      
      subOccupied.classList.remove('hidden');
    } else if (room.status === 'dirty') {
      statusBadge.innerText = 'Cleaning';
      statusBadge.className = 'rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-wider backdrop-blur-md bg-white/20 text-white';
      headerBg.className = 'h-48 p-10 text-white flex flex-col justify-end gap-2 bg-amber-500 shadow-inner';
      subDirty.classList.remove('hidden');
    }
  }, (err) => {
    console.error("Failed to listener to guest room state:", err);
  });
}

// Guest action handlers
document.getElementById('guest-confirm-checkin').addEventListener('click', async () => {
  const guestNameInput = document.getElementById('guest-name-input');
  const name = guestNameInput.value.trim() || 'ไม่ระบุชื่อ';
  
  try {
    const rRef = doc(db, 'rooms', currentRoomId);
    await updateDoc(rRef, {
      status: 'occupied',
      lastGuestName: name,
      updatedAt: serverTimestamp()
    });

    // Activity logging
    await addDoc(collection(db, 'logs'), {
      roomId: currentRoomId,
      type: 'check-in',
      guestName: name,
      timestamp: serverTimestamp()
    });

    guestNameInput.value = '';
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเช็คอิน กรุณาลองอีกครั้ง');
  }
});

document.getElementById('guest-checkout-btn').addEventListener('click', async () => {
  try {
    const rRef = doc(db, 'rooms', currentRoomId);
    const docSnap = await getDoc(rRef);
    const roomData = docSnap.exists() ? docSnap.data() : {};
    
    await updateDoc(rRef, {
      status: 'dirty',
      alertsActive: true,
      updatedAt: serverTimestamp()
    });

    // Logger
    await addDoc(collection(db, 'logs'), {
      roomId: currentRoomId,
      type: 'check-out',
      guestName: roomData.lastGuestName || 'ไม่ระบุชื่อ',
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเช็คเอาท์ กรุณาลองอีกครั้ง');
  }
});

document.getElementById('guest-refresh-status').addEventListener('click', () => {
  if (currentRoomId) startSyncingGuestRoom(currentRoomId);
});

// --- Renders: Housekeeping View ---
function renderHousekeepingOverview() {
  const dirtyCount = rooms.filter(r => r.status === 'dirty').length;
  const occupiedCount = rooms.filter(r => r.status === 'occupied').length;
  const availableCount = rooms.filter(r => r.status === 'available').length;

  document.getElementById('stat-available').innerText = `${availableCount}/${rooms.length || 4}`;
  document.getElementById('stat-occupied').innerText = occupiedCount;
  document.getElementById('stat-dirty').innerText = dirtyCount;
}

function renderRecentActivitySection() {
  const container = document.getElementById('hk-logs-container');
  if (logs.length === 0) {
    container.innerHTML = `<div class="py-10 text-center text-indigo-800 text-xs font-bold font-mono">No activity detected</div>`;
    return;
  }

  container.innerHTML = logs.map(log => {
    let actionBadge = '';
    let descriptionText = '';

    const displayRoomNum = log.roomId ? log.roomId.split('-')[1] : '???';

    if (log.type === 'check-out') {
      actionBadge = `<span class="px-2 py-0.5 text-[8px] font-black rounded-md uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30">Out</span>`;
      descriptionText = `Guest check out`;
    } else if (log.type === 'check-in') {
      actionBadge = `<span class="px-2 py-0.5 text-[8px] font-black rounded-md uppercase bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">In</span>`;
      descriptionText = `${log.guestName || 'Guest'} checked in`;
    } else {
      actionBadge = `<span class="px-2 py-0.5 text-[8px] font-black rounded-md uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Clean</span>`;
      descriptionText = `Room cleaned`;
    }

    return `
      <div class="bg-indigo-900/40 p-4 rounded-2xl border border-indigo-800/50 hover:bg-indigo-900 transition-colors">
        <div class="flex justify-between items-center mb-1">
          <span class="text-[10px] font-black uppercase tracking-wider text-indigo-300">Room ${displayRoomNum}</span>
          <span class="text-[9px] font-black text-indigo-500">${formatDateThai(log.timestamp, true)}</span>
        </div>
        <div class="flex items-center gap-2 mb-1">
          ${actionBadge}
          <p class="text-[11px] font-bold leading-tight text-white">${descriptionText}</p>
        </div>
      </div>
    `;
  }).join('');
}

function renderHousekeepingGrid() {
  const grid = document.getElementById('hk-rooms-grid');
  if (rooms.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-[2rem] text-slate-400 font-bold">
        กรุณาบันทึกเริ่มต้น "ตั้งค่า QR" เพื่อสร้างห้องพัก
      </div>
    `;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    let cardThemeClasses = '';
    let badgeText = '';
    let badgeStyle = '';
    let footerName = '';
    let footerStatusLabel = '';
    let actionButton = '';

    const displayNum = room.name ? room.name.split(' ')[1] : room.id;

    if (room.status === 'dirty') {
      if (room.alertsActive === true) {
        cardThemeClasses = 'bg-rose-50/70 border-rose-500 shadow-xl shadow-rose-100 ring-2 ring-rose-500/40 animate-pulse';
        badgeText = 'CHECK-OUT';
        badgeStyle = 'bg-rose-500 animate-bounce';
        footerStatusLabel = 'เช็คเอาท์แล้ว';
        footerName = 'STATUS';
        actionButton = `
          <button
            data-room-id="${room.id}"
            class="hk-ack-alert-btn mt-4 w-full py-2 bg-rose-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-rose-200 transition-all hover:bg-rose-700 active-scale flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <i data-lucide="bell" class="w-3 h-3 animate-pulse"></i>
            <span>รับทราบ (หยุดเสียง)</span>
          </button>
        `;
      } else {
        cardThemeClasses = 'bg-amber-50/50 border-amber-500 shadow-amber-50';
        badgeText = 'Dirty';
        badgeStyle = 'bg-amber-500';
        footerStatusLabel = 'Needs Clean';
        footerName = 'STATUS';
        actionButton = `
          <button
            data-room-id="${room.id}"
            class="hk-cleaned-btn mt-4 w-full py-2 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-amber-200 transition-all hover:bg-amber-600 active-scale cursor-pointer"
          >
            Cleaned
          </button>
        `;
      }
    } else if (room.status === 'occupied') {
      cardThemeClasses = 'bg-rose-50/50 border-rose-500 shadow-rose-50';
      badgeText = 'Occupied';
      badgeStyle = 'bg-rose-500';
      footerName = 'Current Guest';
      footerStatusLabel = room.lastGuestName || 'Guest';
    } else {
      cardThemeClasses = 'bg-emerald-50/20 border-emerald-500 shadow-emerald-50';
      badgeText = 'Vacant';
      badgeStyle = 'bg-emerald-500';
      footerName = 'STATUS';
      footerStatusLabel = 'Ready';
    }

    return `
      <div 
        data-room-id="${room.id}"
        class="hk-room-card relative rounded-[2rem] border-2 p-5 flex flex-col justify-between shadow-sm transition-all group cursor-pointer min-h-[160px] ${cardThemeClasses}"
      >
        <div class="flex justify-between items-start relative z-10 w-full">
          <span class="text-3xl font-black tracking-tighter leading-none text-slate-800">${displayNum}</span>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <span class="text-[8px] font-black px-2 py-0.5 rounded-md uppercase tracking-widest text-white ${badgeStyle}">
              ${badgeText}
            </span>
            <span class="text-[8px] font-bold text-slate-400">${formatDateThai(room.updatedAt, true)}</span>
          </div>
        </div>
        
        <div class="mt-6 relative z-10">
          <p class="text-[8px] font-black uppercase tracking-widest leading-none mb-1 text-slate-400">
            ${footerName}
          </p>
          <p class="text-xs font-black text-slate-800 uppercase truncate">
            ${footerStatusLabel}
          </p>
        </div>

        ${actionButton}
      </div>
    `;
  }).join('');

  lucide.createIcons();

  // Attach event helpers for layout actions
  document.querySelectorAll('.hk-room-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // Avoid action buttons triggering click
      if (e.target.closest('button')) return;
      const id = card.getAttribute('data-room-id');
      const r = rooms.find(room => room.id === id);
      if (r) openRoomHistoryPanel(r);
    });
  });

  document.querySelectorAll('.hk-ack-alert-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-room-id');
      try {
        await updateDoc(doc(db, 'rooms', id), {
          alertsActive: false,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error(error);
      }
    });
  });

  document.querySelectorAll('.hk-cleaned-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-room-id');
      try {
        await updateDoc(doc(db, 'rooms', id), {
          status: 'available',
          alertsActive: false,
          updatedAt: serverTimestamp()
        });

        await addDoc(collection(db, 'logs'), {
          roomId: id,
          type: 'cleaned',
          timestamp: serverTimestamp()
        });
      } catch (error) {
        console.error(error);
      }
    });
  });
}

// Sound controllers
const soundToggle = document.getElementById('hk-sound-toggle');
soundToggle.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  localStorage.setItem('sound_alert', String(soundEnabled));
  
  updateSoundButtonUI(soundEnabled, soundToggle);
  
  if (soundEnabled) {
    playAlertSound();
  } else {
    if (alertInterval) {
      clearInterval(alertInterval);
      alertInterval = null;
    }
  }
});

function updateSoundButtonUI(isEnabled, el) {
  if (isEnabled) {
    el.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border cursor-pointer bg-emerald-50 text-emerald-700 border-emerald-200/60 hover:bg-emerald-100 active-scale";
    el.innerHTML = `
      <i data-lucide="volume-2" class="w-3.5 h-3.5 text-emerald-600 animate-pulse"></i>
      <span>เสียงเตือนเปิดอยู่</span>
    `;
  } else {
    el.className = "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all shadow-sm border cursor-pointer bg-slate-100 text-slate-500 border-slate-200/60 hover:bg-slate-200 active-scale";
    el.innerHTML = `
      <i data-lucide="volume-x" class="w-3.5 h-3.5 text-slate-400"></i>
      <span>เปิดเสียงเตือน</span>
    `;
  }
  lucide.createIcons();
}

// --- Drawer: Room historical panel ---
function openRoomHistoryPanel(room) {
  selectedRoom = room;
  
  document.getElementById('panel-room-name').innerText = room.name || room.id;
  
  // Slide open drawer
  const drawer = document.getElementById('history-panel');
  drawer.classList.remove('closed');
  drawer.classList.add('open');

  // Reset verify deletepassword view
  document.getElementById('panel-password-confirm').classList.add('hidden');
  document.getElementById('panel-password-input').value = '';
  document.getElementById('panel-password-error').classList.add('hidden');

  // Subscribe to logs for selected room
  if (selectedRoomLogsUnsubscribe) {
    selectedRoomLogsUnsubscribe();
  }

  const qLogs = query(
    collection(db, 'logs'),
    where('roomId', '==', room.id),
    orderBy('timestamp', 'desc'),
    limit(20)
  );

  selectedRoomLogsUnsubscribe = onSnapshot(qLogs, (snap) => {
    selectedRoomLogs = snap.docs.map(doc => doc.data());
    
    // Render logs
    renderSelectedRoomLogs();
  }, (err) => console.error("Error fetching selected room logs:", err));
}

// Close panel
document.getElementById('panel-close-btn').addEventListener('click', () => {
  const drawer = document.getElementById('history-panel');
  drawer.classList.remove('open');
  drawer.classList.add('closed');
  
  if (selectedRoomLogsUnsubscribe) {
    selectedRoomLogsUnsubscribe();
    selectedRoomLogsUnsubscribe = null;
  }
  selectedRoom = null;
});

function renderSelectedRoomLogs() {
  const listEl = document.getElementById('panel-logs-list');
  const clearBtn = document.getElementById('panel-clear-history-btn');

  if (selectedRoomLogs.length === 0) {
    listEl.innerHTML = `<div class="py-20 text-center text-slate-300 font-bold uppercase tracking-widest text-xs">No history found</div>`;
    clearBtn.classList.add('hidden');
    return;
  }

  clearBtn.classList.remove('hidden');

  listEl.innerHTML = selectedRoomLogs.map((log, i) => {
    let iconClass = '';
    let iconHtml = '';
    let title = '';
    let desc = '';

    if (log.type === 'check-in') {
      iconClass = 'bg-indigo-600 text-white';
      iconHtml = '<i data-lucide="user" class="w-3.5 h-3.5"></i>';
      title = 'Check-In';
      desc = `Guest: ${log.guestName || 'ไม่ระบุชื่อ'}`;
    } else if (log.type === 'check-out') {
      iconClass = 'bg-rose-600 text-white';
      iconHtml = '<i data-lucide="x" class="w-3.5 h-3.5"></i>';
      title = 'Check-Out';
      desc = `Guest: ${log.guestName || 'ไม่ระบุชื่อ'} Left`;
    } else {
      iconClass = 'bg-emerald-600 text-white';
      iconHtml = '<i data-lucide="check" class="w-3.5 h-3.5"></i>';
      title = 'Cleaned';
      desc = 'Room sanitized';
    }

    const spacerLine = i !== selectedRoomLogs.length - 1 
      ? `<div class="absolute left-[11px] top-6 bottom-[-16px] w-[2px] bg-slate-100 group-hover:bg-slate-200 transition-colors"></div>`
      : '';

    return `
      <div class="flex gap-4 relative group">
        ${spacerLine}
        <div class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10 ${iconClass}">
          ${iconHtml}
        </div>
        <div class="flex-1 space-y-1">
          <div class="flex justify-between items-center">
            <span class="text-[11px] font-black uppercase text-slate-900">${title}</span>
            <span class="text-[9px] font-bold text-slate-400">${formatDateThai(log.timestamp)}</span>
          </div>
          <p class="text-xs font-bold text-slate-500">${desc}</p>
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

// Clear history action trigger
const clearHistoryBtn = document.getElementById('panel-clear-history-btn');
const inputConfirmWrap = document.getElementById('panel-password-confirm');
const passwordInput = document.getElementById('panel-password-input');
const errorPassMsg = document.getElementById('panel-password-error');

clearHistoryBtn.addEventListener('click', () => {
  inputConfirmWrap.classList.remove('hidden');
  passwordInput.value = '';
  passwordInput.focus();
  errorPassMsg.classList.add('hidden');
});

document.getElementById('panel-password-cancel').addEventListener('click', () => {
  inputConfirmWrap.classList.add('hidden');
  passwordInput.value = '';
});

const submitClearHistory = async () => {
  const pwd = passwordInput.value;
  if (pwd !== '1234') {
    errorPassMsg.classList.remove('hidden');
    return;
  }
  
  try {
    errorPassMsg.classList.add('hidden');
    
    // Fetch logs of this room
    const q = query(collection(db, 'logs'), where('roomId', '==', selectedRoom.id));
    const snap = await getDocs(q);
    
    const batch = writeBatch(db);
    snap.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    inputConfirmWrap.classList.add('hidden');
    passwordInput.value = '';
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการลบ');
  }
};

document.getElementById('panel-password-submit').addEventListener('click', submitClearHistory);
passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitClearHistory();
});

// --- SETTINGS / SETUP CONTROLS ---
let baseUrl = '';

function renderSetupView() {
  // Read current shared options origins
  const currentOrigin = window.location.origin;
  const isDev = currentOrigin.includes('-dev-');
  const sharedOrigin = isDev ? currentOrigin.replace('-dev-', '-pre-') : currentOrigin;
  
  baseUrl = sharedOrigin;
  document.getElementById('setup-url-input').value = sharedOrigin;
  
  // Show base instruction dev warnings
  const banner = document.getElementById('setup-instructions-banner');
  const instructionsPanel = document.getElementById('setup-instructions-panel');
  
  if (isDev) {
    banner.classList.remove('hidden');
    document.getElementById('setup-url-warning').classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
    document.getElementById('setup-url-warning').classList.add('hidden');
  }

  banner.addEventListener('click', () => {
    instructionsPanel.classList.remove('hidden');
  });

  document.getElementById('setup-instructions-close').addEventListener('click', () => {
    instructionsPanel.classList.add('hidden');
  });

  // URL input edits trigger QR Card updates
  document.getElementById('setup-url-input').addEventListener('input', (e) => {
    baseUrl = e.target.value.trim();
    renderSetupRoomsGrid();
  });

  renderSetupRoomsGrid();
}

function renderSetupRoomsGrid() {
  const container = document.getElementById('setup-rooms-grid');
  const seedBtn = document.getElementById('setup-seed-btn');
  const copyBtn = document.getElementById('setup-copy-btn');

  // If no rooms exist, we show the seed button.
  // We determine if target rooms exist exactly
  const seedMatches = TARGET_ROOMS.length === rooms.length && 
                      TARGET_ROOMS.every(t => rooms.some(r => r.id === t.id));

  if (!seedMatches) {
    container.innerHTML = `
      <div class="col-span-full py-16 text-center border-2 border-dashed border-slate-200 rounded-[2rem]">
        <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
          <i data-lucide="refresh-cw" class="w-8 h-8"></i>
        </div>
        <h4 class="text-lg font-black text-slate-800">โปรเจกต์ใหม่?</h4>
        <p class="text-slate-500 font-bold text-xs mt-1">กรุณากดปุ่ม "เริ่มใช้งาน 4 ห้อง" ด้านบนเพื่อเตรียมข้อมูลเข้าฐานข้อมูล</p>
      </div>
    `;
    seedBtn.classList.remove('hidden');
    copyBtn.classList.add('hidden');
    lucide.createIcons();
    return;
  }

  seedBtn.classList.add('hidden');
  copyBtn.classList.remove('hidden');

  container.innerHTML = rooms.map(room => {
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const qrUrl = `${cleanBase}/?room=${room.id}`;
    const apiSrc = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrUrl)}`;

    return `
      <div class="relative flex flex-col items-center gap-6 rounded-[2rem] border border-slate-100 bg-white p-8 shadow-xl shadow-slate-200/50 transition-all hover:translate-y-[-4px]">
        <div class="w-full text-center">
          <div class="w-full text-center text-2xl font-black text-slate-900 py-2">
            ${room.name || room.id}
          </div>
        </div>
        <div class="rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6">
          <div class="bg-white p-3 rounded-lg border border-slate-100 shadow-sm overflow-hidden flex items-center justify-center min-w-[160px] min-h-[160px]">
             <img src="${apiSrc}" class="w-40 h-40 object-cover" alt="QR Code" crossorigin="anonymous" />
           </div>
        </div>
        <div class="flex w-full gap-3">
          <button
            data-room-id="${room.id}"
            class="setup-test-btn flex flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 text-sm font-black text-slate-700 transition-colors hover:bg-slate-200 active-scale"
          >
            <i data-lucide="external-link" class="w-[18px] h-[18px]"></i>
            ทดสอบ
          </button>
          <button
            data-room-name="${room.name}"
            data-room-id="${room.id}"
            class="setup-download-btn flex items-center justify-center rounded-2xl bg-indigo-600 px-5 text-white transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-100 active-scale"
          >
            <i data-lucide="download" class="w-5 h-5"></i>
          </button>
        </div>
        <div class="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 break-all px-4">
          Scan to Check-In / Out
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();

  // Button hooks
  document.querySelectorAll('.setup-test-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-room-id');
      navigateTo('guest', id);
    });
  });

  document.querySelectorAll('.setup-download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-room-id');
      const name = btn.getAttribute('data-room-name');
      downloadQR(id, name);
    });
  });
}

// Download action with API Fetch
const downloadQR = async (roomId, roomName) => {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const qrUrl = `${cleanBase}/?room=${roomId}`;
  const apiSrc = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(qrUrl)}`;
  
  try {
    const res = await fetch(apiSrc);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `QR-${roomName}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.warn("Direct blob download CORS restricted, opening image in new window fallback.");
    window.open(apiSrc, '_blank');
  }
};

// Clipboard copying base URL helper
document.getElementById('setup-copy-btn').addEventListener('click', () => {
  if (!baseUrl.startsWith('http')) {
    alert('กรุณาวางลิงก์ที่ถูกต้องจากปุ่ม Share ก่อนครับ');
    return;
  }
  navigator.clipboard.writeText(baseUrl);
  alert('คัดลอกลิงก์เรียบร้อย! คุณสามารถนำลิงก์นี้ไปส่งให้ลูกค้าได้');
});

// Seed rooms button
const seedBtn = document.getElementById('setup-seed-btn');
const seedIcon = document.getElementById('seed-sync-icon');
const seedText = document.getElementById('seed-btn-text');

seedBtn.addEventListener('click', async () => {
  seedBtn.disabled = true;
  seedIcon.classList.add('animate-spin');
  seedText.innerText = 'กำลังติดตั้ง...';
  
  try {
    // 1. Clear ALL rooms
    const roomsSnapshot = await getDocs(collection(db, 'rooms'));
    const batch = writeBatch(db);
    roomsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // 2. Clear ALL activity logs
    const logsSnapshot = await getDocs(collection(db, 'logs'));
    logsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    // 3. Write target rooms
    for (const target of TARGET_ROOMS) {
      const roomData = {
        id: target.id,
        name: target.name,
        status: 'available',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'rooms', target.id), roomData);
    }

    alert('ติดตั้ง 4 ห้องพัก (211, 213, 215, 217) เรียบร้อยแล้ว!');
    renderSetupView();
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการเริ่มใช้งานฐานข้อมูล');
  } finally {
    seedBtn.disabled = false;
    seedIcon.classList.remove('animate-spin');
    seedText.innerText = 'เริ่มใช้งาน 4 ห้อง';
  }
});

// Clear all databases button
const clearAllBtn = document.getElementById('setup-clear-all');
const clearIcon = document.getElementById('clear-sync-icon');

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('ยืนยันการล้างข้อมูลทั้งหมด? (ห้องพักและกิจกรรมล่าสุดจะถูกลบออกทั้งหมด)')) return;
  
  clearAllBtn.disabled = true;
  clearIcon.classList.add('animate-spin');

  try {
    const roomsSnap = await getDocs(collection(db, 'rooms'));
    const logsSnap = await getDocs(collection(db, 'logs'));
    const batch = writeBatch(db);

    roomsSnap.docs.forEach(doc => batch.delete(doc.ref));
    logsSnap.docs.forEach(doc => batch.delete(doc.ref));

    await batch.commit();

    alert('ล้างข้อมูลทั้งหมดเรียบร้อยแล้ว!');
    renderSetupView();
  } catch (error) {
    console.error(error);
    alert('เกิดข้อผิดพลาดในการล้างข้อมูล');
  } finally {
    clearAllBtn.disabled = false;
    clearIcon.classList.remove('animate-spin');
  }
});

// --- Start the App on window load ---
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initFirebase);
} else {
  initFirebase();
}
