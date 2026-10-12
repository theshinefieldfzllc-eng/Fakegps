// Sends the login email to the customer after payment.
// Works with any SMTP provider (Gmail app password, Brevo, Zoho, Mailgun SMTP, etc.)

const nodemailer = require("nodemailer");

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false") === "true", // true for 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendLoginEmail(toEmail, password) {
  const appName = process.env.APP_NAME || "Fake GPS";
  const downloadLink = process.env.APP_DOWNLOAD_URL || "(download link yahan aayega)";

  const transport = makeTransport();

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
    <p>Download the app: <a href="${downloadLink}">${downloadLink}</a></p>
    <p>Open the app, log in with the details above, and you're ready to go.
       Your access stays active as long as your monthly subscription is paid.</p>
    <hr style="border:none;border-top:1px solid #eee;margin:20px 0"/>
    <p style="font-size:12px;color:#777">If you didn't request this, you can ignore this email.</p>
  </div>`;

  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: `${appName} — Login details`,
    html,
    text:
      `${appName}\n\nEmail: ${toEmail}\nPassword: ${password}\n\n` +
      `Download: ${downloadLink}\n\nLog in with these details in the app.`,
  });
}

module.exports = { sendLoginEmail };
