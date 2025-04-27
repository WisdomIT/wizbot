import { createTransport } from 'nodemailer';

const transporter = createTransport({
  host: process.env.SMTP_HOST ?? '',
  port: Number(process.env.SMTP_PORT ?? ''),
  secure: true,
  auth: {
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
  },
});

const from = `"위즈봇" <${process.env.SMTP_SENDER ?? ''}>`;

export function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  return transporter.sendMail({
    from,
    to,
    subject,
    text,
  });
}

export function sendMailWithHtml({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  return transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
}
