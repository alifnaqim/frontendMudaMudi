// ============================================================
// src/pages/ReservationPage.tsx
// Halaman Reservasi — terpisah dari landing page
// Dilindungi Google OAuth: harus login dulu
// ============================================================
import { useState, useEffect } from 'react';
import { GoogleUser } from '../lib/googleAuth';

// ── Types ──────────────────────────────────────────────────
interface Table { id: number; type: 'regular' | 'vip'; seats: number; manualFull?: boolean; }
interface Reservation {
  id: string; name: string; phone: string; email: string;
  date: string; time: string; tableId: number; guests: number;
  notes: string; status: 'pending' | 'approved' | 'rejected'; createdAt: string;
}
interface Notification {
  id: string; reservationId: string; userEmail: string; message: string;
  type: 'pending' | 'approved' | 'rejected'; read: boolean; createdAt: string;
}

// ── Constants ──────────────────────────────────────────────
const TABLES: Table[] = [
  ...Array.from({ length: 14 }, (_, i) => ({ id: i + 1, type: 'regular' as const, seats: 4, manualFull: false })),
  { id: 15, type: 'vip', seats: 6, manualFull: false },
];
const TIME_SLOTS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00'];

// ── Storage helpers ────────────────────────────────────────
const getReservations = (): Reservation[] => { try { return JSON.parse(localStorage.getItem('mm_reservations') || '[]'); } catch { return []; } };
const saveReservations = (r: Reservation[]) => localStorage.setItem('mm_reservations', JSON.stringify(r));
const getLiveTables = (): Table[] => { try { return JSON.parse(localStorage.getItem('mm_tables_v2') || JSON.stringify(TABLES)); } catch { return TABLES; } };
const getNotifs = (email: string): Notification[] => { try { return (JSON.parse(localStorage.getItem('mm_notifications') || '[]') as Notification[]).filter(n => n.userEmail === email.toLowerCase()); } catch { return []; } };
const pushNotif = (userEmail: string, reservationId: string, type: 'pending' | 'approved' | 'rejected', date: string, time: string) => {
  const msgs = {
    pending: `🕐 Reservasi #${reservationId} (${date} · ${time}) sedang menunggu konfirmasi admin.`,
    approved: `✅ Reservasi #${reservationId} (${date} · ${time}) telah DISETUJUI!`,
    rejected: `❌ Reservasi #${reservationId} (${date} · ${time}) DITOLAK.`,
  };
  const existing: Notification[] = JSON.parse(localStorage.getItem('mm_notifications') || '[]');
  localStorage.setItem('mm_notifications', JSON.stringify([{
    id: 'N' + Date.now().toString(36).toUpperCase(), reservationId,
    userEmail: userEmail.toLowerCase(), message: msgs[type], type, read: false,
    createdAt: new Date().toISOString(),
  }, ...existing]));
};
const markRead = (email: string) => {
  const all: Notification[] = JSON.parse(localStorage.getItem('mm_notifications') || '[]');
  localStorage.setItem('mm_notifications', JSON.stringify(all.map(n => n.userEmail === email.toLowerCase() ? { ...n, read: true } : n)));
};
const isTableBlocked = (id: number, date: string, time: string) => getReservations().some(r => r.tableId === id && r.date === date && r.time === time && r.status === 'approved');
const isSlotPast = (date: string, time: string) => { const [h,m] = time.split(':').map(Number); const d = new Date(date); d.setHours(h,m,0,0); return d.getTime() - Date.now() < 3600000; };
const today = () => new Date().toISOString().split('T')[0];

// ── Design tokens ──────────────────────────────────────────
const C = {
  gold: '#C9A84C',
  goldLight: '#E8C96A',
  goldDark: '#A07830',
  darkBg: '#0A0A0A',
  darkSurface: '#141414',
  darkBorder: 'rgba(201,168,76,0.15)',
  lightBg: '#FAFAF8',
  lightSurface: '#FFFFFF',
  lightBorder: 'rgba(0,0,0,0.08)',
};

// ── Sub-components ─────────────────────────────────────────

// Notif Bell
function NotifBell({ dark, email }: { dark: boolean; email: string }) {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);

  useEffect(() => {
    const refresh = () => setNotifs(getNotifs(email));
    refresh();
    const iv = setInterval(refresh, 3000);
    return () => clearInterval(iv);
  }, [email]);

  const unread = notifs.filter(n => !n.read).length;
  const typeColor = (t: string) => t === 'approved' ? '#27ae60' : t === 'rejected' ? '#e74c3c' : C.gold;

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(v => !v); if (!open) { markRead(email); setTimeout(() => setNotifs(getNotifs(email)), 100); } }}
        style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${dark ? C.darkBorder : C.lightBorder}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: dark ? '#F8F9FA' : '#212529', position: 'relative', transition: 'border-color 0.2s' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        {unread > 0 && <span style={{ position:'absolute', top:-5, right:-5, minWidth:18, height:18, borderRadius:9, background:'#e74c3c', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', fontFamily:"'Montserrat',sans-serif", border:`2px solid ${dark?C.darkBg:C.lightBg}` }}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div style={{ position:'absolute', top:48, right:0, width:320, maxHeight:400, background:dark?C.darkSurface:C.lightSurface, border:`1px solid ${dark?C.darkBorder:C.lightBorder}`, borderRadius:8, boxShadow:'0 16px 48px rgba(0,0,0,0.3)', overflow:'hidden', display:'flex', flexDirection:'column', zIndex:500 }}>
          <div style={{ padding:'12px 16px', borderBottom:`1px solid ${dark?C.darkBorder:C.lightBorder}`, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontFamily:"'Playfair Display',serif", fontWeight:700, fontSize:14, color:dark?'#F8F9FA':'#212529' }}>Notifikasi</span>
            <button onClick={() => setOpen(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:dark?'rgba(255,255,255,0.4)':'rgba(0,0,0,0.4)', lineHeight:1 }}>×</button>
          </div>
          <div style={{ overflowY:'auto', flex:1 }}>
            {notifs.length === 0
              ? <p style={{ padding:32, textAlign:'center', fontFamily:"'Montserrat',sans-serif", fontSize:12, color:dark?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.3)' }}>Belum ada notifikasi.</p>
              : notifs.map(n => (
                <div key={n.id} style={{ padding:'11px 16px', borderBottom:`1px solid ${dark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.04)'}`, display:'flex', gap:10, alignItems:'flex-start', background:n.read?'transparent':dark?'rgba(201,168,76,0.04)':'rgba(201,168,76,0.04)' }}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:typeColor(n.type), flexShrink:0, marginTop:5, opacity:n.read?0.3:1 }} />
                  <div>
                    <p style={{ fontFamily:"'Montserrat',sans-serif", fontSize:11, lineHeight:1.6, color:dark?(n.read?'rgba(248,249,250,0.4)':'rgba(248,249,250,0.85)'):(n.read?'rgba(33,37,41,0.4)':'rgba(33,37,41,0.85)') }}>{n.message}</p>
                    <p style={{ fontFamily:"'Montserrat',sans-serif", fontSize:10, color:dark?'rgba(255,255,255,0.2)':'rgba(0,0,0,0.25)', marginTop:3 }}>{new Date(n.createdAt).toLocaleString('id-ID')}</p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ReservationPage component ────────────────────────
interface Props {
  dark: boolean;
  setDark: (v: boolean) => void;
  user: GoogleUser;
  onLogout: () => void;
  onGoHome: () => void;
}

export default function ReservationPage({ dark, setDark, user, onLogout, onGoHome }: Props) {
  const emptyForm = { name: user.name, phone: '', email: user.email, date: '', time: '', tableId: 0, guests: 2, notes: '' };
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [refId, setRefId] = useState('');
  const [liveTables, setLiveTables] = useState<Table[]>(getLiveTables());
  const [scrolled, setScrolled] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  useEffect(() => {
    try { setLiveTables(JSON.parse(localStorage.getItem('mm_tables_v2') || JSON.stringify(TABLES))); } catch { setLiveTables(TABLES); }
  }, [form.date, form.time]);

  useEffect(() => {
    setMyReservations(getReservations().filter(r => r.email.toLowerCase() === user.email.toLowerCase()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  }, [submitted, user.email]);

  const isAvail = (t: Table) => {
    if (!form.date || !form.time) return !t.manualFull;
    if (t.manualFull) return false;
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
    if (!validate()) return;
    const id = 'MM' + Date.now().toString().slice(-6);
    const newRes: Reservation = { id, ...form, status: 'pending', createdAt: new Date().toISOString() };
    saveReservations([...getReservations(), newRes]);
    pushNotif(form.email, id, 'pending', form.date, form.time);
    setRefId(id);
    setSubmitted(true);
  };

  // ── Styles ───────────────────────────────────────────────
  const bg = dark ? C.darkBg : C.lightBg;
  const surface = dark ? C.darkSurface : C.lightSurface;
  const border = dark ? C.darkBorder : C.lightBorder;
  const text = dark ? '#F8F9FA' : '#212529';
  const muted = dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)';

  const inputS: React.CSSProperties = {
    fontFamily: "'Montserrat', sans-serif", fontSize: 13,
    padding: '12px 14px',
    background: dark ? '#1C1C1C' : '#FFFFFF',
    border: `1px solid ${border}`,
    borderRadius: 2, color: text,
    width: '100%', outline: 'none',
    boxSizing: 'border-box',
    colorScheme: dark ? 'dark' : 'light',
    transition: 'border-color 0.2s',
  };
  const labelS: React.CSSProperties = {
    fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 10,
    letterSpacing: '0.12em', textTransform: 'uppercase', color: muted,
    display: 'block', marginBottom: 6,
  };
  const errS: React.CSSProperties = { color: '#e74c3c', fontSize: 11, marginTop: 3, fontFamily: "'Montserrat', sans-serif" };

  const statusColor = (s: string) => s === 'approved' ? '#27ae60' : s === 'rejected' ? '#e74c3c' : C.gold;
  const statusLabel: Record<string, string> = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

  return (
    <div style={{ minHeight: '100vh', background: bg, color: text, transition: 'background 0.3s, color 0.3s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        input, select, textarea { font-family: 'Montserrat', sans-serif; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: ${dark ? 'invert(1)' : 'none'}; opacity: 0.5; }
        .res-input:focus { border-color: ${C.gold} !important; }
        .table-btn:hover:not(:disabled) { border-color: ${C.gold} !important; }
        .action-btn { transition: all 0.2s; }
        .action-btn:hover { opacity: 0.85; transform: translateY(-1px); }
        .action-btn:active { transform: translateY(0); }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.5s ease forwards; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${dark ? 'rgba(201,168,76,0.2)' : 'rgba(0,0,0,0.1)'}; border-radius: 3px; }
      `}</style>

      {/* ── Navbar ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', backdropFilter: scrolled ? 'blur(16px)' : 'none', WebkitBackdropFilter: scrolled ? 'blur(16px)' : 'none', backgroundColor: scrolled ? (dark ? 'rgba(10,10,10,0.92)' : 'rgba(250,250,248,0.92)') : 'transparent', borderBottom: scrolled ? `1px solid ${border}` : '1px solid transparent', transition: 'all 0.3s' }}>
        {/* Logo */}
        <button onClick={onGoHome} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill={C.gold}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
          <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 18, background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>muda mudi</span>
        </button>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotifBell dark={dark} email={user.email} />

          {/* Dark toggle */}
          <button onClick={() => setDark(!dark)} style={{ width: 40, height: 40, borderRadius: '50%', border: `1px solid ${border}`, background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: text, transition: 'border-color 0.2s' }}>
            {dark
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            }
          </button>

          {/* User avatar + dropdown */}
          <UserMenu dark={dark} user={user} onLogout={onLogout} />
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{ paddingTop: 100, paddingBottom: 80, maxWidth: 720, margin: '0 auto', padding: '100px 24px 80px' }}>
        {/* Page title */}
        <div className="fade-up" style={{ marginBottom: 40 }}>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 500, fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.gold, marginBottom: 10 }}>MUDA MUDI CAFÉ</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 'clamp(32px, 5vw, 52px)', lineHeight: 1.15, letterSpacing: '-0.5px', color: text }}>
            Reservasi Meja
          </h1>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, color: muted, marginTop: 10, lineHeight: 1.6 }}>
            Selamat datang, <strong style={{ color: C.gold }}>{user.given_name}</strong>. Pesan meja Anda sekarang.
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 36, borderBottom: `1px solid ${border}` }}>
          {(['form', 'history'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? C.gold : muted, borderBottom: `2px solid ${tab === t ? C.gold : 'transparent'}`, transition: 'all 0.2s', marginBottom: -1 }}>
              {t === 'form' ? 'Buat Reservasi' : `Riwayat (${myReservations.length})`}
            </button>
          ))}
        </div>

        {/* ── TAB: Form ── */}
        {tab === 'form' && !submitted && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Row 1: Nama + Telepon */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelS}>Nama Lengkap</label>
                <input className="res-input" style={inputS} value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Nama sesuai identitas" />
                {errors.name && <p style={errS}>{errors.name}</p>}
              </div>
              <div>
                <label style={labelS}>No. Telepon</label>
                <input className="res-input" style={inputS} value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} placeholder="08xxxxxxxxxx" />
                {errors.phone && <p style={errS}>{errors.phone}</p>}
              </div>
            </div>

            {/* Row 2: Email (readonly dari Google) */}
            <div>
              <label style={labelS}>Email Google <span style={{ color: C.gold, fontSize: 9 }}>● TERVERIFIKASI</span></label>
              <input className="res-input" style={{ ...inputS, opacity: 0.7, cursor: 'not-allowed' }} value={form.email} readOnly />
            </div>

            {/* Row 3: Tanggal + Jam + Tamu */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelS}>Tanggal</label>
                <input className="res-input" style={inputS} type="date" min={today()} value={form.date} onChange={e => setForm({...form, date:e.target.value, tableId:0})} />
                {errors.date && <p style={errS}>{errors.date}</p>}
              </div>
              <div>
                <label style={labelS}>Jam</label>
                <select className="res-input" style={inputS} value={form.time} onChange={e => setForm({...form, time:e.target.value, tableId:0})}>
                  <option value="">-- Pilih --</option>
                  {TIME_SLOTS.map(t => { const past = form.date ? isSlotPast(form.date, t) : false; return <option key={t} value={t} disabled={past}>{t}{past?' (lewat)':''}</option>; })}
                </select>
                {errors.time && <p style={errS}>{errors.time}</p>}
              </div>
              <div>
                <label style={labelS}>Tamu</label>
                <select className="res-input" style={inputS} value={form.guests} onChange={e => setForm({...form, guests:+e.target.value, tableId:0})}>
                  {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} orang</option>)}
                </select>
              </div>
            </div>

            {/* Row 4: Pilih Meja */}
            <div>
              <label style={{ ...labelS, marginBottom: 10 }}>
                Pilih Meja
                {form.date && form.time && <span style={{ marginLeft: 8, color: C.gold, textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 10 }}>— {liveTables.filter(isAvail).length} tersedia</span>}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {liveTables.map(t => {
                  const avail = isAvail(t);
                  const sel = form.tableId === t.id;
                  return (
                    <button key={t.id} className="table-btn" disabled={!avail} onClick={() => setForm({...form, tableId: t.id})}
                      title={t.manualFull ? 'Penuh (Admin)' : !avail ? 'Tidak tersedia' : t.type === 'vip' ? 'Meja VIP — 6 kursi' : `Meja ${t.id} — 4 kursi`}
                      style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: sel ? 700 : 500, fontSize: 11, padding: '10px 4px', border: `${sel ? 2 : 1}px solid ${sel ? C.gold : (!avail ? (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)') : border)}`, borderRadius: 2, background: sel ? (dark ? 'rgba(201,168,76,0.15)' : 'rgba(201,168,76,0.1)') : 'transparent', color: sel ? C.gold : (!avail ? (dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)') : text), cursor: !avail ? 'not-allowed' : 'pointer', textDecoration: !avail ? 'line-through' : 'none', position: 'relative', transition: 'all 0.15s' }}>
                      {t.type === 'vip' ? 'VIP' : `M${t.id}`}
                      <br /><span style={{ fontSize: 9, opacity: 0.6 }}>{t.seats}⚬</span>
                      {t.manualFull && <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7, borderRadius: '50%', background: '#e74c3c', border: `1.5px solid ${bg}` }} />}
                    </button>
                  );
                })}
              </div>
              {errors.tableId && <p style={errS}>{errors.tableId}</p>}
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, color: muted, marginTop: 8 }}>🔴 Titik merah = ditandai penuh oleh admin</p>
            </div>

            {/* Row 5: Catatan */}
            <div>
              <label style={labelS}>Catatan Khusus <span style={{ fontWeight: 400, opacity: 0.5 }}>(opsional)</span></label>
              <textarea className="res-input" style={{ ...inputS, height: 80, resize: 'vertical' }} value={form.notes} onChange={e => setForm({...form, notes:e.target.value})} placeholder="Ulang tahun, alergi, preferensi tempat duduk..." />
            </div>

            {/* Submit */}
            <button className="action-btn" onClick={handleSubmit}
              style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '16px', background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`, color: '#1A1000', border: 'none', borderRadius: 2, cursor: 'pointer', boxShadow: `0 4px 20px rgba(201,168,76,0.3)` }}>
              Kirim Reservasi
            </button>
          </div>
        )}

        {/* ── TAB: Form — Success ── */}
        {tab === 'form' && submitted && (
          <div className="fade-up" style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(39,174,96,0.12)', border: '2px solid rgba(39,174,96,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: 26 }}>✓</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, color: text, marginBottom: 10 }}>Reservasi Terkirim!</h2>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, color: muted, lineHeight: 1.7, marginBottom: 6 }}>Kode referensi: <strong style={{ color: C.gold }}>#{refId}</strong></p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, color: muted, lineHeight: 1.7, marginBottom: 28 }}>🔔 Notifikasi akan masuk ke ikon lonceng saat admin memproses reservasi Anda.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="action-btn" onClick={() => { setSubmitted(false); setForm({ ...emptyForm, name: user.name, email: user.email }); }} style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '12px 24px', background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`, color: '#1A1000', border: 'none', borderRadius: 2, cursor: 'pointer' }}>Buat Reservasi Lain</button>
              <button className="action-btn" onClick={() => setTab('history')} style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '12px 24px', background: 'transparent', color: muted, border: `1px solid ${border}`, borderRadius: 2, cursor: 'pointer' }}>Lihat Riwayat</button>
            </div>
          </div>
        )}

        {/* ── TAB: History ── */}
        {tab === 'history' && (
          <div className="fade-up">
            {myReservations.length === 0
              ? <div style={{ textAlign: 'center', padding: '48px 0' }}><p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, color: muted }}>Belum ada riwayat reservasi.</p></div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {myReservations.map(r => (
                    <div key={r.id} style={{ padding: '18px 20px', border: `1px solid ${border}`, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, background: surface }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 700, fontSize: 10, color: muted }}>#{r.id}</span>
                          <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 10, padding: '2px 8px', borderRadius: 2, background: `${statusColor(r.status)}18`, color: statusColor(r.status) }}>{statusLabel[r.status]}</span>
                        </div>
                        <p style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16, color: text, marginBottom: 3 }}>{r.tableId === 15 ? 'Meja VIP' : `Meja ${r.tableId}`}</p>
                        <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 12, color: muted }}>{r.date} · {r.time} · {r.guests} tamu</p>
                        {r.notes && <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 11, color: muted, marginTop: 3, fontStyle: 'italic' }}>"{r.notes}"</p>}
                      </div>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(r.status), flexShrink: 0, marginTop: 6 }} />
                    </div>
                  ))}
                </div>
            }
          </div>
        )}
      </main>
    </div>
  );
}

// ── User Avatar Dropdown ───────────────────────────────────
function UserMenu({ dark, user, onLogout }: { dark: boolean; user: GoogleUser; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const border = dark ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.08)';

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: `1px solid ${border}`, borderRadius: 20, padding: '4px 12px 4px 4px', cursor: 'pointer' }}>
        <img src={user.avatar} alt={user.name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
          onError={e => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=C9A84C&color=fff&size=64`; }} />
        <span style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 12, color: dark ? '#F8F9FA' : '#212529' }}>{user.given_name}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={dark ? '#F8F9FA' : '#212529'} strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 48, right: 0, width: 220, background: dark ? '#141414' : '#fff', border: `1px solid ${border}`, borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.25)', zIndex: 500, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${border}` }}>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontWeight: 600, fontSize: 13, color: dark ? '#F8F9FA' : '#212529' }}>{user.name}</p>
            <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 11, color: dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)', marginTop: 2 }}>{user.email}</p>
          </div>
          <button onClick={() => { setOpen(false); onLogout(); }} style={{ width: '100%', padding: '12px 16px', textAlign: 'left', fontFamily: "'Montserrat', sans-serif", fontSize: 12, color: '#e74c3c', background: 'none', border: 'none', cursor: 'pointer' }}>
            ↩ Keluar dari Google
          </button>
        </div>
      )}
    </div>
  );
}
