import nodemailer from 'nodemailer';

export const sendEmail = async (to, subject, text, html = null) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: `"PixelPlay Support" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text
        };

        if (html) {
            mailOptions.html = html;
        }

        await transporter.sendMail(mailOptions);
        console.log(`Email successfully sent to ${to}`);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error(error.message || "Failed to send email.");
    }
};