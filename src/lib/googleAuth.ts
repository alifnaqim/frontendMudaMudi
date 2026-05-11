// ============================================================
// src/lib/googleAuth.ts
// Google OAuth 2.0 helper — menggunakan Google Identity Services (GSI)
// Dokumentasi: https://developers.google.com/identity/gsi/web
// ============================================================

export interface GoogleUser {
  id: string;       // sub dari JWT
  name: string;
  email: string;
  avatar: string;   // picture URL dari Google
  given_name: string;
}

// ── Ganti dengan Client ID dari Google Cloud Console Anda ──
// Cara mendapatkan:
// 1. Buka https://console.cloud.google.com
// 2. Buat project baru → APIs & Services → Credentials
// 3. Create OAuth 2.0 Client ID → Web application
// 4. Authorized JS origins: http://localhost:5173
// 5. Copy "Client ID" ke sini
export const GOOGLE_CLIENT_ID = '290644898426-05g2qbpj96b9ffr4qlbclll2910dgfgu.apps.googleusercontent.com'

// Parse JWT credential dari Google tanpa library eksternal
export function parseJwt(token: string): GoogleUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(json);
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      avatar: payload.picture,
      given_name: payload.given_name,
    };
  } catch {
    return null;
  }
}

// Simpan & ambil user dari localStorage
export function saveGoogleUser(user: GoogleUser) {
  localStorage.setItem('mm_google_user', JSON.stringify(user));
}
export function getGoogleUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem('mm_google_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function clearGoogleUser() {
  localStorage.removeItem('mm_google_user');
}

// Inject Google GSI script ke <head> jika belum ada
export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById('google-gsi-script')) { resolve(); return; }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}
