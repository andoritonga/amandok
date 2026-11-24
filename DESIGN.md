# DESIGN.md - AmanDok Studio Privasi Dokumen

## Design Read

Reading this as: Client-side document privacy studio for Indonesian citizens & job applicants, in a Frosted Glacier & Obsidian Emerald Liquid Glass language, dial `ENERGY 2 / RHYTHM 2 / MOTION 2`.

- **Referent:** Instrumen kaca optik modern (*Frosted Glacier* pada mode terang, *Obsidian Emerald* pada mode gelap) di atas meja arsip dokumen digital yang lapang dan berstruktur jelas.
- **Dial Settings:** `ENERGY 2 / RHYTHM 2 / MOTION 2`
  - **ENERGY 2 (Balanced & Optical):** Kedalaman bertingkat antara panggung latar ambient dan kartu kaca mengambang berlapis tepi spekular tipis serta sorotan zamrud optik yang terukur.
  - **RHYTHM 2 (Floating Canvas-First):** Panggung kanvas dokumen mendominasi ruang kerja; header, dock pil alat, dan panel inspektor melayang sebagai unit terpisah dengan alur responsif 3 ukuran layar.
  - **MOTION 2 (Refractive & Responsive):** Transisi skala/kecerahan halus (`160ms cubic-bezier`) saat berinteraksi dengan tombol pil dan kontrol kaca, otomatis berhenti bila `prefers-reduced-motion: reduce` aktif.
- **R-37 Owner Override:**
  - `R-37 Override (R-10 Glassmorphism)`: Pemilik proyek secara eksplisit memilih **Full Floating Liquid Glass** pada header, dock alat, panel inspektor, frame kanvas, dan dialog privasi untuk identitas tema utama.

## Color & Optical Tokens

- **Light (Default - Frosted Glacier):**
  - Panggung dasar: `#e6f0f2` dengan gradien kedalaman zamrud-biru halus (`12%-14%` alpha)
  - Panel kaca (`.glass-panel`, `.glass-bar`): `rgba(255, 255, 255, 0.78)` - `0.82` + `backdrop-filter: blur(22px-24px) saturate(170%)` + tepi spekular atas `rgba(255, 255, 255, 0.95)`
  - Teks utama `#0b1727`, teks sekunder `#24364b`, teks muted `#3d5269`, aksen primer solid `#047857` (kontras WCAG AA `>= 4.5:1`), bahaya `#9f1239`
- **Dark (Obsidian Emerald):**
  - Panggung dasar: `#060d17` dengan gradien kedalaman obsidian-zamrud halus
  - Panel kaca (`.glass-panel`, `.glass-bar`): `rgba(12-13, 20-22, 34-36, 0.78-0.82)` + `backdrop-filter: blur(22px-24px) saturate(170%)` + tepi spekular atas `rgba(255, 255, 255, 0.22)`
  - Teks utama `#f4f9fc`, teks sekunder `#d0dfec`, teks muted `#9db2c8`, aksen primer solid `#10b981` (teks gelap `#04130e`, kontras WCAG AA `>= 4.5:1`), bahaya `#fda4af`
- **Typography:** `Plus Jakarta Sans` tunggal dengan `tabular-nums` pada angka ukuran byte, dimensi piksel, dan persentase kompresi.

## Rationale Rules (R-31)

- **Ambient Depth Stage (`.liquid-stage`):** Memberi lapisan cahaya halus di belakang kaca agar refraksi `backdrop-filter` terlihat nyata tanpa menimbulkan kebisingan visual.
- **High-Alpha Optical Glass (`.glass-panel`, `.glass-bar`):** Menjaga transmisi kaca tetap terasa hidup sekaligus menjamin kontras teks `>= 4.5:1` pada kedua tema.
- **Directional Specular Rim & Inner Well (`.glass-well`):** Sorotan 1px di sisi atas kartu mensimulasikan ketebalan tepi kaca fisik, sedangkan `.glass-well` memisahkan kelompok kontrol di dalam inspektor.
- **Floating Canvas-First Dock:** Memindahkan navigasi dari dinding sidebar ke dock pil mengambang memberi porsi ruang kanvas dokumen lebih luas di semua ukuran layar.
- **Touch & Semantic Accessibility:** Seluruh tombol, pil, swatch warna, dan slider (`.studio-range`) menjaga ukuran sentuh minimum `44x44px`, jarak aman `>= 6px`, label eksplisit, focus ring terlihat, dan `0` karakter em dash (`\u2014`).
