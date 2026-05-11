// ============================================================
// src/components/GoogleLoginModal.tsx
// Modal login Google OAuth 2.0 menggunakan Google Identity Services
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { GOOGLE_CLIENT_ID, loadGoogleScript, parseJwt, saveGoogleUser, GoogleUser } from '../lib/googleAuth';

const C = {
  gold: '#C9A84C',
  goldLight: '#E8C96A',
};

interface Props {
  dark: boolean;
  onSuccess: (user: GoogleUser) => void;
  onClose: () => void;
}

export default function GoogleLoginModal({ dark, onSuccess, onClose }: Props) {
  const btnRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await loadGoogleScript();
        if (cancelled) return;

        let attempts = 0;
        while (!(window as any).google && attempts < 20) {
          await new Promise(r => setTimeout(r, 150));
          attempts++;
        }

        if (!(window as any).google) {
          setError('Gagal memuat Google Sign-In. Periksa koneksi internet Anda.');
          setLoading(false);
          return;
        }

        (window as any).google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: any) => {
            const user = parseJwt(response.credential);
            if (user) onSuccess(user);
          }
        });

        // --- PERBAIKAN DI SINI ---
        // Kita matikan loading dulu supaya elemen <div> muncul di layar
        setLoading(false);

        // Beri jeda 100ms agar React sempat menggambar <div> sebelum Google merender tombol
        setTimeout(() => {
          if (btnRef.current && (window as any).google) {
            (window as any).google.accounts.id.renderButton(btnRef.current, {
              theme: dark ? 'filled_blue' : 'outline',
              size: 'large',
              width: '250'
            });
          }
        }, 100);
        // -------------------------

      } catch (err) {
        console.error('OAuth Init Error:', err);
        setError('Terjadi kesalahan teknis. Coba lagi nanti.');
        setLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [dark]); // Tambahkan [dark] agar tombol update saat ganti tema

  const bg = dark ? '#0A0A0A' : '#FAFAF8';
  const surface = dark ? '#141414' : '#FFFFFF';
  const border = dark ? 'rgba(201,168,76,0.15)' : 'rgba(0,0,0,0.08)';
  const text = dark ? '#F8F9FA' : '#212529';
  const muted = dark ? 'rgba(248,249,250,0.45)' : 'rgba(33,37,41,0.45)';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ width: '100%', maxWidth: 420, background: surface, border: `1px solid ${border}`, borderRadius: 8, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
        {/* Header */}
        <div style={{ padding: '28px 32px 24px', borderBottom: `1px solid ${border}`, position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: muted, lineHeight: 1 }}>×</button>

          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill={C.gold}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 20, background: `linear-gradient(135deg, ${C.goldLight}, ${C.gold})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              muda mudi
            </span>
          </div>

          <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 24, color: text, marginBottom: 8, letterSpacing: '-0.3px' }}>
            Masuk untuk Melanjutkan
          </h2>
          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 13, color: muted, lineHeight: 1.6 }}>
            Login dengan akun Google diperlukan untuk membuat reservasi dan menerima notifikasi status pemesanan Anda.
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 32px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          {/* Benefit list */}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
            {[
              { icon: '🔔', text: 'Notifikasi otomatis saat reservasi diproses' },
              { icon: '📋', text: 'Akses riwayat semua reservasi Anda' },
              { icon: '✅', text: 'Verifikasi email otomatis via Google' },
            ].map(b => (
              <div key={b.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 15 }}>{b.icon}</span>
                <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 12, color: muted }}>{b.text}</span>
              </div>
            ))}
          </div>

          {/* Google button container */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: muted }}>
              <div style={{ width: 18, height: 18, border: `2px solid ${C.gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              <span style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 12 }}>Memuat Google Sign-In...</span>
            </div>
          ) : error ? (
            <div style={{ width: '100%', padding: '12px 16px', background: 'rgba(231,76,60,0.08)', border: '1px solid rgba(231,76,60,0.2)', borderRadius: 4 }}>
              <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 12, color: '#e74c3c', lineHeight: 1.5 }}>{error}</p>
              {GOOGLE_CLIENT_ID.includes('GANTI') && (
                <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 11, color: muted, marginTop: 8, lineHeight: 1.5 }}>
                  ⚙️ <strong>Developer:</strong> Ganti <code>GOOGLE_CLIENT_ID</code> di <code>src/lib/googleAuth.ts</code> dengan Client ID dari Google Cloud Console Anda.
                </p>
              )}
            </div>
          ) : (
            <div ref={btnRef} style={{ minHeight: 44 }} />
          )}

          <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: 10, color: dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)', textAlign: 'center', lineHeight: 1.5 }}>
            Dengan masuk, Anda menyetujui penggunaan data email untuk keperluan reservasi dan notifikasi.
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
