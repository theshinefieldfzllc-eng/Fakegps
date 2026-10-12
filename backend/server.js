require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Stripe = require("stripe");

const store = require("./store");
const { sendLoginEmail } = require("./email");

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_missing");
const JWT_SECRET = process.env.JWT_SECRET || "change-me-please";
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

const app = express();

app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = (session.customer_details && session.customer_details.email) || session.customer_email;
        const customerId = session.customer;
        if (email) await provisionAccount(email, customerId);
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end
          ? invoice.lines.data[0].period.end * 1000
          : Date.now() + 31 * 24 * 60 * 60 * 1000;
        let user = store.findByCustomerId(customerId);
        if (!user && invoice.customer_email) {
          user = await provisionAccount(invoice.customer_email, customerId);
        }
        if (user) store.setActiveByCustomerId(customerId, true, periodEnd);
        break;
      }
      case "invoice.payment_failed":
      case "customer.subscription.deleted": {
        const obj = event.data.object;
        store.setActiveByCustomerId(obj.customer, false);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
  }
  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

function randomPassword(len = 10) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

async function provisionAccount(email, customerId) {
  const existing = store.findByEmail(email);
  if (existing) {
    return store.upsertUser({
      ...existing,
      stripeCustomerId: customerId || existing.stripeCustomerId,
      active: true,
    });
  }
  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = store.upsertUser({
    email,
    passwordHash,
    stripeCustomerId: customerId || null,
    active: true,
    currentPeriodEnd: Date.now() + 31 * 24 * 60 * 60 * 1000,
    createdAt: Date.now(),
  });
  try {
    await sendLoginEmail(email, password);
    console.log("Login email sent to", email);
  } catch (e) {
    console.error("Failed to send login email to", email, e.message);
  }
  return user;
}

function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "no_token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "bad_token" });
  }
}

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    const amount = Math.round(Number(process.env.PRICE_AMOUNT || 999));
    const currency = (process.env.PRICE_CURRENCY || "usd").toLowerCase();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{
        price_data: {
          currency,
          product_data: { name: process.env.APP_NAME || "Fake GPS Pro" },
          unit_amount: amount,
          recurring: { interval: "month" },
        },
        quantity: 1,
      }],
      billing_address_collection: "auto",
      success_url: `${PUBLIC_URL}/success.html`,
      cancel_url: `${PUBLIC_URL}/cancel.html`,
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "checkout_failed" });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });
  const user = store.findByEmail(email);
  if (!user) return res.status(401).json({ error: "invalid_login" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_login" });
  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, active: isActive(user), expiresAt: user.currentPeriodEnd || null });
});

app.get("/api/status", auth, (req, res) => {
  const user = store.findByEmail(req.user.email);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({ active: isActive(user), expiresAt: user.currentPeriodEnd || null });
});

function isActive(user) {
  if (!user.active) return false;
  if (user.currentPeriodEnd && Date.now() > user.currentPeriodEnd + 2 * 24 * 60 * 60 * 1000) return false;
  return true;
}

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
