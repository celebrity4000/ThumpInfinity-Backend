import { Resend } from "resend";

// Initialize Resend with API key
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "Thump Infinity <noreply@thumpinfinity.com>";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "admin@admin.com").split(",").map(e => e.trim());
const ADMIN_PANEL_URL =
  process.env.ADMIN_PANEL_URL || "https://admin-panel-lovat-eta.vercel.app/";

// Create resend client only if API key is provided
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

interface NewRegistrationEmailData {
  customerName: string;
  phone: string;
  city?: string;
  state?: string;
  gstNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  pincode?: string;
  customerId: string;
  approvalType: "auto" | "manual";
  createdAt: Date;
}

export const sendNewRegistrationEmail = async (
  data: NewRegistrationEmailData,
): Promise<void> => {
  if (!resend) {
    console.warn("[Resend] API key not configured. Skipping registration email.");
    return;
  }

  const {
    customerName,
    phone,
    city,
    state,
    gstNumber,
    addressLine1,
    addressLine2,
    pincode,
    customerId,
    approvalType,
    createdAt,
  } = data;

  const address = [addressLine1, addressLine2, city, state, pincode]
    .filter(Boolean)
    .join(", ");

  const gstInfo = gstNumber
    ? gstNumber
    : "Not provided (Manual Approval Required)";

  const approvalBadge =
    approvalType === "auto"
      ? `<span style="background-color: #10B981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: 8px;">Auto Approved</span>`
      : `<span style="background-color: #F59E0B; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-left: 8px;">Needs Approval</span>`;

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Customer Registration - Thump Infinity</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4f46e5 100%); padding: 36px 40px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Thump Infinity</h1>
                  <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px; font-weight: 500;">🔔 New Customer Registration Alert</p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px;">
                  
                  <!-- Customer Info -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding-bottom: 24px;">
                        <h2 style="color: #0f172a; margin: 0 0 6px; font-size: 20px; font-weight: 700;">
                          ${customerName || "New Customer"}
                          ${approvalBadge}
                        </h2>
                        <p style="color: #64748b; margin: 0; font-size: 13px;">
                          Registered on ${new Date(
                            createdAt,
                          ).toLocaleDateString("en-IN", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- Details Card -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                    
                    <!-- Phone -->
                    <tr>
                      <td style="padding: 18px 24px; border-bottom: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                              <span style="font-size: 18px;">📱</span>
                            </td>
                            <td style="vertical-align: top;">
                              <p style="color: #64748b; margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Mobile Number</p>
                              <p style="color: #0f172a; margin: 4px 0 0; font-size: 15px; font-weight: 600;">+91 ${phone}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- Address -->
                    <tr>
                      <td style="padding: 18px 24px; border-bottom: 1px solid #e2e8f0;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                              <span style="font-size: 18px;">📍</span>
                            </td>
                            <td style="vertical-align: top;">
                              <p style="color: #64748b; margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Business Address</p>
                              <p style="color: #0f172a; margin: 4px 0 0; font-size: 15px; font-weight: 600; line-height: 1.4;">${address || "Not provided"}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>

                    <!-- GST -->
                    <tr>
                      <td style="padding: 18px 24px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="width: 32px; vertical-align: top; padding-top: 2px;">
                              <span style="font-size: 18px;">🧾</span>
                            </td>
                            <td style="vertical-align: top;">
                              <p style="color: #64748b; margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">GST Number</p>
                              <p style="color: #0f172a; margin: 4px 0 0; font-size: 15px; font-weight: 700; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; letter-spacing: 0.5px;">${gstInfo}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Status Badge -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                    <tr>
                      <td style="background-color: ${approvalType === "auto" ? "#ECFDF5" : "#FFFBEB"}; border-radius: 12px; padding: 16px 20px; border: 1px solid ${approvalType === "auto" ? "#A7F3D0" : "#FDE68A"};">
                        <p style="margin: 0; color: ${approvalType === "auto" ? "#065F46" : "#92400E"}; font-size: 14px; line-height: 1.5; font-weight: 500;">
                          <strong>${approvalType === "auto" ? "✅ Auto Approved" : "⚠️ Manual Approval Required"}</strong>
                          ${approvalType === "manual" ? " – This customer did not provide a GST number and needs manual review before they can place orders." : " – Valid GST verified, account is active automatically."}
                        </p>
                      </td>
                    </tr>
                  </table>

                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 32px;">
                    <tr>
                      <td align="center">
                        <a href="${ADMIN_PANEL_URL}" 
                           style="display: inline-block; background: linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%); color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 10px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25);">
                          Go to Admin Panel
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-top: 14px;">
                        <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                          Customer ID: <span style="font-family: monospace; color: #64748b; font-weight: 600;">${customerId}</span>
                        </p>
                      </td>
                    </tr>
                  </table>

                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
                    This is an automated notification from the <strong>Thump Infinity</strong> Admin System.
                    <br>
                    Please do not reply directly to this email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textVersion = `
NEW CUSTOMER REGISTRATION - ${approvalType === "auto" ? "AUTO APPROVED" : "NEEDS APPROVAL"}
================================================================

Customer: ${customerName || "New Customer"}
Phone: +91 ${phone}
Address: ${address || "Not provided"}
GST: ${gstNumber || "Not provided (Manual Approval Required)"}
Registered: ${new Date(createdAt).toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}
Customer ID: ${customerId}

Status: ${approvalType === "auto" ? "Auto Approved - Account is active" : "Manual Approval Required - Needs admin review (No GST provided)"}

Open Admin Panel: ${ADMIN_PANEL_URL}

---
Thump Infinity Admin System
This is an automated notification.
  `.trim();

  try {
    await resend.emails.send({
      to: ADMIN_EMAILS,
      from: RESEND_FROM_EMAIL,
      subject: `${approvalType === "manual" ? "⚠️ ACTION REQUIRED: " : "✅ "}New Customer Registration - ${customerName || phone}${approvalType === "manual" ? " (Manual Approval - No GST)" : " (Auto Approved)"}`,
      text: textVersion,
      html: htmlTemplate,
    });
    console.log(
      `[Resend] Registration email sent for customer: ${customerName || phone} (${approvalType})`,
    );
  } catch (error) {
    console.error("[Resend] Failed to send registration email:", error);
    // Don't throw - email failure shouldn't break the registration flow
  }
};

export const sendOtpEmail = async (email: string, otp: string): Promise<void> => {
  if (!resend) {
    console.warn("[Resend] API key not configured. Skipping OTP email.");
    return;
  }

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Verification Code - Thump Infinity</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(15, 23, 42, 0.05); border: 1px solid #e2e8f0;">
              
              <!-- Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #4f46e5 100%); padding: 36px 40px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Thump Infinity</h1>
                  <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 1px;">Verification Code</p>
                </td>
              </tr>

              <!-- Content -->
              <tr>
                <td style="padding: 40px; text-align: center;">
                  <p style="color: #334155; font-size: 16px; line-height: 1.6; margin: 0 0 28px 0; font-weight: 500;">
                    Please use the following verification code to log in to your account. This code is valid for <strong>5 minutes</strong>.
                  </p>
                  
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; display: inline-block; padding: 20px 48px; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #4f46e5; margin: 0 0 28px 0; font-family: 'SFMono-Regular', Consolas, Menlo, monospace;">
                    ${otp}
                  </div>
                  
                  <p style="color: #94a3b8; font-size: 13px; margin: 0; line-height: 1.5;">
                    If you did not request this verification code, please ignore this email safely.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0; text-align: center;">
                  <p style="color: #94a3b8; font-size: 12px; margin: 0; line-height: 1.5;">
                    This is an automated security message from <strong>Thump Infinity</strong>.
                    <br>
                    Please do not reply directly to this email.
                  </p>
                </td>
              </tr>

            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const textVersion = `Your verification code is ${otp}. Valid for 5 minutes.`;

  try {
    await resend.emails.send({
      to: email.trim().toLowerCase(),
      from: RESEND_FROM_EMAIL,
      subject: `Your Verification Code - ${otp}`,
      text: textVersion,
      html: htmlTemplate,
    });
    console.log(`[Resend] OTP email sent to ${email}`);
  } catch (error) {
    console.error("[Resend] Failed to send OTP email:", error);
    throw new Error("Failed to send OTP email. Please check your email address.");
  }
};
