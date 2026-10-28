# 🛡️ AmanDok — Toolkit Privasi KTP & Persiapan Dokumen 100% Lokal (Zero-Upload)

[![Live App](https://img.shields.io/badge/Live_App-dokumen.ritonga.ai.id-10B981?style=for-the-badge)](https://dokumen.ritonga.ai.id)
[![Architecture](https://img.shields.io/badge/Privacy-100%25_Client--Side_Zero_Upload-0EA5E9?style=for-the-badge)](#arsitektur-keamanan-zero-upload)
[![Tech Stack](https://img.shields.io/badge/Stack-Astro_5_%2B_React_%2B_TypeScript_%2B_pdf--lib-F59E0B?style=for-the-badge)](#teknologi)

**AmanDok** ([dokumen.ritonga.ai.id](https://dokumen.ritonga.ai.id)) adalah aplikasi web *100% client-side* untuk melindungi dokumen identitas masyarakat Indonesia (KTP, KK, NPWP, Ijazah) dari risiko penyalahgunaan data (seperti pinjol ilegal atau pencurian identitas) sekaligus menyiapkan ukuran berkas sesuai syarat portal rekrutmen (SSCASN/CPNS, BUMN, HRD, dan Bank).

> **Jaminan Privasi Mutlak:** Tidak ada satu byte pun gambar atau PDF yang dikirim ke server. Seluruh proses manipulasi piksel dan pembuatan PDF berlangsung di dalam memori RAM browser perangkat pengguna (`HTML5 Canvas 2D API` & `pdf-lib`). Aplikasi tetap berfungsi penuh meskipun koneksi internet/Wi-Fi dimatikan setelah halaman dimuat.

---

## ✨ Fitur Utama (4-in-1 Studio Pipeline)

1. **01 • Watermark KTP & Dokumen Anti-Pinjol (`Tiled`, `Single Stamp`, `Banner`)**
   - Template cepat siap pakai (*Verifikasi Bank/KPR*, *Lamaran Kerja HRD*, *Seleksi CPNS/BUMN*, *Sewa Properti/Kos*).
   - Pengaturan teks utama, subteks tanggal otomatis, warna tinta keamanan, kemiringan sudut (`-55°` s/d `55°`), transparansi, kerapatan grid, dan bingkai pelindung mikro.
2. **02 • Sensor & Redaksi Data Sensitif (Penghancuran Piksel Permanen)**
   - Klik & seret langsung pada pratinjau dokumen atau gunakan tombol cepat (*Sensor Baris NIK*, *Sensor Tanda Tangan*, *Sensor Nomor Rumah*, *Sensor Wajah*).
   - 4 mode penghancuran raster permanen: **Mozaik Piksel (`Pixelate`)**, **Blur Halus (`Gaussian Blur`)**, **Blok Hitam (`Blackout`)**, dan **Blok Putih (`Whiteout`)** yang tidak bisa di-*unblur*.
3. **03 • Kompresor Target KB Presisi & Pemotong Rasio Pasfoto**
   - Algoritma *Binary Search JPEG Quality + Progressive Scaling* untuk mengejar batas ukuran file ketat portal Indonesia: **≤ 100 KB**, **≤ 200 KB**, **≤ 300 KB**, **≤ 500 KB**, atau kustom.
   - Pemotong rasio otomatis: **KTP Standar**, **Pasfoto 3×4**, **4×6**, **1×1**, serta opsi warna latar belakang merah (`#dc2626`), biru (`#0284c7`), atau putih.
4. **04 • Penggabung Gambar & Berkas ke PDF (`pdf-lib`)**
   - Susun KTP + NPWP dalam **1 halaman A4 (2 Kartu/Halaman)**, **A4 Standar (1 Dokumen/Halaman)**, atau ukuran asli gambar tanpa keluar dari browser.
5. **Pembersih Otomatis Metadata EXIF & GPS**
   - Setiap foto dokumen yang dimuat otomatis melewati proses *canvas re-encoding* yang menghapus koordinat lokasi GPS rumah, seri perangkat, dan jam pemotretan kamera.

---

## 🔒 Arsitektur Keamanan Zero-Upload

- **Strict Content Security Policy (`public/_headers`):** Membatasi `connect-src 'self'` untuk memastikan tidak ada skrip atau koneksi jaringan keluar yang dapat mengirim dokumen keluar dari browser.
- **In-Memory Pipeline Chaining:** Hasil dari Tab Watermark otomatis diteruskan ke Tab Sensor, Tab Kompresor KB, hingga Antrean PDF tanpa perlu mengunduh dan mengunggah ulang berkas berulang kali.
- **Simulasi KTP Instan:** Dilengkapi generator KTP sintetis di memori browser sehingga pengguna dapat langsung menguji seluruh fitur tanpa harus mengunggah KTP asli terlebih dahulu.

---

## 🛠️ Teknologi

- **Framework:** [Astro 5](https://astro.build/) + [React 18](https://react.dev/)
- **Bahasa:** TypeScript (`strict`)
- **Styling:** Tailwind CSS + Custom Security Vault Theme (`Plus Jakarta Sans` & `JetBrains Mono`)
- **Mesin Dokumen Lokal:** HTML5 Canvas 2D API & [`pdf-lib`](https://pdf-lib.js.org/)
- **Deployment & CI/CD:** GitHub Actions + Cloudflare Workers (`dokumen.ritonga.ai.id`)

---

## 🚀 Menjalankan Secara Lokal

```bash
# 1. Instal dependensi
npm install

# 2. Jalankan server pengembangan lokal
npm run dev

# 3. Verifikasi tipe TypeScript & bangun produksi
npm run build
```

---

## 👨‍💻 Pengembang

Dirancang dan dikembangkan oleh **[Aliando Ritonga](https://ritonga.ai.id)**.
