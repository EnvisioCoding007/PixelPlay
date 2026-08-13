import nodemailer from 'nodemailer';

export const sendEmail = async (to, subject, text) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        await transporter.sendMail({
            from: `"PixelPlay Support" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text
        });

        console.log(`Email successfully sent to ${to}`);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Failed to send verification email.");
    }
};