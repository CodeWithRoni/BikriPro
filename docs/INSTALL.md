# Installing BikriPro at a shop

**Recommended: cloud setup.** Everything already runs on Supabase ([SUPABASE.md](SUPABASE.md)), so every device just needs the BikriPro app (or a browser) and internet. Skip to section 2.

## 1. Offline option: server PC in the shop

Use this only if the shop has unreliable internet and you want everything on a local PC.

1. Install **PostgreSQL 16** for Windows from postgresql.org (remember the `postgres` password).
2. Create a database named `bikripro` (pgAdmin → Databases → Create).
3. Install BikriPro (`BikriPro-Setup-x.y.z.exe`) and open it once.
4. **File → Server settings…**: set `EMBEDDED_SERVER=1` and
   `DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@127.0.0.1:5432/bikripro`. Save, then **File → Restart server**.
5. On start the server creates all tables and the first admin user automatically.
6. Sign in with **admin / admin123**, then immediately change the password and the security PIN (default **1234**).
7. Allow port **5000** through Windows Firewall (Private networks) so other devices can connect, and give the PC a fixed IP in your router (e.g. `192.168.0.10`).

## 2. Other tills (Windows/macOS/Linux)

Install the same installer. It connects to the BikriPro cloud server automatically. For the offline option, tap **Server** on the login screen and enter `http://192.168.0.10:5000`.

## 3. Android / iPhone / iPad

Install the APK (or the iOS build). If needed, tap **Server** on the login screen and enter the server address.
Phones can also open the web app (GitHub Pages `/app/`) in Chrome/Safari and “Add to Home screen”.

## 4. Hardware

- **Barcode scanner**: any USB/Bluetooth scanner in keyboard mode — scan into the POS search box.
- **Receipt printer**: 80 mm or 58 mm thermal printer installed as a normal printer; set the width in Shop Setup → Shop info. Use **Complete & Print** (F10).
- **Label printer**: thermal label printers (e.g. Xprinter, TSC) — choose the label size in Barcode Labels; use A4 sticker sheets for laser/inkjet printers.

## 5. SMS

Buy an SMS package from a Bangladeshi gateway and add these as Edge Function secrets in Supabase (Edge Functions → Secrets), or in `backend/.env` for a self-hosted server:

```
SMS_PROVIDER=bulksmsbd          # or "generic" for a JSON POST API
SMS_API_URL=https://bulksmsbd.net/api/smsapi
SMS_API_KEY=your-key
SMS_SENDER_ID=your-sender-id
```

Until then, SMS are only recorded (Report Hub → SMS log). Birthday wishes run every day at 10:00 (Asia/Dhaka).

## 6. Backups

Shop Setup → Backup & Reset → **Export database** downloads a `.json` backup. Do it daily/weekly and keep copies on a USB drive or Google Drive. Restoring needs the admin role and the security PIN.
