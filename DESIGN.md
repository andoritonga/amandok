# DESIGN.md - AmanDok Studio Privasi Dokumen

## Design Read

- **Referent:** Meja arsip dokumen sipil dan ruang gelap (*archive drafting desk* / *document darkroom*) yang tenang, presisi, dan mudah diaudit sekilas tanpa gimmick dekoratif.
- **Dial Settings:** `ENERGY 2 / RHYTHM 2 / MOTION 1`
  - **ENERGY 2 (Calm & Authoritative):** Permukaan datar tanpa orb blur mengambang, tanpa gradasi tombol dekoratif, dan tanpa warna neon; otoritas dibangun lewat tipografi rapi dan batas panel yang tegas.
  - **RHYTHM 2 (Structured Utility):** Kontainer meja dokumen tetap mendominasi viewport desktop sementara panel alat di kanan memiliki ritme kontrol yang konsisten, jelas antara grup primer, sekunder, dan aksi bahaya.
  - **MOTION 1 (Instant & Tactile):** Transisi fokus hanya pada umpan balik klik (`active:scale`) dan perubahan mode yang terasa langsung; tanpa animasi masuk bertahap (*staggered entrance*) atau denyut (*pulse*) konstan yang mengganggu saat mengedit dokumen.
- **Palette & Surfaces:**
  - **Light (Default - Kertas Arsip):** Kanvas `#f1f5f9`, kartu/panel `#ffffff`, alas dokumen `#e2e8f0`, teks utama `#0f172a`, teks sekunder `#334155`, aksen primer solid `#047857` (kontras >= 5.4:1 dengan teks `#ffffff`), bahaya `#be123c`.
  - **Dark (Kamar Gelap):** Kanvas `#090d16`, kartu/panel `#111827`, alas dokumen `#060911`, teks utama `#f8fafc`, teks sekunder `#cbd5e1`, aksen primer solid `#10b981` (kontras >= 8.2:1 dengan teks `#090d16`), bahaya `#e11d48`.
- **Typography:** `Plus Jakarta Sans` sebagai font tunggal untuk UI dan kontrol numerik (memakai `tabular-nums` untuk ukuran byte, dimensi, dan nilai persentase agar kolom stabil tanpa memuat font kedua).

## Rationale Rules (R-31)

- `R-01 / Zero Slop Visuals`: Dihapus seluruh `"Cyber-Vault"`, orb blur, dot-grid latar, kartu gradien, ikon Sparkles/pulses, dan strip samping kiri agar ruang kerja terasa seperti instrumen privasi lokal yang serius.
- `R-02 / Zero Em Dash`: Seluruh teks UI, metadata HTML, manifest PWA, OG SVG, PDF producer metadata, README, dan spesifikasi bebas dari karakter em dash (`\u2014`).
- `R-03 / Responsive 3-State Studio`: Desktop (`>=1024px`) memakai 3-pane workspace tanpa scroll halaman; Tablet (`768px-1023px`) memakai bar alat horizontal di atas 2 kolom; Mobile (`<768px`) memakai alur 1 kolom dengan dock kontrol di bawah.
- `R-04 / Target Tap & Accessibility`: Semua tombol, swatch warna, slider (`min-h-[44px]`), dan tautan memiliki hit area `>= 44x44px`, jarak aman `>= 6px`, label terhubung (`htmlFor`), focus ring `:focus-visible`, dan dialog aksesibel (`role="dialog"`, `Escape`, focus trap).
- `R-05 / Dual Theme Contrast`: Warna dipilih dengan token CSS `:root` (Kertas Arsip) dan `html.dark` (Kamar Gelap) mengikuti preferensi sistem awal dan tersinkron di seluruh studio, navbar, footer, dan `/404`.
