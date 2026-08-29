import { sendEmail } from '../../utils/emailSender.js';

const ALLOWED_CATEGORIES = [
    'Order & Payment Support',
    'Account Management',
    'General Queries'
];

/**
 * Validates and dispatches a customer support query email to the admin.
 * 
 * @param {Object} supportData
 * @param {string} supportData.username
 * @param {string} supportData.email
 * @param {string} supportData.subject
 * @param {string} supportData.category
 * @param {string} supportData.description
 */
export const processSupportRequest = async ({ username, email, subject, category, description }) => {
    if (!subject || !subject.trim()) {
        throw new Error('Please enter a subject for your support request.');
    }
    const cleanSubject = subject.trim();
    if (cleanSubject.length < 5) {
        throw new Error('Subject must be at least 5 characters long.');
    }
    if (cleanSubject.length > 150) {
        throw new Error('Subject cannot exceed 150 characters.');
    }

    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
        throw new Error('Please select a valid support category.');
    }

    if (!description || !description.trim()) {
        throw new Error('Please enter a description for your query.');
    }
    const cleanDescription = description.trim();
    if (cleanDescription.length < 15) {
        throw new Error('Description must be at least 15 characters long so our support team can assist you.');
    }
    if (cleanDescription.length > 2000) {
        throw new Error('Description cannot exceed 2000 characters.');
    }

    const adminTargetEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (!adminTargetEmail) {
        throw new Error('Support email service is currently unconfigured. Please try again later.');
    }

    const emailSubject = `[PixelPlay Support - ${category}] ${cleanSubject}`;

    const textContent = `
NEW CUSTOMER SUPPORT REQUEST - PIXELPLAY

Category: ${category}
Subject: ${cleanSubject}

User Details:
----------------------------------------
Username: ${username || 'Guest/User'}
Email: ${email || 'Not Provided'}
Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Query Description:
----------------------------------------
${cleanDescription}
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; background-color: #0f172a; color: #e2e8f0; margin: 0; padding: 20px; }
        .card { background-color: #1e293b; border: 1px solid #334155; border-radius: 12px; max-width: 600px; margin: 0 auto; padding: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
        .header { border-bottom: 2px solid #00b0ff; padding-bottom: 12px; margin-bottom: 20px; }
        .header h2 { color: #00b0ff; margin: 0; font-size: 20px; }
        .badge { display: inline-block; background-color: rgba(0,176,255,0.15); color: #00b0ff; border: 1px solid rgba(0,176,255,0.3); padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-top: 6px; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        .meta-table td { padding: 8px 0; border-bottom: 1px solid #334155; font-size: 14px; }
        .meta-label { color: #94a3b8; font-weight: bold; width: 30%; }
        .meta-val { color: #ffffff; }
        .description-box { background-color: #090d16; border: 1px solid #334155; padding: 16px; border-radius: 8px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #f1f5f9; }
        .footer { margin-top: 24px; font-size: 11px; color: #64748b; text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h2>PixelPlay Customer Support Query</h2>
            <div class="badge">${category}</div>
        </div>
        <table class="meta-table">
            <tr>
                <td class="meta-label">User Name:</td>
                <td class="meta-val">${username || 'N/A'}</td>
            </tr>
            <tr>
                <td class="meta-label">User Email:</td>
                <td class="meta-val"><a href="mailto:${email}" style="color: #00b0ff;">${email || 'N/A'}</a></td>
            </tr>
            <tr>
                <td class="meta-label">Subject:</td>
                <td class="meta-val"><strong>${cleanSubject}</strong></td>
            </tr>
            <tr>
                <td class="meta-label">Submitted At:</td>
                <td class="meta-val">${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
            </tr>
        </table>
        <div style="font-weight: bold; color: #94a3b8; margin-bottom: 8px; font-size: 13px; text-transform: uppercase;">Message / Query Description:</div>
        <div class="description-box">${cleanDescription.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        <div class="footer">
            Automated Support Mailer · PixelPlay Gaming Platform
        </div>
    </div>
</body>
</html>
`;

    await sendEmail(adminTargetEmail, emailSubject, textContent, htmlContent);
    return true;
};
