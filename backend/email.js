// Sends the login email via Brevo's HTTP API (works on Render free tier).

async function sendLoginEmail(toEmail, password) {
  const appName = process.env.APP_NAME || "Fake GPS";
  const downloadLink = process.env.APP_DOWNLOAD_URL || "";
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.MAIL_FROM;

  if (!apiKey) throw new Error("BREVO_API_KEY not set");
  if (!fromEmail) throw new Error("MAIL_FROM not set");

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#111">
    <h2>${appName} — Your account is ready ✅</h2>
    <p>Thank you for subscribing. Your login details:</p>
    <table style="border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:6px 10px;background:#f3f4f6"><b>Email</b></td>
          <td style="padding:6px 10px;background:#f9fafb">${toEmail}</td></tr>
      <tr><td style="padding:6px 10px;background:#f3f4f6"><b>Password</b></td>
          <td style="padding:6px 10px;background:#f9fafb"><code>${password}</code></td></tr>
    </table>
    ${downloadLink ? `<p>Download the app: <a href="${downloadLink}">${downloadLink}</a></p>` : ""}
    <p>Open the app, log in with the details above, and you're ready to go.
       Your access stays active as long as your monthly subscription is paid.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#777">If you didn't request this, you can ignore this email.</p>
  </div>`;

  const text =
    `${appName}\n\nEmail: ${toEmail}\nPassword: ${password}\n\n` +
    (downloadLink ? `Download: ${downloadLink}\n\n` : "") +
    `Log in with these details in the app.`;

  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      sender: { email: fromEmail, name: appName },
      to: [{ email: toEmail }],
      subject: `${appName} — Login details`,
      htmlContent: html,
      textContent: text,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Brevo ${resp.status}: ${body}`);
  }
}

module.exports = { sendLoginEmail };
