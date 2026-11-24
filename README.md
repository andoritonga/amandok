# AmanDok - Client-Side Document Privacy & Preparation Studio

**AmanDok** adalah aplikasi web gratis tanpa iklan yang berjalan **100% di peramban (Client-Side / Zero-Upload)** untuk melindungi dan menyiapkan dokumen identitas sensitif (KTP, KK, NPWP, Ijazah, Surat Lamaran) sebelum dikirim secara daring ke aplikasi pinjaman, fintech, rekrutmen CPNS/BUMN/perusahaan, maupun keperluan administrasi sewa.

Seluruh proses manipulasi gambar, *watermarking*, penyensoran piksel, kompresi target ukuran KB, hingga penggabungan PDF berjalan secara lokal di memori peramban menggunakan HTML5 Canvas API dan `pdf-lib`, sehingga nol byte data dokumen dikirim ke server mana pun.

---

## Fitur Utama

### 1. Watermark KTP Pintar (Anti-Penyalahgunaan)
- **Preset Instan:** Verifikasi Fintech/Bank, Daftar Kerja/HRD, Verifikasi E-Wallet, atau Sewa Kost/Properti dengan cap tanggal otomatis hari ini (`DD MMM YYYY`).
- **Dual Mode:**
  - *Single Diagonal:* Teks watermark miring di tengah dokumen dengan rotasi yang dapat disesuaikan (`-60°` s/d `60°`).
  - *Tiled Pattern:* Pola berulang di seluruh kanvas untuk mencegah pemotongan (*cropping*) oleh pihak yang tidak bertanggung jawab.
- **Kustomisasi Presisi:** Teks 2 baris (tujuan & tanggal), ukuran huruf, ketebalan/opasitas, rotasi, serta 6 pilihan warna (Hitam Arsip, Merah Dokumen, Biru Tinta, Hijau Segel, Abu Slate, Putih Bersih).

### 2. Sensor & Tutup NIK / Data Pribadi (Redaction)
- **Sensor Interaktif:** Klik & seret langsung di atas kanvas dokumen (mendukung mouse dan sentuhan layar) untuk menandai area sensitif seperti NIK 16 digit, Alamat, atau Tanda Tangan.
- **Gaya Penyensoran Permanen:** Blok Solid Hitam, Blok Putih, atau Pixelate Permanen (menghancurkan piksel asli secara permanen saat diekspor ke PNG/JPEG agar tidak bisa dibalikkan).
- **Pintasan Cepat:** Tambah kotak sensor tepat di posisi standar NIK KTP atau area Tanda Tangan dengan satu klik, serta kontrol hapus per kotak atau bersihkan semua.

### 3. Kompresor Target Ukuran KB & Rasio Pas Foto
- **Target Otomatis Cerdas:** Pilih batas ukuran (`<= 100 KB`, `<= 200 KB`, `<= 500 KB`, atau `<= 1 MB`) untuk memenuhi syarat portal SSCASN CPNS, Rekrutmen BUMN, atau formulir unggah ketat lainnya. Algoritma *binary search* menyesuaikan rasio kompresi JPEG dan skala resolusi secara berulang hingga tepat di bawah batas target.
- **Crop & Bingkai Pas Foto:** Bebas (Asli), Rasio `3:4` (Pas Foto standar dengan opsi warna latar Merah `#D91E18`, Biru `#0052CC`, atau Putih `#FFFFFF`), serta rasio KTP `1.58:1`.
- **Perbandingan Metrik Lokal:** Menampilkan ukuran asli vs hasil kompresi, persentase penghematan, serta resolusi akhir.

### 4. Gabung Banyak Gambar ke PDF
- **Penggabung Lokal (`pdf-lib`):** Tambahkan beberapa dokumen sekaligus (misalnya KTP + KK + Ijazah), urutkan naik/turun atau hapus item, lalu gabungkan menjadi 1 dokumen PDF.
- **Pilihan Tata Letak Cetak:**
  - *A4 Portrait:* Satu dokumen terpusat per halaman A4.
  - *A4 Kartu Identitas (2 per halaman):* Menggabungkan dua kartu (seperti KTP + KK atau tampak depan & belakang) sejajar vertikal dalam 1 halaman A4.
  - *Sesuai Ukuran Gambar:* Halaman PDF mengikuti rasio aspek dan resolusi asli setiap gambar.

---

## Arsitektur Teknis & Privasi (Zero-Upload)

- **Framework:** [Astro](https://astro.build/) v4 + [React](https://react.dev/) 18 + [TypeScript](https://www.typescriptlang.org/) + [Tailwind CSS](https://tailwindcss.com/)
- **Pemrosesan Gambar:** HTML5 `<canvas>` 2D context untuk merender gambar dengan resolusi terkelola (`MAX_CANVAS_DIM = 2400px`) serta membersihkan EXIF GPS/kamera saat ekspor.
- **Pembuatan PDF:** [pdf-lib](https://pdf-lib.js.org/) sepenuhnya di peramban.
- **Isolasi Memori Sesi:** Tidak menggunakan `localStorage` atau `IndexedDB` untuk menyimpan gambar dokumen. Tombol **"Kosongkan Meja"** mencabut seluruh Object URLs dan membersihkan buffer kanvas dari memori.
- **Kebijakan Keamanan Konten (CSP):** Memblokir koneksi eksternal yang tidak diperlukan untuk memastikan proses tetap berjalan di perangkat pengguna.

---

## Pengembangan Lokal

```bash
# Masuk ke direktori proyek
cd amandok

# Instal dependensi
npm install

# Jalankan server pengembangan
npm run dev

# Cek tipe & bangun berkas statis (./dist)
npm run build
```

---

## Catatan

Proyek ini dibuat sebagai alat bantu publik untuk mengurangi risiko penyalahgunaan data kependudukan di era digital. Pengembang tidak mengumpulkan, menyimpan, atau memiliki akses terhadap dokumen apa pun yang Anda proses di AmanDok.
