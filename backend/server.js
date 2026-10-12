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
const PRICE_ID = process.env.STRIPE_PRICE_ID; // monthly recurring price
const PUBLIC_URL = process.env.PUBLIC_URL || "http://localhost:3000";

const app = express();

/* ----------------------------------------------------------------------------
 * Stripe webhook MUST use the raw body, so it is registered BEFORE express.json
 * -------------------------------------------------------------------------- */
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
      // Fired once, right after the customer finishes checkout.
      case "checkout.session.completed": {
        const session = event.data.object;
        const email = (session.customer_details && session.customer_details.email) || session.customer_email;
        const customerId = session.customer;
        if (email) {
          await provisionAccount(email, customerId);
        }
        break;
      }

      // Fired on first payment AND every monthly renewal -> keep account active.
      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const periodEnd = invoice.lines?.data?.[0]?.period?.end
          ? invoice.lines.data[0].period.end * 1000
          : Date.now() + 31 * 24 * 60 * 60 * 1000;

        let user = store.findByCustomerId(customerId);
        if (!user && invoice.customer_email) {
          // Safety net in case checkout.session.completed was missed.
          user = await provisionAccount(invoice.customer_email, customerId);
        }
        if (user) store.setActiveByCustomerId(customerId, true, periodEnd);
        break;
      }

      // Payment failed or subscription cancelled -> lock the account.
      case "invoice.payment_failed":
      case "customer.subscription.deleted": {
        const obj = event.data.object;
        const customerId = obj.customer;
        store.setActiveByCustomerId(customerId, false);
        break;
      }

      default:
        // ignore other events
        break;
    }
  } catch (e) {
    console.error("Webhook handler error:", e);
  }

  res.json({ received: true });
});

// JSON parser for the rest of the routes
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

/* ----------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------- */
function randomPassword(len = 10) {
  // readable-ish, no ambiguous chars
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

// Creates (or re-activates) an account and emails the login.
async function provisionAccount(email, customerId) {
  const existing = store.findByEmail(email);

  // If they already exist, just make sure they're active + linked to the customer.
  if (existing) {
    const updated = store.upsertUser({
      ...existing,
      stripeCustomerId: customerId || existing.stripeCustomerId,
      active: true,
    });
    return updated;
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
    // We keep the account; you can resend manually if email fails.
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

/* ----------------------------------------------------------------------------
 * Payment: create a Stripe Checkout subscription session
 * -------------------------------------------------------------------------- */
app.post("/api/create-checkout-session", async (req, res) => {
  try {
    if (!PRICE_ID) return res.status(500).json({ error: "price_not_configured" });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      // We collect the email so we know where to send the login.
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

/* ----------------------------------------------------------------------------
 * App: login  ->  returns a token the app stores
 * -------------------------------------------------------------------------- */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "missing_fields" });

  const user = store.findByEmail(email);
  if (!user) return res.status(401).json({ error: "invalid_login" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "invalid_login" });

  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "30d" });
  res.json({
    token,
    active: isActive(user),
    expiresAt: user.currentPeriodEnd || null,
  });
});

/* ----------------------------------------------------------------------------
 * App: check subscription status (called by the app before unlocking)
 * -------------------------------------------------------------------------- */
app.get("/api/status", auth, (req, res) => {
  const user = store.findByEmail(req.user.email);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({
    active: isActive(user),
    expiresAt: user.currentPeriodEnd || null,
  });
});

function isActive(user) {
  if (!user.active) return false;
  if (user.currentPeriodEnd && Date.now() > user.currentPeriodEnd + 2 * 24 * 60 * 60 * 1000) {
    // grace period of 2 days past period end
    return false;
  }
  return true;
}

app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend running on :${PORT}`));
