# Cratekeep

Cratekeep is the packing desk for **KAMO 3pl** (Kamo Group). It keeps each client's products and stock separate, walks an order from pick to ship, and writes the invoice from those numbers.

You do not need to be a programmer to use it day to day. The sections below are for the person who puts it on the internet, and then for the person at the packing table.

## What you do each day

1. Sign in.
2. **Receive** an inbound carton: open the shipment, scan each item, and it lands in a bin.
3. **Orders**: open what is due today, scan to pick, mark it packed, type the tracking number, the carrier, who sold the label, and what you paid.
4. If a count looks wrong, open the product and save a cycle count. The old number and the new number are both kept.
5. At the end of the month the owner opens **Billing**, checks the draft, then issues it and downloads the PDF.

A barcode scanner that types and presses Enter works on the Scan page. On a phone, tap **Use camera**.

## Accounts

There are two kinds of sign-in:

- **Owner** can do everything, including clients, fees, invoices, and passwords.
- **Staff** can receive, count, pick, pack, ship, and handle returns. They cannot change fees or open billing.

Passwords are stored scrambled. The session cookie cannot be read by page scripts. Eight wrong passwords on one email locks that email for 15 minutes.

Forgot a password? The person asks from the sign-in page. The owner opens **Team**, approves the request, and reads out a one-time code. The code works for one hour and then stops. Nothing is emailed, so a stranger cannot reset a password by themselves.

To set a password from the computer that has the project:

```bash
EMAIL=owner@kamo.example PASSWORD='a-long-password' npm run password
```

## Put it on your computer

You need Node.js 22 or newer and a Postgres database. On a laptop the database can be local. On the internet, use Neon (below).

```bash
npm install
cp .env.example .env
```

Edit `.env`:

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | The database the app reads and writes. On Neon, use the **pooled** connection. |
| `DATABASE_URL_UNPOOLED` | The **direct** Neon connection. Migrations use this. On a laptop, paste the same URL as `DATABASE_URL`. |
| `AUTH_SECRET` | A long random string, at least 16 characters. It locks the sign-in cookies. |
| `CRON_SECRET` | Another long random string. Vercel sends it when it checks product photos. |
| `APP_TIMEZONE` | Warehouse clock. `America/New_York` is fine for a US desk. |
| `SEED_OWNER_EMAIL` | Owner email. Used only by the seed command. |
| `SEED_OWNER_PASSWORD` | Owner password for a new account. Leave blank locally to use the demo password. |
| `SEED_STAFF_EMAIL` | Staff email. |
| `SEED_STAFF_PASSWORD` | Staff password for a new account. |

Then:

```bash
npm run db:deploy
npm run seed
npm run dev
```

Open `http://127.0.0.1:38471`.

The local demo passwords, **only if those accounts did not already exist**, are:

- `owner@kamo.example` / `cratekeep-owner`
- `staff@kamo.example` / `cratekeep-staff`

Running the seed again does not change a password that is already set, and it does not double the stock. Change the demo passwords before anyone else can reach the desk.

## Put it on Vercel with Neon

1. Create a project on [Neon](https://neon.tech) and copy both connection strings. The pooled one goes in `DATABASE_URL`. The direct one goes in `DATABASE_URL_UNPOOLED`.
2. Push this repository to GitHub and import it in Vercel. The framework is Next.js. The build command is already `node scripts/vercel-build.mjs`.
3. In Vercel, open **Settings → Environment Variables** and add every name from the table above. Use real passwords in `SEED_OWNER_PASSWORD` if you want the seed to create the owner. Do not use the demo passwords on the internet.
4. Also add `CRON_SECRET` there. Vercel Cron calls `/api/cron/product-photos` every 4 hours with that secret. The job only checks whether photo links still open. It does not change stock.
5. Deploy. The build applies database migrations and then compiles the app. It does **not** import stock, repair passwords, or rewrite clients. That used to happen on every deploy and could change a live warehouse. It does not anymore.
6. After the first deploy, run the seed once from your computer, with the production URLs in the environment:

```bash
npm run seed
```

Or from a trusted machine: `npx prisma db seed` after the variables are set. You only need to do this to create the first owner and, if you want them, the sample clients. Day-to-day stock imports are done from **Import** in the app, not during deploy.

Opening stock is a CSV on the Import page (`mode` is `set` or `add`). Sample files are in `public/samples/`.

## Money and stock rules

- Money is stored in cents. A label that cost $6.12 is 612 cents. Totals do not use decimal math.
- Storage on an invoice is the cubic feet of what is on the shelf when you create the draft, for the days in the period, at the client's rate per cubic foot per 30 days.
- Pick and pack fees are copied onto the order when you pack it. Changing a client's fee later does not rewrite shipped orders.
- Label markup is a percent on top of what you paid. `0` bills the label at cost. `5` bills 5% more. The dashboard "profit" is pick fees, pack fees, and that markup for orders shipped this month.
- Every stock change writes a history row: who, which bin, the old quantity, and the new quantity.
- A product always keeps the client it was created for. A scan that matches two clients asks you to choose. It will not guess.

## Check that it builds

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run build` needs `DATABASE_URL` because it applies migrations, the same way Vercel does.

## What is left for later

- Emailing reset codes and invoices. Resets are in person on purpose until an email service is chosen.
- Buying the postage label inside the app. Today you buy it from the carrier or vendor, then type the cost and tracking number.
- A client login, so a seller can see only their own stock. Warehouse staff still see every client they fulfill for.
- Photo files uploaded from the phone. Today a photo is a link, and the cron job checks that the link still opens.
