import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleUser, getGoogleUser, saveGoogleUser, clearGoogleUser, loadGoogleScript } from './lib/googleAuth';
import GoogleLoginModal from './components/GoogleLoginModal';
import ReservationPage from './pages/ReservationPage';
// ============================================================
// TYPES
// ============================================================
interface MenuItem {
  id: number;
  name: string;
  desc: string;
  price: string;
  img: string;
  tag: string;
}
interface Table {
  id: number;
  type: 'regular' | 'vip';
  seats: number;
  manualFull: boolean;
}
interface Reservation {
  id: string;
  name: string;
  phone: string;
  email: string;
  date: string;
  time: string;
  tableId: number;
  guests: number;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  userId?: string; // linked to logged-in user
}
interface UserAccount {
  id: any;
  name: any;
  email: any;
  avatar: any;
  provider: any;
}
interface Notification {
  id: string;
  reservationId: string;
  userId: string;
  message: string;
  type: 'approved' | 'rejected' | 'pending';
  read: boolean;
  createdAt: string;
}

// ============================================================
// CONSTANTS
// ============================================================
const INITIAL_TABLES: Table[] = [...Array.from({ length: 14 }, (_, i) => ({ id: i + 1, type: 'regular' as const, seats: 4, manualFull: false })), { id: 15, type: 'vip', seats: 6, manualFull: false }];

const MENU_ITEMS: MenuItem[] = [
  {
    id: 1,
    name: 'Gula Aren Latte',
    desc: 'Espresso lokal dengan aren asli Sulawesi, susu segar, dan es batu kristal. Rasa manis alami yang tak tertandingi.',
    price: 'Rp 35.000',
    img: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80',
    tag: 'Best Seller',
  },
  {
    id: 2,
    name: 'Signature Matcha',
    desc: 'Matcha ceremonial grade Jepang dipadukan susu oat premium. Hijau pekat, creamy, dan menenangkan jiwa.',
    price: 'Rp 38.000',
    img: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400&q=80',
    tag: 'Signature',
  },
  {
    id: 3,
    name: 'Creamy Vanilla',
    desc: 'Cold brew 18 jam, vanilla Madagascar, krim lembut di atas. Kelembutan dalam setiap tegukan.',
    price: 'Rp 32.000',
    img: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80',
    tag: 'New',
  },
];

const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
const ADMIN_PASSWORD = 'mudamudi2025';

// ============================================================
// STORAGE HELPERS — single source of truth
// ============================================================
const LS = {
  getReservations: (): Reservation[] => {
    try {
      return JSON.parse(localStorage.getItem('mm_reservations') || '[]');
    } catch {
      return [];
    }
  },
  saveReservations: (r: Reservation[]) => localStorage.setItem('mm_reservations', JSON.stringify(r)),

  // FIX: tables now use ONE key read by BOTH admin and reservation form
  getTables: (): Table[] => {
    try {
      return JSON.parse(localStorage.getItem('mm_tables_v2') || JSON.stringify(INITIAL_TABLES));
    } catch {
      return INITIAL_TABLES;
    }
  },
  saveTables: (t: Table[]) => localStorage.setItem('mm_tables_v2', JSON.stringify(t)),

  getNotifications: (): Notification[] => {
    try {
      return JSON.parse(localStorage.getItem('mm_notifications') || '[]');
    } catch {
      return [];
    }
  },
  saveNotifications: (n: Notification[]) => localStorage.setItem('mm_notifications', JSON.stringify(n)),

  getUser: (): UserAccount | null => {
    try {
      const u = localStorage.getItem('mm_user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  },
  saveUser: (u: UserAccount | null) => {
    if (u) localStorage.setItem('mm_user', JSON.stringify(u));
    else localStorage.removeItem('mm_user');
  },

  getDark: (): boolean => {
    const s = localStorage.getItem('mm_dark');
    return s ? s === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  },
  saveDark: (d: boolean) => localStorage.setItem('mm_dark', String(d)),
};

// ============================================================
// HELPERS
// ============================================================
function isTableBlocked(tableId: number, date: string, time: string): boolean {
  return LS.getReservations().some((r) => r.tableId === tableId && r.date === date && r.time === time && r.status === 'approved');
}
function isTableManualFull(tableId: number): boolean {
  // FIX: reads from same key admin writes to
  return LS.getTables().find((t) => t.id === tableId)?.manualFull ?? false;
}
function isSlotPast(date: string, time: string): boolean {
  const [h, m] = time.split(':').map(Number);
  const slotDate = new Date(date);
  slotDate.setHours(h, m, 0, 0);
  return slotDate.getTime() - Date.now() < 60 * 60 * 1000;
}
function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}
function genId(prefix: string) {
  return prefix + Date.now().toString(36).toUpperCase().slice(-6);
}

function pushNotification(userId: string, reservationId: string, type: 'approved' | 'rejected' | 'pending', name: string, date: string, time: string) {
  const msgs = {
    approved: `✅ Reservasi #${reservationId} Anda untuk ${date} pukul ${time} telah DISETUJUI! Kami menantikan kehadiran Anda.`,
    rejected: `❌ Reservasi #${reservationId} Anda untuk ${date} pukul ${time} DITOLAK. Silakan pilih waktu atau meja lain.`,
    pending: `🕐 Reservasi #${reservationId} Anda untuk ${date} pukul ${time} sedang menunggu konfirmasi admin.`,
  };
  const notif: Notification = {
    id: genId('N'),
    reservationId,
    userId,
    message: msgs[type],
    type,
    read: false,
    createdAt: new Date().toISOString(),
  };
  LS.saveNotifications([notif, ...LS.getNotifications()]);
}

// ============================================================
// MOCK GOOGLE LOGIN — realistic UI, no real OAuth needed
// ============================================================
const MOCK_GOOGLE_USERS: UserAccount[] = [
  { id: 'google_001', name: 'Andi Wijaya', email: 'andi.wijaya@gmail.com', avatar: 'AW', provider: 'google' },
  { id: 'google_002', name: 'Sari Dewi', email: 'sari.dewi@gmail.com', avatar: 'SD', provider: 'google' },
  { id: 'google_003', name: 'Budi Santoso', email: 'budi.santoso@gmail.com', avatar: 'BS', provider: 'google' },
];

// ============================================================
// DARK MODE HOOK
// ============================================================
function useDarkMode() {
  const [dark, setDark] = useState(LS.getDark);
  useEffect(() => {
    LS.saveDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return [dark, setDark] as const;
}

// ============================================================
// ICONS
// ============================================================
const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);
const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);
const BellIcon = ({ count }: { count: number }) => (
  <div style={{ position: 'relative' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
    {count > 0 && (
      <span
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          minWidth: 16,
          height: 16,
          borderRadius: 8,
          background: '#e74c3c',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 4px',
          fontFamily: "'Montserrat',sans-serif",
        }}
      >
        {count > 9 ? '9+' : count}
      </span>
    )}
  </div>
);
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

// ============================================================
// TOAST NOTIFICATION
// ============================================================
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [onClose]);
  const colors = { success: '#27ae60', error: '#e74c3c', info: '#3498db' };
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 9999,
        maxWidth: 380,
        padding: '16px 20px',
        background: colors[type],
        color: '#fff',
        borderRadius: 4,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        fontFamily: "'Montserrat',sans-serif",
        fontSize: 13,
        lineHeight: 1.5,
        animation: 'slideUp 0.3s ease',
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0 }}>
        ×
      </button>
    </div>
  );
}

// ============================================================
// NOTIFICATION PANEL
// ============================================================
function NotificationPanel({ dark, userId, onClose }: { dark: boolean; userId: string; onClose: () => void }) {
  const [notifs, setNotifs] = useState<Notification[]>(() => LS.getNotifications().filter((n) => n.userId === userId));

  const markAllRead = () => {
    const all = LS.getNotifications().map((n) => (n.userId === userId ? { ...n, read: true } : n));
    LS.saveNotifications(all);
    setNotifs(all.filter((n) => n.userId === userId));
  };

  const typeColor = (t: string) => (t === 'approved' ? '#27ae60' : t === 'rejected' ? '#e74c3c' : '#f39c12');

  return (
    <div
      style={{
        position: 'fixed',
        top: 72,
        right: 16,
        zIndex: 2000,
        width: 340,
        maxHeight: 480,
        background: dark ? '#1e1e1e' : '#fff',
        border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        borderRadius: 8,
        boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 16, color: dark ? '#F8F9FA' : '#212529' }}>Notifikasi</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {notifs.some((n) => !n.read) && (
            <button onClick={markAllRead} style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: '#3498db', background: 'none', border: 'none', cursor: 'pointer' }}>
              Tandai semua dibaca
            </button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>
            ×
          </button>
        </div>
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {notifs.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', fontFamily: "'Montserrat',sans-serif", fontSize: 13 }}>Belum ada notifikasi.</div>
        ) : (
          notifs.map((n) => (
            <div
              key={n.id}
              style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                background: n.read ? 'transparent' : dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: typeColor(n.type), marginTop: 5, flexShrink: 0, opacity: n.read ? 0.3 : 1 }} />
              <div>
                <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, lineHeight: 1.6, color: dark ? (n.read ? 'rgba(248,249,250,0.45)' : 'rgba(248,249,250,0.85)') : n.read ? 'rgba(33,37,41,0.45)' : 'rgba(33,37,41,0.85)' }}>
                  {n.message}
                </p>
                <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, color: dark ? 'rgba(248,249,250,0.25)' : 'rgba(33,37,41,0.25)', marginTop: 4 }}>{new Date(n.createdAt).toLocaleString('id-ID')}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ============================================================
// HEADER
// ============================================================
function Header({
  dark,
  setDark,
  page,
  setPage,
  user,
  onUserLogin,
  onUserLogout,
  handleReservasiClick,
}: {
  dark: boolean;
  setDark: (v: boolean) => void;
  page: any;
  setPage: (p: any) => void;
  user: any;
  onUserLogin?: (u: any) => void;
  onUserLogout?: () => void;
  handleReservasiClick: () => void;
}) {
  // Isi fungsi header kamu... {
  const [scrolled, setScrolled] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const unreadCount = user ? LS.getNotifications().filter((n) => n.userId === user.id && !n.read).length : 0;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler);
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  const navLinks = [
    { label: 'Beranda', id: 'hero' },
    { label: 'Tentang', id: 'about' },
    { label: 'Menu', id: 'menu' },
    { label: 'Reservasi', id: 'reservation' },
  ];

  const btnStyle = (active = false): React.CSSProperties => ({
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: `1px solid ${active ? (dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)') : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
    background: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: dark ? '#F8F9FA' : '#212529',
    transition: 'all 0.2s',
    position: 'relative',
  });

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          transition: 'all 0.3s',
          backdropFilter: scrolled ? 'blur(16px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none',
          backgroundColor: scrolled ? (dark ? 'rgba(18,18,18,0.88)' : 'rgba(248,249,250,0.88)') : 'transparent',
          borderBottom: scrolled ? `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}` : '1px solid transparent',
        }}
      >
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px', height: 72, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* LOGO */}
          <button onClick={() => (page === 'home' ? scrollTo('hero') : setPage('home'))} style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {/* Ikon cangkir kopi estetik */}

           <svg width="38" height="38" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
  {/* Gelas */}
  <path d="M18 14 L15 50 Q15 54 30 54 Q45 54 45 50 L42 14 Z"
    fill={dark ? 'rgba(201,168,76,0.08)' : 'rgba(139,90,43,0.07)'}
    stroke={dark ? 'rgba(201,168,76,0.75)' : 'rgba(139,90,43,0.7)'}
    strokeWidth="1.4" strokeLinejoin="round"/>
  {/* Sedotan */}
  <line x1="35" y1="8" x2="28" y2="50"
    stroke={dark ? '#C9A84C' : '#7A4E20'}
    strokeWidth="2" strokeLinecap="round"/>
  {/* Gelembung boba */}
  <circle cx="22" cy="44" r="3"
    fill={dark ? 'rgba(201,168,76,0.55)' : 'rgba(139,90,43,0.5)'}/>
  <circle cx="30" cy="47" r="3"
    fill={dark ? 'rgba(201,168,76,0.55)' : 'rgba(139,90,43,0.5)'}/>
  <circle cx="38" cy="44" r="3"
    fill={dark ? 'rgba(201,168,76,0.55)' : 'rgba(139,90,43,0.5)'}/>
  {/* Minuman dalam gelas */}
  <path d="M19.5 36 Q19 44 30 44 Q41 44 40.5 36 Z"
    fill={dark ? 'rgba(201,168,76,0.2)' : 'rgba(139,90,43,0.15)'}/>
  {/* Tutup gelas */}
  <path d="M16 14 Q16 11 30 11 Q44 11 44 14 L42 14 Q42 12.5 30 12.5 Q18 12.5 18 14 Z"
    fill={dark ? 'rgba(201,168,76,0.5)' : 'rgba(139,90,43,0.45)'}/>
  {/* Uap */}
  <path d="M26 8 Q27.5 5 26 2" stroke={dark ? 'rgba(201,168,76,0.4)' : 'rgba(139,90,43,0.35)'}
    strokeWidth="1.2" fill="none" strokeLinecap="round"/>
  <path d="M30 7 Q31.5 4 30 1" stroke={dark ? 'rgba(201,168,76,0.4)' : 'rgba(139,90,43,0.35)'}
    strokeWidth="1.2" fill="none" strokeLinecap="round"/>
</svg>
          </button>

          {/* Duplicate nav removed — using the nav below */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            {/* MENU NAVIGASI */}
            {page === 'home' &&
              navLinks.map((l: any) => (
                <button
                  key={l.id}
                  onClick={() => (l.id === 'reservation' ? handleReservasiClick() : scrollTo(l.id))}
                  style={{
                    fontFamily: "'Montserrat',sans-serif",
                    fontWeight: 500,
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: dark ? 'rgba(248,249,250,0.65)' : 'rgba(33,37,41,0.65)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'color 0.2s',
                  }}
                >
                  {l.label}
                </button>
              ))}
            {/* TOMBOL ADMIN */}
            <button
              onClick={() => setPage('admin-login')}
              style={{
                fontFamily: "'Montserrat',sans-serif",
                fontWeight: 500,
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: dark ? 'rgba(248,249,250,0.35)' : 'rgba(33,37,41,0.35)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Admin
            </button>

            {/* IKON KANAN (NOTIF & DARK MODE) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {user && (
                <button
                  style={btnStyle(showNotif)}
                  onClick={() => {
                    setShowNotif(!showNotif);
                    setShowUserMenu(false);
                  }}
                >
                  <BellIcon count={unreadCount} />
                </button>
              )}
              <button style={btnStyle()} onClick={() => setDark(!dark)}>
                {dark ? <SunIcon /> : <MoonIcon />}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* MODAL & PANEL */}
      {showNotif && user && <NotificationPanel dark={dark} userId={user.id} onClose={() => setShowNotif(false)} />}
      {showLogin && (
        <GoogleLoginModal
          dark={dark}
          onSuccess={(u) => {
            onUserLogin && onUserLogin(u as any);
            setShowLogin(false);
          }}
          onClose={() => setShowLogin(false)}
        />
      )}
    </>
  );
}

// ============================================================
// HERO
// ============================================================

function Hero({ dark, setSection, onReservasiClick }: { dark: boolean; setSection: (s: string) => void; onReservasiClick: () => void }) {
  return (
    <section
      id="hero"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 120,
        paddingBottom: 80,
        paddingLeft: 24,
        paddingRight: 24,
        position: 'relative',
        overflow: 'hidden',
        // Dark: hitam kaya dengan lapisan warna amber/cokelat espresso
        // Light: krem hangat dengan sentuhan linen
        backgroundImage: `url("https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1600&q=85")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* Overlay gelap di atas foto */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: dark ? 'linear-gradient(135deg, rgba(5,3,1,0.82) 0%, rgba(15,8,2,0.75) 50%, rgba(8,5,1,0.85) 100%)' : 'linear-gradient(135deg, rgba(5,3,1,0.65) 0%, rgba(20,10,3,0.6) 50%, rgba(5,3,1,0.7) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Glow accent — kiri bawah */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: dark ? 'radial-gradient(circle, rgba(180,120,40,0.12) 0%, transparent 65%)' : 'radial-gradient(circle, rgba(180,120,40,0.18) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
      {/* Glow accent — kanan atas */}
      <div
        style={{
          position: 'absolute',
          top: '-5%',
          right: '-8%',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: dark ? 'radial-gradient(circle, rgba(60,35,10,0.6) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(230,200,150,0.35) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      {/* Garis dekoratif tipis */}
      <div
        style={{
          position: 'absolute',
          top: '18%',
          left: '6%',
          width: 1,
          height: 160,
          background: dark ? 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.25), transparent)' : 'linear-gradient(to bottom, transparent, rgba(139,90,43,0.2), transparent)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '18%',
          right: '6%',
          width: 1,
          height: 160,
          background: dark ? 'linear-gradient(to bottom, transparent, rgba(201,168,76,0.25), transparent)' : 'linear-gradient(to bottom, transparent, rgba(139,90,43,0.2), transparent)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 720, textAlign: 'center', position: 'relative' }}>
        <p
          style={{
            fontFamily: "'Montserrat',sans-serif",
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            color: dark ? 'rgba(201,168,76,0.7)' : 'rgba(255,235,180,0.95)',
            marginBottom: 28,
          }}
        >
          &nbsp; Palattae, Sulawesi Selatan &nbsp;
        </p>

        <h1
          style={{
            fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 'clamp(38px, 6.5vw, 76px)',
            lineHeight: 1.1,
            letterSpacing: '-1.5px',
            marginBottom: 22,
            color: dark ? '#E8D5A3' : '#F5E6C0',
          }}
        >
          Muda Mudi Menyeduh Cerita dalam Setiap Tegukan
        </h1>

        <p
          style={{
            fontFamily: "'Montserrat',sans-serif",
            fontWeight: 400,
            fontSize: 15,
            color: dark ? 'rgba(232,210,160,0.6)' : 'rgba(245,225,175,0.85)',
            marginBottom: 48,
            lineHeight: 1.8,
            letterSpacing: '0.02em',
          }}
        >
          Tentang bahan lokal terbaik.
        </p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          {/* Tombol primer */}
          <button
            onClick={() => document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '15px 36px',
              background: dark ? 'linear-gradient(135deg, #C9A84C, #A07830)' : 'linear-gradient(135deg, #5C3D1E, #3D2008)',
              color: dark ? '#0A0A0A' : '#FDFAF5',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
              boxShadow: dark ? '0 4px 24px rgba(201,168,76,0.25)' : '0 4px 24px rgba(92,61,30,0.2)',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = dark ? '0 8px 32px rgba(201,168,76,0.4)' : '0 8px 32px rgba(92,61,30,0.3)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = dark ? '0 4px 24px rgba(201,168,76,0.25)' : '0 4px 24px rgba(92,61,30,0.2)';
            }}
          >
            Lihat Menu
          </button>

          {/* Tombol sekunder */}
          <button
            onClick={onReservasiClick}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              padding: '15px 36px',
              background: 'transparent',
              color: dark ? 'rgba(232,210,160,0.85)' : 'rgba(255,240,200,0.95)',
              border: `1.5px solid ${dark ? 'rgba(201,168,76,0.35)' : 'rgba(92,61,30,0.3)'}`,
              borderRadius: 2,
              cursor: 'pointer',
              transition: 'all 0.25s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = dark ? 'rgba(201,168,76,0.7)' : 'rgba(92,61,30,0.6)';
              el.style.color = dark ? '#E8C96A' : '#3D2008';
              el.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = dark ? 'rgba(201,168,76,0.35)' : 'rgba(92,61,30,0.3)';
              el.style.color = dark ? 'rgba(232,210,160,0.85)' : 'rgba(92,61,30,0.8)';
              el.style.transform = 'translateY(0)';
            }}
          >
            Reservasi Meja
          </button>
        </div>

        <div style={{ marginTop: 80, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: 0.4 }}></div>
      </div>
    </section>
  );
}

// ============================================================
// ABOUT
// ============================================================
function About({ dark }: { dark: boolean }) {
  return (
    <section
      id="about"
      style={{
        padding: '100px 24px',
        background: dark ? 'linear-gradient(180deg, #0F0A04 0%, #111111 100%)' : 'linear-gradient(180deg, #F7F0E4 0%, #FDFAF5 100%)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 72, alignItems: 'center' }}>
        <div>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 500, fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: dark ? 'rgba(248,249,250,0.4)' : 'rgba(33,37,41,0.4)', marginBottom: 18 }}>
            Tentang Kami
          </p>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 'clamp(26px,3.5vw,42px)', lineHeight: 1.2, color: dark ? '#F8F9FA' : '#212529', marginBottom: 24, letterSpacing: '-0.5px' }}>
            Harmoni dalam Segelas Minuman.
          </h2>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 400, fontSize: 14, lineHeight: 1.9, color: dark ? 'rgba(248,249,250,0.6)' : 'rgba(33,37,41,0.6)' }}>
            Di Muda Mudi, impian kami adalah menghadirkan harmoni dalam segelas minuman berkualitas tinggi. Dibuat dengan bahan-bahan lokal terbaik dan penuh kesegaran, kami mendedikasikan setiap racikan untuk para penikmat rasa di seluruh
            penjuru negeri membawa semangat muda dan kehangatan mudi ke dunia.
          </p>
       
        </div>
        <div style={{ position: 'relative' }}>
          <img src="/tentang.jpeg" alt="Muda Mudi Café" style={{ width: '100%', height: 460, objectFit: 'cover', borderRadius: 4 }} />
        </div>
      </div>
    </section>
  );
}

// ============================================================
// MENU
// ============================================================
function Menu({ dark }: { dark: boolean }) {
  const accent = dark ? '#C9A84C' : '#B8860B';
  const textMain = dark ? '#F5ECD9' : '#1A0A00';
  const textMuted = dark ? 'rgba(232,210,160,0.55)' : 'rgba(60,35,10,0.55)';
  const borderColor = dark ? 'rgba(201,168,76,0.12)' : 'rgba(122,78,32,0.1)';

  const menuItems = [
    {
      id: 1,
      tag: 'COFFEE-BASED DRINKS',
      name: 'Minuman Berbasis Kopi',
      desc: 'Dari minuman tradisional berbasis espresso sampai berbagai minuman racikan kopi terkini.',
      img: '/coffe.jpg',
    },
    {
      id: 2,
      tag: 'NON-COFFEE',
      name: 'Minuman Non-Kopi',
      desc: 'Kami juga memiliki menu non-coffee untuk kamu yang ingin pilihan lain selain kopi dan untuk anak-anak.',
      img: '/minuman1.jpg',
    },
    {
      id: 3,
      tag: 'SNACK',
      name: 'Makanan & Camilan',
      desc: 'Berbagai macam snack ringan siap menemani secangkir kopimu.',
      img: 'snack.jpg',
    },
  ];

  return (
    <section
      id="menu"
      style={{
        padding: '100px 0',
        background: dark ? 'linear-gradient(180deg, #111111 0%, #0D0A05 100%)' : 'linear-gradient(180deg, #FDFAF5 0%, #F5ECD9 100%)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: accent,
              marginBottom: 16,
            }}
          >
            PILIHAN KAMI
          </p>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 'clamp(36px, 5vw, 64px)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: dark ? 'rgba(245,236,217,0.15)' : 'rgba(26,10,0,0.12)',
              lineHeight: 1,
            }}
          >
            OUR MENU
          </h2>
          {/* Garis emas di bawah judul */}
          <div
            style={{
              width: 60,
              height: 3,
              margin: '16px auto 0',
              background: `linear-gradient(to right, transparent, ${accent}, transparent)`,
              borderRadius: 2,
            }}
          />
        </div>

        {/* 3 Menu Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {menuItems.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                cursor: 'default',
                transition: 'transform 0.3s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {/* Foto */}
              <div
                style={{
                  width: '100%',
                  height: 260,
                  overflow: 'hidden',
                  borderRadius: 4,
                  boxShadow: dark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(92,61,30,0.15)',
                  marginBottom: 24,
                }}
              >
                <img
                  src={item.img}
                  alt={item.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.5s' }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLImageElement).style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLImageElement).style.transform = 'scale(1)';
                  }}
                />
              </div>
              {/* Tag */}
              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: textMain,
                  marginBottom: 10,
                  textAlign: 'center',
                }}
              >
                {item.tag}
              </p>
              {/* Divider */}
              <div style={{ width: 32, height: 2, background: accent, marginBottom: 12, borderRadius: 1 }} />
              {/* Deskripsi */}
              <p
                style={{
                  fontFamily: "'Montserrat', sans-serif",
                  fontSize: 13,
                  lineHeight: 1.8,
                  color: textMuted,
                  textAlign: 'center',
                }}
              >
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// RESERVATION FORM
// ============================================================
function ReservationSection({ dark, user, onNeedLogin }: { dark: boolean; user: UserAccount | null; onNeedLogin: () => void }) {
  const emptyForm = { name: user?.name ?? '', phone: '', email: user?.email ?? '', date: '', time: '', tableId: 0, guests: 2, notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [refId, setRefId] = useState('');

  // Sync name/email when user logs in
  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, email: f.email || user.email }));
  }, [user]);

  // FIX: reads unified mm_tables_v2 key — same as admin writes to
  const tables = LS.getTables();

  const isAvailable = (t: Table) => {
    if (!form.date || !form.time) return true;
    if (t.manualFull) return false; // ← NOW reads from localStorage correctly
    if (isTableBlocked(t.id, form.date, form.time)) return false;
    if (form.guests > t.seats) return false;
    return true;
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Nama wajib diisi.';
    if (!form.phone.trim()) e.phone = 'Nomor HP wajib diisi.';
    if (!form.email.trim() || !form.email.includes('@')) e.email = 'Email tidak valid.';
    if (!form.date) e.date = 'Pilih tanggal.';
    if (!form.time) e.time = 'Pilih jam.';
    if (form.date && form.time && isSlotPast(form.date, form.time)) e.time = 'Minimal reservasi H-1 jam dari sekarang.';
    if (!form.tableId) e.tableId = 'Pilih meja terlebih dahulu.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!user) {
      onNeedLogin();
      return;
    }
    if (!validate()) return;
    const id = genId('MM');
    const newRes: Reservation = { id, ...form, status: 'pending', createdAt: new Date().toISOString(), userId: user.id };
    LS.saveReservations([...LS.getReservations(), newRes]);
    pushNotification(user.id, id, 'pending', form.name, form.date, form.time);
    setRefId(id);
    setSubmitted(true);
  };

  const inputS: React.CSSProperties = {
    fontFamily: "'Montserrat',sans-serif",
    fontSize: 13,
    padding: '11px 13px',
    background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    borderRadius: 2,
    color: dark ? '#F8F9FA' : '#212529',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelS: React.CSSProperties = {
    fontFamily: "'Montserrat',sans-serif",
    fontWeight: 600,
    fontSize: 10,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: dark ? 'rgba(248,249,250,0.55)' : 'rgba(33,37,41,0.55)',
    display: 'block',
    marginBottom: 5,
  };
  const errS: React.CSSProperties = { color: '#e74c3c', fontSize: 11, marginTop: 3 };

  if (submitted)
    return (
      <section id="reservation" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: dark ? 'rgba(39,174,96,0.15)' : 'rgba(39,174,96,0.1)',
              border: '2px solid rgba(39,174,96,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
              fontSize: 24,
            }}
          >
            ✓
          </div>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 30, color: dark ? '#F8F9FA' : '#212529', marginBottom: 12 }}>Reservasi Terkirim!</h2>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, color: dark ? 'rgba(248,249,250,0.55)' : 'rgba(33,37,41,0.55)', lineHeight: 1.7, marginBottom: 8 }}>
            Kode referensi: <strong style={{ color: dark ? '#F8F9FA' : '#212529' }}>#{refId}</strong>
          </p>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, color: dark ? 'rgba(248,249,250,0.55)' : 'rgba(33,37,41,0.55)', lineHeight: 1.7, marginBottom: 28 }}>
            🔔 Kami akan mengirimkan notifikasi ke akun Anda saat admin memproses reservasi ini. Pantau di ikon lonceng di pojok kanan atas.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setForm({ ...emptyForm, name: user?.name ?? '', email: user?.email ?? '' });
            }}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '12px 28px',
              background: dark ? '#F8F9FA' : '#212529',
              color: dark ? '#212529' : '#F8F9FA',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Buat Reservasi Lain
          </button>
        </div>
      </section>
    );

  return (
    <section id="reservation" style={{ padding: '100px 24px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 500, fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase', color: dark ? 'rgba(248,249,250,0.4)' : 'rgba(33,37,41,0.4)', marginBottom: 14 }}>
          Pesan Tempat
        </p>
        <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 'clamp(26px,3.5vw,42px)', color: dark ? '#F8F9FA' : '#212529', letterSpacing: '-0.5px', marginBottom: user ? 36 : 16 }}>Reservasi Meja</h2>

        {/* Login prompt banner */}
        {!user && (
          <div
            style={{ padding: '14px 16px', background: dark ? 'rgba(52,152,219,0.1)' : 'rgba(52,152,219,0.08)', border: `1px solid rgba(52,152,219,0.25)`, borderRadius: 4, marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <span style={{ fontSize: 18 }}>🔔</span>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, color: dark ? 'rgba(248,249,250,0.75)' : 'rgba(33,37,41,0.75)', lineHeight: 1.5, flex: 1 }}>
              <button onClick={onNeedLogin} style={{ fontWeight: 700, color: '#3498db', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}>
                Masuk dengan Google
              </button>{' '}
              agar kami bisa mengirimkan notifikasi saat reservasi Anda diproses.
            </p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelS}>Nama Lengkap</label>
              <input style={inputS} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Budi Santoso" />
              {errors.name && <p style={errS}>{errors.name}</p>}
            </div>
            <div>
              <label style={labelS}>No. Telepon</label>
              <input style={inputS} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" />
              {errors.phone && <p style={errS}>{errors.phone}</p>}
            </div>
          </div>
          <div>
            <label style={labelS}>Email</label>
            <input style={inputS} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@contoh.com" />
            {errors.email && <p style={errS}>{errors.email}</p>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelS}>Tanggal</label>
              <input style={inputS} type="date" min={getTodayStr()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value, tableId: 0 })} />
              {errors.date && <p style={errS}>{errors.date}</p>}
            </div>
            <div>
              <label style={labelS}>Jam</label>
              <select style={inputS} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value, tableId: 0 })}>
                <option value="">-- Pilih --</option>
                {TIME_SLOTS.map((t) => {
                  const past = form.date ? isSlotPast(form.date, t) : false;
                  return (
                    <option key={t} value={t} disabled={past}>
                      {t}
                      {past ? ' (lewat)' : ''}
                    </option>
                  );
                })}
              </select>
              {errors.time && <p style={errS}>{errors.time}</p>}
            </div>
            <div>
              <label style={labelS}>Tamu</label>
              <select style={inputS} value={form.guests} onChange={(e) => setForm({ ...form, guests: +e.target.value, tableId: 0 })}>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} orang
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TABLE PICKER */}
          <div>
            <label style={labelS}>
              Pilih Meja
              {form.date && form.time && <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— {tables.filter((t) => isAvailable(t)).length} tersedia</span>}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 7 }}>
              {tables.map((t) => {
                const avail = isAvailable(t);
                const sel = form.tableId === t.id;
                const fullManual = t.manualFull; // show reason
                const fullByRes = form.date && form.time && isTableBlocked(t.id, form.date, form.time);
                return (
                  <button
                    key={t.id}
                    disabled={!avail}
                    onClick={() => setForm({ ...form, tableId: t.id })}
                    title={fullManual ? 'Ditandai Full oleh Admin' : fullByRes ? 'Sudah dipesan' : t.type === 'vip' ? 'Meja VIP (6 kursi)' : `Meja ${t.id} (4 kursi)`}
                    style={{
                      fontFamily: "'Montserrat',sans-serif",
                      fontWeight: sel ? 700 : 500,
                      fontSize: 11,
                      padding: '9px 4px',
                      border: sel ? `2px solid ${dark ? '#F8F9FA' : '#212529'}` : `1px solid ${!avail ? (dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)') : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                      borderRadius: 2,
                      background: sel ? (dark ? '#F8F9FA' : '#212529') : !avail ? (dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)') : 'transparent',
                      color: sel ? (dark ? '#212529' : '#F8F9FA') : !avail ? (dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)') : dark ? '#F8F9FA' : '#212529',
                      cursor: !avail ? 'not-allowed' : 'pointer',
                      textDecoration: !avail ? 'line-through' : 'none',
                      position: 'relative',
                    }}
                  >
                    {t.type === 'vip' ? 'VIP' : `M${t.id}`}
                    <br />
                    <span style={{ fontSize: 9, opacity: 0.65 }}>{t.seats}⚬</span>
                    {fullManual && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: '#e74c3c', border: `1px solid ${dark ? '#121212' : '#F8F9FA'}` }} title="Full (Admin)" />}
                  </button>
                );
              })}
            </div>
            {errors.tableId && <p style={errS}>{errors.tableId}</p>}
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, color: dark ? 'rgba(248,249,250,0.3)' : 'rgba(33,37,41,0.3)', marginTop: 6 }}>
              🔴 = Meja ditandai Full oleh Admin &nbsp;|&nbsp; ~~coret~~ = Sudah dipesan / kapasitas kurang
            </p>
          </div>

          <div>
            <label style={labelS}>Catatan Khusus (opsional)</label>
            <textarea style={{ ...inputS, height: 76, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ulang tahun, alergi makanan, preferensi tempat duduk..." />
          </div>

          <button
            onClick={handleSubmit}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '15px',
              background: dark ? '#F8F9FA' : '#212529',
              color: dark ? '#212529' : '#F8F9FA',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            {user ? 'Kirim Reservasi' : 'Masuk & Reservasi'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// MY RESERVATIONS PAGE
// ============================================================
function MyReservations({ dark, user, onBack }: { dark: boolean; user: any; onBack: () => void }) {
  const reservations = LS.getReservations()
    .filter((r) => r.userId === user.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const statusColor = (s: string) => (s === 'approved' ? '#27ae60' : s === 'rejected' ? '#e74c3c' : '#f39c12');
  const statusLabel = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

  return (
    <div style={{ minHeight: '100vh', padding: '100px 24px 60px' }}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <button
          onClick={onBack}
          style={{
            fontFamily: "'Montserrat',sans-serif",
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          ← Kembali
        </button>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 28, color: dark ? '#F8F9FA' : '#212529', marginBottom: 6 }}>Reservasi Saya</h1>
        <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, color: dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)', marginBottom: 32 }}>
          {user.name} · {user.email}
        </p>

        {reservations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', border: `1px dashed ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: 4 }}>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14, color: dark ? 'rgba(248,249,250,0.3)' : 'rgba(33,37,41,0.3)' }}>Belum ada reservasi.</p>
            <button
              onClick={() => {
                onBack();
                setTimeout(() => document.getElementById('reservation')?.scrollIntoView({ behavior: 'smooth' }), 100);
              }}
              style={{
                fontFamily: "'Montserrat',sans-serif",
                fontWeight: 600,
                fontSize: 12,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                padding: '10px 20px',
                background: dark ? '#F8F9FA' : '#212529',
                color: dark ? '#212529' : '#F8F9FA',
                border: 'none',
                borderRadius: 2,
                cursor: 'pointer',
                marginTop: 16,
              }}
            >
              Buat Reservasi
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {reservations.map((r) => (
              <div key={r.id} style={{ padding: '20px', border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, color: dark ? 'rgba(248,249,250,0.35)' : 'rgba(33,37,41,0.35)' }}>#{r.id}</span>
                    <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 10, padding: '3px 8px', borderRadius: 2, background: `${statusColor(r.status)}18`, color: statusColor(r.status) }}>
                      {statusLabel[r.status]}
                    </span>
                  </div>
                  <p style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 17, color: dark ? '#F8F9FA' : '#212529', marginBottom: 4 }}>{r.tableId === 15 ? 'Meja VIP' : `Meja ${r.tableId}`}</p>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, color: dark ? 'rgba(248,249,250,0.5)' : 'rgba(33,37,41,0.5)' }}>
                    {r.date} · {r.time} · {r.guests} tamu
                  </p>
                  {r.notes && <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: dark ? 'rgba(248,249,250,0.35)' : 'rgba(33,37,41,0.35)', marginTop: 4, fontStyle: 'italic' }}>"{r.notes}"</p>}
                </div>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(r.status), flexShrink: 0, marginTop: 6 }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ADMIN LOGIN
// ============================================================
function AdminLogin({ dark, onLogin, onBack }: { dark: boolean; onLogin: () => void; onBack: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const handleLogin = () => (pw === ADMIN_PASSWORD ? onLogin() : setErr('Password salah. Coba lagi.'));
  const iS: React.CSSProperties = {
    fontFamily: "'Montserrat',sans-serif",
    fontSize: 14,
    padding: '13px 15px',
    background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
    borderRadius: 2,
    color: dark ? '#F8F9FA' : '#212529',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box' as const,
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <button
          onClick={onBack}
          style={{
            fontFamily: "'Montserrat',sans-serif",
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 32,
          }}
        >
          ← Kembali
        </button>
        <h1 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 30, color: dark ? '#F8F9FA' : '#212529', marginBottom: 6 }}>Admin Panel</h1>
        <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, color: dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)', marginBottom: 28 }}>muda mudi café</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input type="password" placeholder="Password Admin" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} style={iS} />
          {err && <p style={{ color: '#e74c3c', fontSize: 12 }}>{err}</p>}
          <button
            onClick={handleLogin}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 600,
              fontSize: 12,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '13px',
              background: dark ? '#F8F9FA' : '#212529',
              color: dark ? '#212529' : '#F8F9FA',
              border: 'none',
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Masuk
          </button>
        </div>
    
      </div>
    </div>
  );
}

// ============================================================
// ADMIN DASHBOARD
// ============================================================
function AdminDashboard({ dark, onLogout }: { dark: boolean; onLogout: () => void }) {
  const [reservations, setReservations] = useState<Reservation[]>(LS.getReservations());
  const [tables, setTables] = useState<Table[]>(LS.getTables());
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  useEffect(() => {
    loadGoogleScript();
  }, []);
  // FIX: admin writes to mm_tables_v2 — same key reservation form reads
  const toggleTableFull = (tableId: number) => {
    const updated = tables.map((t) => (t.id === tableId ? { ...t, manualFull: !t.manualFull } : t));
    setTables(updated);
    LS.saveTables(updated); // writes to mm_tables_v2
    const table = updated.find((t) => t.id === tableId);
    setToast({ msg: `Meja ${tableId === 15 ? 'VIP' : tableId} ditandai ${table?.manualFull ? 'FULL' : 'TERSEDIA'}`, type: table?.manualFull ? 'error' : 'success' });
  };

  const updateStatus = (id: string, status: 'approved' | 'rejected') => {
    const updated = reservations.map((r) => (r.id === id ? { ...r, status } : r));
    setReservations(updated);
    LS.saveReservations(updated);

    // Push notification to the user
    const res = reservations.find((r) => r.id === id);
    if (res?.userId) {
      pushNotification(res.userId, res.id, status, res.name, res.date, res.time);
    }
    setToast({ msg: `Reservasi #${id} berhasil di-${status === 'approved' ? 'setujui' : 'tolak'}.`, type: status === 'approved' ? 'success' : 'error' });
  };

  const filtered = reservations.filter((r) => filter === 'all' || r.status === filter);
  const bc = (s: string) => (s === 'approved' ? { bg: 'rgba(39,174,96,0.12)', text: '#27ae60' } : s === 'rejected' ? { bg: 'rgba(231,76,60,0.12)', text: '#e74c3c' } : { bg: 'rgba(243,156,18,0.12)', text: '#f39c12' });
  const statusLabel: Record<string, string> = { pending: 'Pending', approved: 'Disetujui', rejected: 'Ditolak' };

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 36, paddingTop: 16 }}>
          <div>
            <h1 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 26, color: dark ? '#F8F9FA' : '#212529' }}>Dashboard Admin</h1>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: dark ? 'rgba(248,249,250,0.4)' : 'rgba(33,37,41,0.4)', marginTop: 3 }}>muda mudi café</p>
          </div>
          <button
            onClick={onLogout}
            style={{
              fontFamily: "'Montserrat',sans-serif",
              fontWeight: 600,
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '9px 18px',
              background: 'transparent',
              color: dark ? 'rgba(248,249,250,0.55)' : 'rgba(33,37,41,0.55)',
              border: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            Keluar
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 36 }}>
          {[
            { label: 'Total', count: reservations.length, color: dark ? '#F8F9FA' : '#212529' },
            { label: 'Pending', count: reservations.filter((r) => r.status === 'pending').length, color: '#f39c12' },
            { label: 'Disetujui', count: reservations.filter((r) => r.status === 'approved').length, color: '#27ae60' },
            { label: 'Ditolak', count: reservations.filter((r) => r.status === 'rejected').length, color: '#e74c3c' },
          ].map((s) => (
            <div key={s.label} style={{ padding: '18px 20px', border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 4 }}>
              <p style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 30, color: s.color }}>{s.count}</p>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: dark ? 'rgba(248,249,250,0.4)' : 'rgba(33,37,41,0.4)', marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* TABLE MANAGEMENT */}
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, color: dark ? '#F8F9FA' : '#212529', marginBottom: 14 }}>Manajemen Meja</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tables.map((t) => (
              <button
                key={t.id}
                onClick={() => toggleTableFull(t.id)}
                style={{
                  fontFamily: "'Montserrat',sans-serif",
                  fontWeight: 600,
                  fontSize: 11,
                  padding: '8px 14px',
                  border: `1.5px solid ${t.manualFull ? '#e74c3c' : dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                  borderRadius: 2,
                  background: t.manualFull ? 'rgba(231,76,60,0.1)' : 'transparent',
                  color: t.manualFull ? '#e74c3c' : dark ? 'rgba(248,249,250,0.65)' : 'rgba(33,37,41,0.65)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                title="Klik untuk toggle Full/Tersedia"
              >
                {t.type === 'vip' ? 'VIP' : `M${t.id}`} {t.manualFull ? '● Full' : '○'}
              </button>
            ))}
          </div>
          <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, color: dark ? 'rgba(248,249,250,0.3)' : 'rgba(33,37,41,0.3)', marginTop: 8 }}>Klik meja untuk toggle. Status langsung terefleksi di form reservasi pengunjung.</p>
        </div>

        {/* RESERVATIONS */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 20, color: dark ? '#F8F9FA' : '#212529' }}>Daftar Reservasi</h2>
            <div style={{ display: 'flex', gap: 7 }}>
              {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    fontFamily: "'Montserrat',sans-serif",
                    fontWeight: 600,
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    padding: '6px 12px',
                    border: `1px solid ${filter === f ? (dark ? '#F8F9FA' : '#212529') : dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    background: filter === f ? (dark ? '#F8F9FA' : '#212529') : 'transparent',
                    color: filter === f ? (dark ? '#212529' : '#F8F9FA') : dark ? 'rgba(248,249,250,0.55)' : 'rgba(33,37,41,0.55)',
                    borderRadius: 2,
                    cursor: 'pointer',
                  }}
                >
                  {f === 'all' ? 'Semua' : f === 'pending' ? 'Pending' : f === 'approved' ? 'Disetujui' : 'Ditolak'}
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', border: `1px dashed ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: 4 }}>
              <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 13, color: dark ? 'rgba(248,249,250,0.3)' : 'rgba(33,37,41,0.3)' }}>Tidak ada reservasi.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((r) => {
                  const c = bc(r.status);
                  return (
                    <div
                      key={r.id}
                      style={{ padding: '18px 20px', border: `1px solid ${dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}`, borderRadius: 4, display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'start' }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 10, color: dark ? 'rgba(248,249,250,0.35)' : 'rgba(33,37,41,0.35)' }}>#{r.id}</span>
                          <span style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 10, padding: '3px 8px', borderRadius: 2, background: c.bg, color: c.text }}>{statusLabel[r.status]}</span>
                          {r.userId && <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, color: '#3498db' }}>🔗 terhubung akun</span>}
                        </div>
                        <p style={{ fontFamily: "'Playfair Display',serif", fontWeight: 700, fontSize: 17, color: dark ? '#F8F9FA' : '#212529', marginBottom: 3 }}>{r.name}</p>
                        <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 12, color: dark ? 'rgba(248,249,250,0.5)' : 'rgba(33,37,41,0.5)' }}>
                          {r.date} · {r.time} · {r.guests} tamu · {r.tableId === 15 ? 'Meja VIP' : `Meja ${r.tableId}`}
                        </p>
                        <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: dark ? 'rgba(248,249,250,0.35)' : 'rgba(33,37,41,0.35)', marginTop: 3 }}>
                          {r.phone} · {r.email}
                        </p>
                        {r.notes && <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: dark ? 'rgba(248,249,250,0.3)' : 'rgba(33,37,41,0.3)', marginTop: 3, fontStyle: 'italic' }}>"{r.notes}"</p>}
                      </div>
                      {r.status === 'pending' && (
                        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                          <button
                            onClick={() => updateStatus(r.id, 'approved')}
                            style={{
                              fontFamily: "'Montserrat',sans-serif",
                              fontWeight: 600,
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              padding: '8px 14px',
                              background: 'rgba(39,174,96,0.1)',
                              color: '#27ae60',
                              border: '1px solid rgba(39,174,96,0.25)',
                              borderRadius: 2,
                              cursor: 'pointer',
                            }}
                          >
                            ✓ Setujui
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, 'rejected')}
                            style={{
                              fontFamily: "'Montserrat',sans-serif",
                              fontWeight: 600,
                              fontSize: 10,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              padding: '8px 14px',
                              background: 'rgba(231,76,60,0.08)',
                              color: '#e74c3c',
                              border: '1px solid rgba(231,76,60,0.2)',
                              borderRadius: 2,
                              cursor: 'pointer',
                            }}
                          >
                            ✗ Tolak
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MOMENT GALLERY
// ============================================================
function MomentGallery({ dark }: { dark: boolean }) {
  const accent = dark ? '#C9A84C' : '#B8860B';
  const textMuted = dark ? 'rgba(232,210,160,0.45)' : 'rgba(60,35,10,0.45)';

  // 12 foto dari Unsplash bertema café & kopi
  const photos = [
    '/foto1.jpeg',
    '/foto2.jpeg',
    '/foto5.jpeg',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=400&q=80',
    '/foto3.jpeg',
    '/foto7.jpeg',
    '/foto13.png',
    '/foto6.jpeg',
    '/foto4.jpg',
    '/foto11.jpg',
    '/foto8.jpeg',
    '/foto12.jpg',
  ];

  return (
    <section
      style={{
        padding: '80px 24px',
        background: dark ? 'linear-gradient(180deg, #0A0A0A 0%, #0D0A05 100%)' : 'linear-gradient(180deg, #F5ECD9 0%, #FDFAF5 100%)',
        borderTop: `1px solid ${dark ? 'rgba(201,168,76,0.08)' : 'rgba(122,78,32,0.08)'}`,
        borderBottom: `1px solid ${dark ? 'rgba(201,168,76,0.08)' : 'rgba(122,78,32,0.08)'}`,
      }}
    >
      <style>{`
        .gallery-img {
          filter: grayscale(100%);
          transition: filter 0.4s ease, transform 0.4s ease;
          cursor: pointer;
        }
        .gallery-img:hover {
          filter: grayscale(0%);
          transform: scale(1.04);
          z-index: 2;
        }
        .gallery-wrap {
          overflow: hidden;
          border-radius: 3px;
          position: relative;
        }
      `}</style>

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <p
            style={{
              fontFamily: "'Montserrat', sans-serif",
              fontWeight: 600,
              fontSize: 10,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: accent,
              marginBottom: 14,
            }}
          >
            MOMENTS
          </p>
          <h2
            style={{
              fontFamily: "'Cormorant Garamond', 'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 'clamp(32px, 4vw, 56px)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: dark ? 'rgba(245,236,217,0.13)' : 'rgba(26,10,0,0.1)',
              lineHeight: 1,
            }}
          >
            GALLERY
          </h2>
          <div
            style={{
              width: 60,
              height: 3,
              margin: '14px auto 0',
              background: `linear-gradient(to right, transparent, ${accent}, transparent)`,
              borderRadius: 2,
            }}
          />
        </div>

        {/* Grid 6 kolom × 2 baris */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1fr)',
            gap: 6,
          }}
        >
          {photos.map((src, i) => (
            <div key={i} className="gallery-wrap">
              <img
                src={src}
                alt={`Muda Mudi moment ${i + 1}`}
                className="gallery-img"
                style={{
                  width: '100%',
                  height: 160,
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CafeStory({ dark }: { dark: boolean }) {
  const accent = dark ? '#C9A84C' : '#7A4E20';
  const accentMuted = dark ? 'rgba(201,168,76,0.6)' : 'rgba(122,78,32,0.6)';
  const textMain = dark ? '#F5ECD9' : '#2A1A08';
  const textMuted = dark ? 'rgba(232,210,160,0.55)' : 'rgba(92,61,30,0.55)';
  const borderColor = dark ? 'rgba(201,168,76,0.12)' : 'rgba(122,78,32,0.1)';
  const surfaceBg = dark ? 'rgba(255,255,255,0.02)' : 'rgba(92,61,30,0.03)';

  return (
    <section
      style={{
        padding: '100px 24px',
        background: dark ? 'linear-gradient(180deg, #0A0A0A 0%, #0D0A05 50%, #0A0A0A 100%)' : 'linear-gradient(180deg, #FDFAF5 0%, #F7F0E4 50%, #FDFAF5 100%)',
      }}
    >
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* ── Label ── */}
        <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: accentMuted, marginBottom: 16 }}>&nbsp; Cerita Kami</p>

        {/* ── Foto + Cerita ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center', marginBottom: 80 }}>
          {/* Foto café */}
          <div style={{ position: 'relative' }}>
            <div style={{ borderRadius: 4, overflow: 'hidden', boxShadow: dark ? '0 24px 64px rgba(0,0,0,0.6)' : '0 24px 64px rgba(92,61,30,0.15)' }}>
              <img src="/cerita.jpeg" alt="Muda Mudi Café" style={{ width: '100%', height: 440, objectFit: 'cover', display: 'block', borderRadius: 16 }} />
              {/* overlay gradien bawah */}
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: dark ? 'linear-gradient(to top, rgba(10,10,10,0.7), transparent)' : 'linear-gradient(to top, rgba(50,25,5,0.3), transparent)' }} />
            </div>
            {/* Badge tahun berdiri */}
            <div
              style={{
                position: 'absolute',
                top: -16,
                right: -16,
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: dark ? 'linear-gradient(135deg,#C9A84C,#A07830)' : 'linear-gradient(135deg,#7A4E20,#5C3D1E)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: dark ? '0 8px 32px rgba(201,168,76,0.3)' : '0 8px 32px rgba(92,61,30,0.25)',
              }}
            >
              <span style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontWeight: 700, fontSize: 22, color: dark ? '#0A0A0A' : '#FDFAF5', lineHeight: 1 }}>2025</span>
              <span style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 8, letterSpacing: '0.1em', color: dark ? 'rgba(10,10,10,0.7)' : 'rgba(253,250,245,0.75)', marginTop: 2 }}>BERDIRI</span>
            </div>
            {/* Garis dekoratif sudut */}
            <div style={{ position: 'absolute', bottom: -16, left: -16, width: 64, height: 64, border: `1.5px solid ${borderColor}`, borderRadius: 2, pointerEvents: 'none' }} />
          </div>

          {/* Narasi cerita */}
          <div>
            <h2 style={{ fontFamily: "'Cormorant Garamond','Playfair Display',serif", fontWeight: 700, fontSize: 'clamp(28px,3vw,44px)', lineHeight: 1.15, letterSpacing: '-0.5px', color: textMain, marginBottom: 24 }}>
              Dari Secangkir Impian, Lahirlah Muda Mudi.
            </h2>
            <div style={{ width: 40, height: 2, background: dark ? 'linear-gradient(to right,#C9A84C,transparent)' : 'linear-gradient(to right,#7A4E20,transparent)', marginBottom: 24 }} />
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14, lineHeight: 2, color: textMuted, marginBottom: 20 }}>
              Muda Mudi di dirikan pada tahun <strong style={{ color: accent }}>2025</strong> dari tangan seorang pemuda Palattae yang bermimpi menyajikan minuman berkualitas tinggi tanpa harus pergi jauh ke kota. Kami percaya bahwa cita rasa
              terbaik tumbuh dari tanah sendiri.
            </p>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 14, lineHeight: 2, color: textMuted, marginBottom: 32 }}>
              Didirikan oleh <strong style={{ color: accent }}>Wahyudi Nur</strong>, Muda Mudi kini menjadi ruang berkumpul favorit bagi orang orang sebagai tempat cerita mengalir seiring aroma kopi yang mengepul hangat.
            </p>
          </div>
        </div>

        {/* ── Maps + Sosmed ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          {/* Google Maps embed */}
          <div>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: accentMuted, marginBottom: 14 }}>&nbsp; OUR LOCATION</p>
            <div
              style={{ borderRadius: 4, overflow: 'hidden', border: `1px solid ${borderColor}`, boxShadow: dark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 32px rgba(92,61,30,0.08)', position: 'relative', cursor: 'pointer' }}
              onClick={() => window.open('https://maps.app.goo.gl/EeS6S4L7aLB4rEWR9', '_blank')}
            >
              <iframe
                title="Lokasi Muda Mudi Café"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3973.123456!2d120.3!3d-4.1!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2sMuda+Mudi+Cafe+Palattae!5e0!3m2!1sid!2sid!4v1234567890"
                width="100%"
                height="260"
                style={{ border: 0, display: 'block', filter: dark ? 'invert(0.85) hue-rotate(180deg)' : 'none', pointerEvents: 'none' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
            {/* Link buka maps */}
            <a
              href="https://maps.app.goo.gl/EeS6S4L7aLB4rEWR9"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 12,
                fontFamily: "'Montserrat',sans-serif",
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: accent,
                textDecoration: 'none',
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.7')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              Buka di Google Maps
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: textMuted, marginTop: 6, lineHeight: 1.6 }}>
              24G7+WMJ, Jl. A. Page, Palattae, Kec. Kahu, Kabupaten Bone, Sulawesi Selatan 92767
              <br />
            </p>
          </div>

          {/* Sosial Media */}
          <div>
            <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 600, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: accentMuted, marginBottom: 14 }}>&nbsp;CONTACT US</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Instagram */}
              <a
                href="https://www.instagram.com/mudamudiplaygroundcafe?igsh=MXFzcml5NzdoYXV6dg=="
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  background: surfaceBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 4,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = dark ? 'rgba(201,168,76,0.35)' : 'rgba(122,78,32,0.25)';
                  el.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = borderColor;
                  el.style.transform = 'translateX(0)';
                }}
              >
                {/* Instagram SVG */}
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="none" stroke="white" strokeWidth="2" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" fill="white" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: textMain, marginBottom: 2 }}>Instagram</p>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: textMuted }}>@mudamudiplaygroundcafe</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentMuted} strokeWidth="2" style={{ marginLeft: 'auto' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>

              {/* TikTok */}
              <a
                href="https://www.tiktok.com/@mudamudiplayground?_r=1&_t=ZS-96Dg3kAUD0n"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  background: surfaceBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 4,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = dark ? 'rgba(201,168,76,0.35)' : 'rgba(122,78,32,0.25)';
                  el.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = borderColor;
                  el.style.transform = 'translateX(0)';
                }}
              >
                {/* TikTok SVG */}
                <div style={{ width: 40, height: 40, borderRadius: 12, background: dark ? '#1a1a1a' : '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.28 6.28 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: textMain, marginBottom: 2 }}>TikTok</p>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: textMuted }}>@mudamudiplaygroundcafe</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentMuted} strokeWidth="2" style={{ marginLeft: 'auto' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>

              {/* WhatsApp */}
              <a
                href="https://wa.me/6287762123977"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                  background: surfaceBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 4,
                  textDecoration: 'none',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = dark ? 'rgba(201,168,76,0.35)' : 'rgba(122,78,32,0.25)';
                  el.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.borderColor = borderColor;
                  el.style.transform = 'translateX(0)';
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, overflow: 'hidden' }}>
                  <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                    <rect width="40" height="40" rx="12" fill="#25D366" />
                    <path d="M20 8C13.373 8 8 13.373 8 20c0 2.157.576 4.18 1.58 5.92L8 32l6.273-1.553A11.94 11.94 0 0 0 20 32c6.627 0 12-5.373 12-12S26.627 8 20 8z" fill="#fff" />
                    <path d="M20 9.6c-5.744 0-10.4 4.656-10.4 10.4 0 1.874.5 3.632 1.376 5.148l.19.323-.808 2.945 3.03-.796.312.183A10.36 10.36 0 0 0 20 30.4c5.744 0 10.4-4.656 10.4-10.4S25.744 9.6 20 9.6z" fill="#25D366" />
                    <path
                      d="M16.357 14.4c-.27-.006-.56.005-.836.613-.277.609-1.057 2.59-1.057 2.59s-.17.445.09.87c.258.423 1.14 1.895 2.56 3.07 1.42 1.174 2.856 1.73 3.437 1.96.582.232.954.19 1.24-.076.284-.265.91-1.07.91-1.07s.26-.33.006-.595c-.255-.264-1.57-1.095-1.57-1.095s-.305-.203-.57.024c-.265.228-.652.737-.652.737s-.162.213-.43.106c-.27-.107-1.244-.508-2.274-1.427-1.03-.92-1.527-1.898-1.627-2.162-.1-.264.08-.41.08-.41s.45-.55.63-.79c.18-.24.08-.595.08-.595l-.853-2.148c-.156-.395-.337-.396-.504-.402h-.46z"
                      fill="#fff"
                    />
                  </svg>
                </div>
                <div>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 700, fontSize: 13, color: textMain, marginBottom: 2 }}>WhatsApp</p>
                  <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 11, color: textMuted }}>087762123977</p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accentMuted} strokeWidth="2" style={{ marginLeft: 'auto' }}>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
// ============================================================
// FOOTER
// ============================================================
function Footer({ dark }: { dark: boolean }) {
  const accent = dark ? '#C9A84C' : '#7A4E20';
  const textMuted = dark ? 'rgba(232,210,160,0.35)' : 'rgba(92,61,30,0.4)';

  return (
    <footer
      style={{
        borderTop: `1px solid ${dark ? 'rgba(201,168,76,0.1)' : 'rgba(122,78,32,0.1)'}`,
        padding: '36px 24px',
        background: dark ? '#0A0A0A' : '#FDFAF5',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Logo mini */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>

      </div>
      <p style={{ fontFamily: "'Montserrat',sans-serif", fontSize: 10, color: textMuted, letterSpacing: '0.05em' }}>© {new Date().getFullYear()} Muda Mudi Café · Palattae, Kec. Kahu, Kab. Bone</p>
    </footer>
  );
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [dark, setDark] = useDarkMode();
  const [page, setPage] = useState<'home' | 'admin-login' | 'admin' | 'my-reservations' | 'reservation'>('home');
  const [adminLoggedIn, setAdminLoggedIn] = useState(false);
  const [googleUser, setGoogleUser] = useState<GoogleUser | null>(getGoogleUser);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleGoogleSuccess = (user: GoogleUser) => {
    saveGoogleUser(user);
    setGoogleUser(user);
    setShowLoginModal(false);
    setPage('reservation');
    setToast({ msg: `Selamat datang, ${user.name}! 👋`, type: 'success' });
  };

  const handleGoogleLogout = () => {
    clearGoogleUser();
    setGoogleUser(null);
    setPage('home');
  };
  // Klik tombol Reservasi Meja: cek apakah sudah login Google
  const handleReservasiClick = () => {
    if (googleUser) {
      setPage('reservation');
    } else {
      setShowLoginModal(true);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: dark ? '#121212' : '#F8F9FA', color: dark ? '#F8F9FA' : '#212529', transition: 'background 0.3s,color 0.3s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Playfair+Display:wght@400;700&family=Montserrat:wght@400;500;600;700&display=swap');
        *{margin:0;padding:0;box-sizing:border-box}
        html{scroll-behavior:smooth}
        input,select,textarea{color-scheme:${dark ? 'dark' : 'light'}}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'};border-radius:3px}
        @keyframes scrollPulse{0%,100%{opacity:.3;transform:scaleY(1)}50%{opacity:.55;transform:scaleY(1.08)}}
        @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @media(max-width:768px){#about-grid{grid-template-columns:1fr!important}}
      `}</style>

      {/* Toast */}
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Modal login Google OAuth — muncul saat Reservasi diklik tanpa login */}
      {showLoginModal && <GoogleLoginModal dark={dark} onSuccess={handleGoogleSuccess} onClose={() => setShowLoginModal(false)} />}

      {/* Halaman Reservasi — full page terpisah, butuh Google login */}
      {page === 'reservation' && googleUser && <ReservationPage dark={dark} setDark={setDark} user={googleUser} onLogout={handleGoogleLogout} onGoHome={() => setPage('home')} />}

      {/* Halaman utama */}
      {page === 'home' && (
        <>
          <Header dark={dark} setDark={setDark} page={page} setPage={setPage} user={googleUser} handleReservasiClick={handleReservasiClick} />
          <main>
            <Hero dark={dark} setSection={() => {}} onReservasiClick={handleReservasiClick} />
            <About dark={dark} />
            <Menu dark={dark} />
            <MomentGallery dark={dark} />
            <CafeStory dark={dark} />
            <Footer dark={dark} />
          </main>
        </>
      )}

      {page === 'my-reservations' && googleUser && (
        <>
          <Header dark={dark} setDark={setDark} page={page} setPage={setPage} user={googleUser} handleReservasiClick={handleReservasiClick} />
          <MyReservations dark={dark} user={googleUser} onBack={() => setPage('home')} />
        </>
      )}

      {page === 'admin-login' && (
        <>
          <Header dark={dark} setDark={setDark} page={page} setPage={setPage} user={googleUser} onUserLogin={handleGoogleSuccess} onUserLogout={handleGoogleLogout} handleReservasiClick={handleReservasiClick} />
          <div style={{ paddingTop: 72 }}>
            <AdminLogin
              dark={dark}
              onLogin={() => {
                setAdminLoggedIn(true);
                setPage('admin');
              }}
              onBack={() => setPage('home')}
            />
          </div>
        </>
      )}

      {page === 'admin' && adminLoggedIn && (
        <>
          <Header dark={dark} setDark={setDark} page={page} setPage={setPage} user={googleUser} onUserLogin={handleGoogleSuccess} onUserLogout={handleGoogleLogout} handleReservasiClick={handleReservasiClick} />
          <div style={{ paddingTop: 72 }}>
            <AdminDashboard
              dark={dark}
              onLogout={() => {
                setAdminLoggedIn(false);
                setPage('home');
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
