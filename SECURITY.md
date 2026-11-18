# Security policy

BikriPro handles shop sales, customer phone numbers and money balances, so security reports are taken seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it and the impact. You will get a reply within 7 days.

## How BikriPro protects data

- Database tables have Row Level Security enabled with no policies, and Supabase's public API roles have no access — only the BikriPro API can read or write shop data.
- Passwords and the security PIN are bcrypt-hashed. Login tokens are signed with a random secret generated inside the database and never sent to apps or backups.
- Admin / Manager / Cashier roles are enforced on every API route; restore and reset need the admin role, the security PIN and a typed confirmation.
- Every change is recorded in the Activity Log.

## For shop owners

- Change the default `admin / admin123` password and the default PIN `1234` right after the first login.
- Give each staff member their own user with the lowest role they need.
- Export a backup regularly (Shop Setup → Backup & Reset).
