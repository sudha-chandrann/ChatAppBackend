import nodemailer from 'nodemailer';

export async function sendVerifyEmail(to, code) {
  const transporter = nodemailer.createTransport({
    service: 'Gmail', 
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from: `"ChaterBox Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your Verification Code",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);">
        <h2 style="color: #1a1a1a; text-align: center;">🔐 Verify Your Account</h2>
        <p style="font-size: 16px; color: #444; line-height: 1.6;">
          We received a request to verify your account. Please use the verification code below to continue:
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 24px; font-weight: 600; letter-spacing: 2px; color: #2c3e50; background-color: #f0f4f8; padding: 12px 20px; border-radius: 6px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #666;">
          This code will expire in <strong>10 minutes</strong>. If you did not request this, please ignore this email or contact our support team.
        </p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eaeaea;">
        <p style="font-size: 12px; color: #999; text-align: center;">
          Please do not share this code with anyone. Our team will never ask for it.
          <br><br>
          &copy; ${new Date().getFullYear()} ChaterBox. All rights reserved.
        </p>
      </div>
    `,
  });
  
}