import nodemailer from 'nodemailer';

export async function sendRecoveryEmail(to, code) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail', 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from: `"ChatterBox" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Password Recovery Code",
    html: `<div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; background-color: #f9f9f9;">
  <h2 style="color: #333;">Account Recovery Code</h2>
  <p style="font-size: 16px; color: #555;">
    We've received a request to recover your account. Please use the following code to proceed with the verification process:
  </p>
  <p style="font-size: 18px; font-weight: bold; color: #2c3e50; background-color: #eaf2f8; padding: 10px 15px; display: inline-block; border-radius: 4px;">
    ${code}
  </p>
  <p style="font-size: 14px; color: #888;">
    This recovery code will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact support immediately.
  </p>
  <hr style="margin: 20px 0; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 12px; color: #aaa;">
    For your security, never share this code with anyone. Our team will never ask for it.
  </p>
</div>`,
  });
}