// BikriPro API on Supabase Edge Functions.
// The Express app is bundled from backend/src by `npm run build:edge`.
// Every request to https://<project>.supabase.co/functions/v1/api/... is
// handled by the same routes as the Node server (/api/...).
import app from './bikripro.js';

app.listen(8000);
