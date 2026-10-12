# Fake GPS — Subscription App (PC ke baghair)

Ye poora project hai: ek **Android app** (map pe location choose kar ke fake GPS)
aur ek **backend** jo Stripe se payment leta hai, payment hote hi **automatic login
bana ke client ko email** karta hai, aur app ko batata hai ke subscription active hai ya nahi.

Aap ko PC ya Android Studio ki zaroorat NAHI. APK **GitHub pe cloud mein** banega.

---

## Folder mein kya hai

```
fakegps/
  android/          <- Android app ka source (APK isi se banega)
  backend/          <- Server: Stripe + login + email + subscription API
  .github/workflows/android.yml   <- cloud mein APK banane wali setting
  README.md         <- yehi file
```

---

## Poora plan (5 steps)

1. Project ko **GitHub** pe daalo.
2. GitHub khud **APK** bana dega → download karo.
3. **Backend** ko free host (Render) pe deploy karo.
4. **Stripe** aur **email** set karo.
5. App mein backend ka link daal ke dobara APK banao → bas, chal pari.

---

## STEP 1 — GitHub pe project daalo

1. [github.com](https://github.com) pe account banao (free).
2. Naya **repository** banao, naam jaise `fakegps`. (Public rakho to APK build bilkul free; private pe bhi free minutes milte hain.)
3. Is folder ki saari files us repo mein upload kar do.
   - Aasaan tareeqa: repo page pe **Add file → Upload files** → saari files/folders drag karo → **Commit**.

## STEP 2 — APK banwao (cloud mein, PC ke baghair)

1. Repo pe upload hote hi **Actions** tab khulo.
2. "Build APK" workflow chalega (ya **Run workflow** dabao).
3. ~5–10 minute baad, us run ke neeche **Artifacts** mein `fakegps-debug-apk` milega.
4. Use **phone se** download karo → zip khulegi → andar `app-debug.apk`.
5. APK install karo (phone "unknown sources / is source se install" ki ijazat maangega → allow).

> Note (2026): Brazil, Indonesia, Singapore, Thailand mein ab sirf verified developer
> ki app install hoti hai. In mulkon ke client ke liye Google ka **free hobbyist/limited
> distribution account** bana lena (bina government ID ke), ya ADB se install. Baaki
> mulkon mein abhi normal install chalti hai.

## STEP 3 — Mock location ON karo (phone pe, ek dafa)

1. **Settings → About phone → Build number** pe 7 baar tap → "Developer mode on".
2. **Settings → Developer options → Select mock location app → Fake GPS** chuno.
3. Location permission app ko de do.

Ab app mein map pe jagah choose kar ke **Start** dabao → poore phone ki location wahi
ho jayegi. **Stop** se band.

---

## STEP 4 — Backend deploy karo (free, Render pe)

1. [render.com](https://render.com) pe free account banao, GitHub se connect karo.
2. **New + → Blueprint** → apna `fakegps` repo chuno. (Project mein `backend/render.yaml`
   pehle se hai, Render khud samajh lega.)
   - Agar Blueprint na chale: **New + → Web Service** → repo chuno →
     Root Directory `backend`, Build `npm install`, Start `node server.js`.
3. Deploy ke baad Render ek URL dega, jaise `https://fakegps-backend.onrender.com`.
   **Ye URL yaad rakho** — PUBLIC_URL aur app dono mein chahiye.

### Environment variables (Render → apni service → Environment)

`backend/.env.example` mein poori list hai. Bharo:

| Variable | Kya daalna hai |
|---|---|
| `PUBLIC_URL` | Render wala URL (upar wala) |
| `JWT_SECRET` | koi bhi lamba random text |
| `STRIPE_SECRET_KEY` | Stripe se (neeche Step 5) |
| `STRIPE_PRICE_ID` | Stripe monthly price id |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook secret |
| `SMTP_HOST/PORT/USER/PASS` | email bhejne ke liye (neeche) |
| `APP_DOWNLOAD_URL` | APK ka download link (jo client ko email mein jaye) |

## STEP 5 — Stripe set karo

1. [stripe.com](https://stripe.com) pe account banao (UAE support hai).
2. **Developers → API keys** → `Secret key` copy → `STRIPE_SECRET_KEY` mein.
3. **Product banao**: Products → Add product → price **Recurring, Monthly**
   (jaise $9.99/month) → us price ka **ID** (`price_...`) → `STRIPE_PRICE_ID` mein.
4. **Webhook banao**: Developers → Webhooks → Add endpoint
   - URL: `https://<your-render-url>/webhook`
   - Events: `checkout.session.completed`, `invoice.paid`,
     `invoice.payment_failed`, `customer.subscription.deleted`
   - Banne ke baad **Signing secret** (`whsec_...`) → `STRIPE_WEBHOOK_SECRET` mein.
5. Render pe variables save → service **redeploy**.

### Email (login client ko bhejne ke liye)
- Sabse aasaan: Gmail. Google account mein **App Password** banao
  (2-step verification ON hona chahiye), aur:
  - `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`
  - `SMTP_USER=aapka@gmail.com`, `SMTP_PASS=app-password`, `MAIL_FROM=aapka@gmail.com`
- Zyada email ke liye Brevo/Zoho/Mailgun ka SMTP bhi chal jayega.

---

## STEP 6 — App ko backend se joro (zaroori)

1. File kholo: `android/app/src/main/java/com/irfan/fakegps/ApiClient.kt`
2. Upar `BASE_URL` apne Render URL se badlo:
   ```kotlin
   const val BASE_URL = "https://fakegps-backend.onrender.com"
   ```
3. Change commit karo → Actions phir se **naya APK** bana dega → wahi APK baanto.

---

## Chalne ka poora flow (test)

1. Apna sales page kholo: `https://<your-render-url>/` → **Subscribe** dabao.
2. Stripe test card: `4242 4242 4242 4242`, koi future date, koi CVC, email daalo.
3. Payment complete → us email pe **login (email + password)** aa jayega.
4. App kholo → wahi login daalo → map pe jagah choose → **Start**.
5. Subscription cancel/expire ho to app khud lock (Start pe "expire" aayega).

> Test ke baad Stripe ko **Live mode** pe karo aur live keys daalo, tab asli payment chalega.

---

## Paisa / kharcha

- **APK banana (GitHub):** free.
- **Backend (Render free plan):** free (thori der idle rehne pe so jata hai, pehli
  request pe ~30s mein jaag jata hai; chaho to baad mein paid plan).
- **Stripe:** account free; har payment pe Stripe apni choti fee kaatta hai.
- **Play Store:** zaroorat nahi (aap direct bech rahe ho). Chaho to baad mein $25 de kar daal sakte ho.

## Zaroori baat
- Fake/mock location Android ka apna feature hai. Lekin kai apps (banking, ride-hailing,
  attendance, games) mock location **pakad** leti hain aur block/ban kar sakti hain —
  ye normal hai, app mein kami nahi.
- App apne customers ko hi bechein; kisi ko dhoka dene/rules todne ke liye use na ho.

---

Masla aaye to batao — error ka screenshot/log bhejna, main fix bata dunga.
