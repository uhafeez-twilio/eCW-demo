import sgMail from "@sendgrid/mail";

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export async function sendEmail(args: {
  to: string;
  subject: string;
  body: string;
}): Promise<string> {
  const { to, subject, body } = args;
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDGRID_FROM_EMAIL) {
    return "Sorry, email is not configured on the server. The email could not be sent.";
  }
  try {
    await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject,
      text: body,
      html: body.replace(/\n/g, "<br>"),
    });
    return `Email successfully sent to ${to} with subject "${subject}"`;
  } catch (err: any) {
    console.error("[send_email] Error:", err?.response?.body || err);
    return `Failed to send email: ${err.message || "Unknown error"}`;
  }
}
