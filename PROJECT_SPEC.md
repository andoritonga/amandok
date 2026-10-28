# Technical Specification: AmanDok — Zero-Upload Document Privacy & Preparation Toolkit

## 1. Understanding Summary
- **Product Name & Domain:** **AmanDok** (`dokumen.ritonga.ai.id` / `privasi.ritonga.ai.id`)
- **Repository Path:** `/home/workspace/workspace/ando/amandok`
- **What is Being Built:** A zero-login, 100% client-side document security and preparation web application tailored for Indonesian users.
- **Why It Exists:** Citizens, job applicants (CPNS/BUMN/private sector), and banking/property customers frequently need to submit scans of sensitive identity documents (KTP, KK, NPWP, Ijazah, Pasfoto) but face two major risks: (1) identity theft/illegal *pinjol* abuse from unwatermarked KTPs, and (2) privacy leaks from uploading sensitive IDs to third-party online image/PDF tools.
- **Target Users:** General public, job seekers, HR/admin staff, and privacy-conscious users across Indonesia (mobile & desktop).
- **MVP Feature Scope:**
  1. **Watermark KTP & Dokumen Aman:** Customizable verification text presets (*"HANYA UNTUK VERIFIKASI [INSTANSI] - [TANGGAL]"*), single stamp or tiled pattern modes, color/opacity/angle/size controls, plus image rotation & cropping.
  2. **Sensor / Redaksi Data Sensitif:** Interactive region/brush redaction (*Pixelate*, *Blur*, *Solid Blackout*) to mask NIK, signatures, account balances, or barcodes with Undo/Redo support.
  3. **Kompresor & Resizer Target KB & Pasfoto:** Automated binary-search image compression to hit strict portal file size limits (`<100 KB`, `<200 KB`, `<300 KB`, `<500 KB`) plus Indonesian pasfoto ratio presets (`3x4`, `4x6`, `1:1`) and automatic EXIF/GPS metadata stripping.
  4. **Gabung & Konversi Gambar ke PDF (`pdf-lib`):** Combine multiple watermarked/compressed images and existing PDFs into a single clean PDF document directly in browser memory.
- **Explicit Non-Goals (MVP):**
  - No digital signature drawing or e-Materai placement in v1.
  - No user accounts, backend databases, or cloud file storage.
  - No external AI/OCR API calls that transmit user documents over the network.

---

## 2. Assumptions & Non-Functional Requirements
- **Performance:** Real-time `<100ms` canvas preview for watermarks and redactions; `<2s` for target-KB binary-search compression and multi-page PDF generation on standard mobile and desktop browsers.
- **Scale & Traffic:** Static edge delivery via Cloudflare Workers / Pages with 100% client-side compute allows unlimited concurrent users at near-zero server cost.
- **Security & Privacy:** Strict `Content-Security-Policy` headers (`public/_headers`), automatic camera EXIF/GPS metadata stripping on canvas export, and an explicit UI "Zero-Upload Privacy Shield" indicator.
- **Reliability & Memory Safety:** Full offline capability once loaded; automatic `2400px` max-dimension normalization to prevent mobile Safari canvas memory crashes; explicit `URL.revokeObjectURL` cleanup on reset.
- **Maintainability:** Built with Astro, React (Interactive Studio Island), TypeScript (Strict), Tailwind CSS, Lucide Icons, and `pdf-lib`. Bilingual support (`ID` default / `EN`).

---

## 3. Decision Log
| ID | Decision | Alternatives Considered | Rationale |
|----|----------|-------------------------|-----------|
| **D1** | Build a **Zero-Login Public Utility Web App** | B2B Internal Tool, Personal Tracker | Maximizes public impact, shareability, and complements `gaji.ritonga.ai.id` in the portfolio. |
| **D2** | **AmanDok** with 4 core client-side tools (Watermark, Redact, Target-KB Compress, PDF Merge) | Full PDF/Signature suite with e-Materai | Focuses on the highest-frequency Indonesian document pain points while respecting YAGNI. |
| **D3** | **Astro + React Interactive Studio + Native HTML5 Canvas + `pdf-lib`** | Heavy SPA with Fabric.js/WASM; or Vanilla DOM scripts | Balances fast static load, clean state management for the chained in-memory pipeline, and lightweight bundle size for Cloudflare Workers/Pages. |

---

## 4. Final Architecture & Technical Design

### 4.1 Project Structure (`/home/workspace/workspace/ando/amandok`)
```text
amandok/
├── public/
│   ├── _headers                  # Strict CSP & security headers for Cloudflare Edge
│   ├── favicon.svg               # AmanDok shield icon
│   └── robots.txt
├── src/
│   ├── components/
│   │   ├── AmanDokStudio.tsx     # Unified interactive workspace + In-Memory Document Pipeline
│   │   ├── Navbar.astro          # Brand header, Zero-Upload badge, ID/EN language toggle
│   │   └── Footer.astro          # Privacy guarantee & portfolio links
│   ├── layouts/
│   │   └── Layout.astro          # Base HTML5 shell, SEO meta, SoftwareApplication JSON-LD
│   ├── pages/
│   │   ├── index.astro           # Main application page
│   │   └── 404.astro             # Edge 404 diagnostic page
│   ├── styles/
│   │   └── global.css            # Tailwind directives & custom canvas styles
│   └── utils/
│       ├── imageProcessor.ts     # Watermark, Redaction, EXIF strip & Binary-Search KB Compressor
│       └── pdfBuilder.ts         # Client-side image/PDF merger using pdf-lib
├── astro.config.mjs
├── package.json
├── tailwind.config.mjs
├── tsconfig.json
└── wrangler.jsonc                # Cloudflare Workers Static Assets deployment config
```

### 4.2 In-Memory Chained Pipeline (`DocumentPipeline`)
1. **Load & Normalize:** User selects or drops an image (`JPG`, `PNG`, `WEBP`). Image is decoded in browser memory, normalized to a safe max working dimension (`2400px`), and stripped of EXIF/GPS metadata.
2. **Step-by-Step or Direct Tooling:**
   - **Tab 1 — Watermark KTP/Dokumen:** Renders customizable verification text (single or tiled grid, custom date, purpose, color, opacity, angle, font size, rotation).
   - **Tab 2 — Sensor Data (Redaksi):** Draws rectangular or brush masks (*Pixelate*, *Blur*, *Blackout*) with an Undo stack.
   - **Tab 3 — Kompresor & Pasfoto:** Runs binary-search quality & scale optimization to hit `<100KB`, `<200KB`, `<300KB`, or `<500KB`, plus `3x4` / `4x6` / `1:1` crop presets.
   - **Tab 4 — Gabung ke PDF:** Collects processed images (sent directly from Tabs 1–3 via *"Tambahkan ke Antrean PDF"* or uploaded directly) and merges them into a downloadable PDF file with `pdf-lib`.
3. **One-Click Memory Wipe:** Clears all in-memory blobs, canvas buffers, and object URLs immediately.
