# Installing BikriPro at a shop

A typical shop has **one server PC** (keeps the database) and any number of tills, tablets and phones that connect to it over the shop's Wi-Fi/LAN.

## 1. Server PC (Windows)

1. **Install MySQL or MariaDB**
   - Easiest: [MariaDB for Windows](https://mariadb.org/download/) (MSI). During setup choose a root password and tick “Run as a service”.
2. **Create the database user** (open “MySQL Client” / HeidiSQL and run):
   ```sql
   CREATE DATABASE bikripro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'bikripro'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
   GRANT ALL ON bikripro.* TO 'bikripro'@'localhost';
   FLUSH PRIVILEGES;
   ```
3. **Install BikriPro** (`BikriPro-Setup-x.y.z.exe`) and open it once. It creates its settings file.
4. In BikriPro choose **File → Server settings…** and set `DB_PASSWORD` (and `DB_USER` if different). Save, then **File → Restart server**.
5. On start the server creates all tables and the first admin user automatically (and safely skips this on later starts).
6. Sign in with **admin / admin123**, then immediately change the password and the security PIN (default **1234**).
7. Allow port **5000** through Windows Firewall (Private networks) so other devices can connect.
8. Find the PC's IP address (`ipconfig` → IPv4, e.g. `192.168.0.10`). Give it a fixed IP in your router so it never changes.

## 2. Other tills (Windows/macOS/Linux)

Install the same installer. In **File → Server settings…** set `EMBEDDED_SERVER=0`, restart the app, then on the login screen tap **Server** and enter `http://192.168.0.10:5000`.

## 3. Android / iPhone / iPad

Install the APK (or the iOS build), open it, tap **Server** on the login screen and enter `http://192.168.0.10:5000`.
Phones on the same Wi-Fi can also simply open `http://192.168.0.10:5000` in Chrome/Safari and “Add to Home screen”.

## 4. Hardware

- **Barcode scanner**: any USB/Bluetooth scanner in keyboard mode — scan into the POS search box.
- **Receipt printer**: 80 mm or 58 mm thermal printer installed as a normal printer; set the width in Shop Setup → Shop info. Use **Complete & Print** (F10).
- **Label printer**: thermal label printers (e.g. Xprinter, TSC) — choose the label size in Barcode Labels; use A4 sticker sheets for laser/inkjet printers.

## 5. SMS

Buy an SMS package from a Bangladeshi gateway and fill in `backend/.env` (or the desktop server settings):

```
SMS_PROVIDER=bulksmsbd          # or "generic" for a JSON POST API
SMS_API_URL=https://bulksmsbd.net/api/smsapi
SMS_API_KEY=your-key
SMS_SENDER_ID=your-sender-id
```

Until then, SMS are only recorded (Report Hub → SMS log). Birthday wishes run every day at 10:00 (Asia/Dhaka).

## 6. Backups

Shop Setup → Backup & Reset → **Export database** downloads a `.json` backup. Do it daily/weekly and keep copies on a USB drive or Google Drive. Restoring needs the admin role and the security PIN.
