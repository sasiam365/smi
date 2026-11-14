# ProttoyonBD — cPanel Node.js Testing Subdomain Deployment Guide

This guide provides complete, production-ready instructions for deploying **ProttoyonBD** on your cPanel subdomain:

- **Testing Domain**: `https://prottoyonbd.maltimarket.com`
- **Application Environment**: `testing`

---

## 1. Architectural Inspection & Compatibility Report

Before deployment, the project architecture has been audited and prepared for cPanel CloudLinux / Phusion Passenger hosting:

1. **Node.js Runtime & Native SQLite**:
   - The application uses Node.js's native `node:sqlite` (`DatabaseSync`), introduced in **Node.js 22.5.0+**.
   - **Requirement**: Select **Node.js 22.x** in cPanel "Setup Node.js App".
   - *Advantage*: Zero C++ compilation errors, zero `node-gyp` issues, and no external Python dependency during `npm install`.

2. **Bengali PDF Engine & Chromium**:
   - The PDF generator (`server/pdfGenerator.ts`) uses **Puppeteer Headless Chromium** with base64-embedded **Noto Sans Bengali** TrueType fonts.
   - *Compatibility Note*: On cPanel shared hosting, run `npx puppeteer browsers install chrome` once inside your project directory to download a lightweight, isolated Chromium build into `~/.cache/puppeteer/`.

3. **Reverse Proxy & HTTPS Trust**:
   - `server/app.ts` is configured with `app.set('trust proxy', 1)`.
   - Client IPs, HTTPS headers (`X-Forwarded-Proto`), and secure cookies (`SameSite=Lax; Secure`) are handled correctly behind cPanel's Apache / LiteSpeed reverse proxy.

4. **Data Isolation (Testing vs. Production)**:
   - When `APP_ENV=testing` or when accessed via `maltimarket.com`:
     - Database: `data/pottoyonbd_testing.sqlite` (isolated from production `pottoyonbd.sqlite`).
     - Attachments/Uploads: `storage_testing/attachments/` (isolated from production `storage/`).
     - Certificates/PDFs: `storage_testing/certificates/`.
     - Payment Gateways: Default to **Sandbox** mode (bKash, Nagad, Rocket, Sonali Bank).
     - Certificates: Watermarked with **`TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — বৈধ নয়`**.

---

## 2. Testing Configuration & Environment Variables

Add the following environment variables in the cPanel **Setup Node.js App** dashboard (under *Environment variables*):

| Variable Name | Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production caching & static serving |
| `APP_ENV` | `testing` | Enforces test data isolation & testing watermark |
| `APP_URL` | `https://prottoyonbd.maltimarket.com` | Base URL of the testing subdomain |
| `FRONTEND_URL` | `https://prottoyonbd.maltimarket.com` | Allowed frontend origin for CORS/CSRF |
| `QR_VERIFY_BASE_URL` | `https://prottoyonbd.maltimarket.com/verify` | Target URL embedded in all certificate QR codes |
| `POTTOYON_DB_PATH` | `data/pottoyonbd_testing.sqlite` | Isolated testing SQLite database path |
| `POTTOYON_STORAGE_DIR` | `storage_testing` | Isolated testing uploads & PDF directory |
| `POTTOYON_SESSION_SECRET` | `change_to_a_random_64_char_secret_key` | Secret for cookie/session HMAC signing |
| `POTTOYON_VERIFY_RATE_LIMIT` | `60` | Public QR verification rate limit (requests/min) |
| `PORT` | `3000` | Port passed to Node.js (or assigned by Passenger) |

---

## 3. Step-by-Step cPanel Deployment Instructions

### Step 1: Create the Subdomain in cPanel
1. In cPanel, navigate to **Domains** > **Domains** or **Subdomains**.
2. Click **Create A New Domain**.
3. Enter:
   - **Domain**: `prottoyonbd.maltimarket.com`
   - **Document Root**: `/home/YOUR_USER/prottoyonbd.maltimarket.com` (or uncheck "Share document root").
4. Ensure an SSL/TLS Certificate is installed (cPanel AutoSSL / Let's Encrypt) so `https://` is active.

### Step 2: Upload Files to the Subdomain Root
1. Upload the project files into the subdomain folder using cPanel **File Manager** or Git:
   - `server/` (Backend modules)
   - `src/` (Frontend React components & pages)
   - `public/` (Government seals, Bengali fonts in `public/fonts/`)
   - `server/fonts/` (Noto Sans Bengali fonts)
   - `app.js` (cPanel startup entry file)
   - `server.js` (Alternative startup entry file)
   - `server.ts` (Full-stack Express server)
   - `package.json`, `package-lock.json` (or `bun.lock`), `tsconfig.json`, `vite.config.ts`
   - `.env` (Containing the testing variables above)

### Step 3: Create the Node.js Application in cPanel
1. In cPanel, go to **Setup Node.js App** (under the *Software* category).
2. Click **Create Application**.
3. Fill in the fields:
   - **Node.js version**: Select **22.x** (or 20.x).
   - **Application mode**: `Production`.
   - **Application root**: `prottoyonbd.maltimarket.com` (the folder where files were uploaded).
   - **Application URL**: `prottoyonbd.maltimarket.com`.
   - **Application startup file**: `app.js` (or `server.js`).
4. Click **Create**.

### Step 4: Install Dependencies, Chrome, & Build Assets
1. Once the application is created, copy the virtual environment command shown at the top of the cPanel Node.js App page (e.g., `source /home/YOUR_USER/nodevenv/prottoyonbd.maltimarket.com/22/bin/activate && cd /home/YOUR_USER/prottoyonbd.maltimarket.com`).
2. Open the cPanel **Terminal** (or connect via SSH) and paste that command.
3. Run the following commands:
   ```bash
   # 1. Install npm dependencies
   npm install

   # 2. Install headless Chromium for PDF generation
   npx puppeteer browsers install chrome

   # 3. Build frontend SPA and bundled backend server
   npm run build
   ```
4. Verify that the build succeeded:
   - `dist/index.html` exists.
   - `dist/server.js` exists.
   - `data/` and `storage_testing/` directories are writable.

### Step 5: Add Environment Variables & Restart
1. Back in cPanel **Setup Node.js App**, scroll down to **Environment variables**.
2. Add each variable from Section 2 above (`APP_ENV=testing`, `APP_URL`, `FRONTEND_URL`, `QR_VERIFY_BASE_URL`, etc.).
3. Click the **Restart** button at the top of the Node.js App page.

---

## 4. Live Verification Checklist

Perform these checks on `https://prottoyonbd.maltimarket.com` to verify deployment:

1. **Subdomain Loading**:
   - Visit `https://prottoyonbd.maltimarket.com`.
   - Confirm the 3-zone government header, Union Parishad portal selector, notices, and footer load over HTTPS.

2. **Administrative Login**:
   - Click the **লগইন** button.
   - Switch to **দাপ্তরিক কর্মকর্তা / প্রশাসক** tab.
   - Log in using one of the configured admin roles (e.g. `md.unus.ali` / Goyeshpur UP Chairman or `supervisor`).

3. **Certificate QR Verification**:
   - Navigate to `https://prottoyonbd.maltimarket.com/verify/10275626255`.
   - Confirm the certificate verification screen opens, validates against the testing database, and clearly displays:
     `TESTING — NOT VALID / পরীক্ষামূলক সংস্করণ — টেস্ট পরিবেশের ডাটা`.

4. **Bengali PDF Download**:
   - Preview or download an issued certificate.
   - Confirm the downloaded PDF displays:
     - Clear, unbroken Bengali Unicode text shaped with **Noto Sans Bengali**.
     - All conjuncts (`যুক্তাক্ষর`), vowel signs (*কার*), and consonants (*ফলা* & *রেফ*) aligned correctly.
     - Symmetrical double border and official watermark.
     - Scannable QR code resolving to `https://prottoyonbd.maltimarket.com/verify/{token}`.
     - Prominent **`TESTING — NOT VALID`** banner across the certificate.

5. **Storage & Database Isolation**:
   - Check file manager to verify that `data/pottoyonbd_testing.sqlite` and `storage_testing/` are being populated.
   - Verify that production databases and records remain completely untouched.
