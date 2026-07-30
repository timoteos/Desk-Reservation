# Deploying the demo

This puts a working copy of the app on the internet with **invented people**, so
it can be shown to somebody without an install. It is not a production
deployment for Med-Quest — see [Before this holds real staff data](#before-this-holds-real-staff-data).

Three pieces, and they are already three separate things:

| Piece | Where it goes | Already done? |
|---|---|---|
| Frontend (React) | GitHub Pages | yes — `npm run deploy` |
| API (Express) | a host that runs Node | no |
| Database (Postgres) | a managed provider | no |

Moving only the database achieves nothing on its own: the frontend on GitHub
Pages would still be calling an API on your laptop.

---

## 1. The database

Any managed Postgres works. The one hard requirement is the **`btree_gist`**
extension, which `schema.sql` creates itself — it is what makes the
no-double-booking constraint possible, and an provider that forbids it cannot
run this app. Neon, Supabase, Render and AWS RDS all allow it.

Neon is suggested because its free tier does not expire and it wakes from idle
in about a second.

1. Create a project at <https://neon.tech> and a database in it.
2. Copy the connection string. It looks like:
   `postgresql://user:password@ep-something.us-east-2.aws.neon.tech/neondb?sslmode=require`
3. **Keep `?sslmode=require`.** Managed Postgres refuses plaintext, and `pg`
   reads that flag straight from the URL, so no code change is needed.
4. Load the schema:

   ```bash
   psql "postgresql://user:password@host/dbname?sslmode=require" -f server/db/schema.sql
   ```

5. Confirm the constraint actually exists — if this returns nothing, stop, because
   double-booking is no longer prevented:

   ```bash
   psql "$DATABASE_URL" -c "select conname from pg_constraint where conname='no_double_booking'"
   ```

6. Load the demo people. Both flags are deliberate friction: the seed truncates
   every table, and it refuses a non-local host and a repository password.

   ```bash
   ALLOW_REMOTE_SEED=1 DEMO_ADMIN_PASSWORD='pick-something' \
     DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require" \
     npm run seed:demo
   ```

---

## 2. The API

Render's free tier is the least fuss. **It sleeps after 15 minutes idle and takes
roughly a minute to wake**, so the first click on a demo you have just sent
somebody will hang. Either warm it up before showing anyone, or say "give it a
moment" — do not let a PM meet a blank screen and conclude the app is broken.

1. New → Web Service, connect this repository.
2. Build command `npm install`, start command `npm run server`.
3. Health check path `/api/health` — it queries the database, so a green check
   means the whole chain works.
4. Environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon string, including `?sslmode=require` |
   | `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
   | `CORS_ORIGINS` | `https://timoteos.github.io` |

   Do not set `SERVER_PORT`. Render injects `PORT` and the server now prefers
   `SERVER_PORT`, then `PORT`, then 5000 — setting the first would make it
   ignore the port Render is health-checking.

5. Check it: `curl https://your-service.onrender.com/api/health`

---

## 3. The frontend

`REACT_APP_API_URL` is inlined by create-react-app **at build time**, and
`npm run deploy` builds on your machine. So it has to be set when you build, not
on the API host. Get this wrong and every visitor's browser calls
`http://localhost:5001`.

```bash
REACT_APP_API_URL=https://your-service.onrender.com npm run deploy
```

To avoid retyping it, put it in `.env.production.local` — already gitignored:

```
REACT_APP_API_URL=https://your-service.onrender.com
```

Verify by loading the site and watching the network tab: the requests should go
to onrender.com, not localhost.

---

## Before this holds real staff data

The demo is invented people on `example.com`. Real use is a different decision,
and not one to make alone:

- **The data is staff whereabouts.** Names, government email addresses, and which
  days each person is physically in the building. That is more sensitive than a
  desk-booking app sounds.
- **The account matters.** A personal Neon or Render account is the wrong home for
  State of Hawaii data, and it disappears with your contract. Whatever runs this
  for real should belong to the division.
- **Ask DHS IT** where state data is permitted to live and whether there is already
  an approved cloud tenancy. This is the same conversation as SSO and SMTP, both
  of which are already waiting — worth raising as one item rather than three.
- **`npm run seed` is for laptops.** It carries real colleagues' names on real
  `dhs.hawaii.gov` addresses and truncates every table before it writes. It refuses
  remote hosts unless forced, and that guard should stay.
