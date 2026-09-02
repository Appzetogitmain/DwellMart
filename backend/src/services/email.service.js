import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const formatCurrencyAmount = (currency = '', amount = 0) => {
    const normalizedCurrency = String(currency || '').toUpperCase() || 'USD';

    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: normalizedCurrency,
        }).format(Number(amount || 0));
    } catch {
        return `${normalizedCurrency} ${Number(amount || 0).toFixed(2)}`;
    }
};

const escapePdfText = (value = '') => String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ');

const buildPdfBuffer = (lines = []) => {
    const stream = lines.join('\n');
    const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
        `5 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj`,
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];

    for (const object of objects) {
        offsets.push(Buffer.byteLength(pdf, 'utf8'));
        pdf += `${object}\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let index = 1; index < offsets.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, 'utf8');
};

const createVendorInvoiceAttachment = (vendor, plan, payment = null) => {
    const invoiceNumber = String(
        payment?.invoiceId
        || payment?.transactionId
        || vendor?.onboardingEmailInvoiceId
        || `vendor-${vendor?._id || 'invoice'}`
    );
    const createdAt = payment?.createdAt ? new Date(payment.createdAt) : new Date();
    const gateway = String(payment?.gateway || vendor?.billing?.preferredGateway || '').toUpperCase() || 'N/A';
    const amountLabel = payment?.amount > 0
        ? formatCurrencyAmount(payment.currency, payment.amount)
        : 'Free';

    const pdfLines = [
        'BT',
        '/F1 20 Tf',
        `1 0 0 1 50 760 Tm (${escapePdfText('Dwell Mart Vendor Invoice')}) Tj`,
        'ET',
    ];

    const detailLines = [
        `Invoice Number: ${invoiceNumber}`,
        `Invoice Date: ${createdAt.toISOString().slice(0, 10)}`,
        `Vendor Name: ${vendor?.name || ''}`,
        `Store Name: ${vendor?.storeName || ''}`,
        `Vendor Email: ${vendor?.email || ''}`,
        `Plan: ${plan?.name || 'Standard'}`,
        `Billing Interval: ${plan?.intervalLabel || 'N/A'}`,
        `Gateway: ${gateway}`,
        `Payment Status: ${payment?.status || (payment?.amount > 0 ? 'paid' : 'free')}`,
        `Amount Paid: ${amountLabel}`,
        `Transaction ID: ${payment?.transactionId || 'N/A'}`,
        `Invoice ID: ${payment?.invoiceId || 'N/A'}`,
    ];

    let yPosition = 724;
    for (const line of detailLines) {
        pdfLines.push('BT');
        pdfLines.push('/F1 11 Tf');
        pdfLines.push(`1 0 0 1 50 ${yPosition} Tm (${escapePdfText(line)}) Tj`);
        pdfLines.push('ET');
        yPosition -= 24;
    }

    pdfLines.push('BT');
    pdfLines.push('/F1 10 Tf');
    pdfLines.push(`1 0 0 1 50 ${Math.max(yPosition - 12, 80)} Tm (${escapePdfText('This invoice confirms your vendor subscription onboarding payment with Dwell Mart.')}) Tj`);
    pdfLines.push('ET');

    return {
        filename: `dwellmart-vendor-invoice-${invoiceNumber}.pdf`,
        content: buildPdfBuffer(pdfLines),
        contentType: 'application/pdf',
    };
};

/**
 * Send an email
 * @param {Object} options - { to, subject, html, text, attachments }
 */
export const sendEmail = async ({ to, subject, html, text, attachments = [] }) => {
    const mailOptions = {
        from: `"${process.env.FROM_NAME || 'Dwell Mart'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text,
        attachments,
    };

    const info = await transporter.sendMail(mailOptions);
    return info;
};

export const sendOrderConfirmationEmail = async (order, userEmail) => {
    await sendEmail({
        to: userEmail,
        subject: `Order Confirmed - ${order.orderId}`,
        html: `<h2>Thank you for your order!</h2><p>Order ID: <strong>${order.orderId}</strong></p><p>Total: Rs. ${order.total}</p><p>Tracking: ${order.trackingNumber}</p>`,
    });
};

export const sendVendorOnboardingSuccessEmail = async (vendor, plan, payment = null) => {
    const isFree = !payment || payment.amount === 0;
    const amountStr = isFree ? 'Free' : formatCurrencyAmount(payment.currency, payment.amount);
    const invoiceAttachment = createVendorInvoiceAttachment(vendor, plan, payment);

    await sendEmail({
        to: vendor.email,
        subject: 'Welcome to Dwell Mart! Your Registration is Complete',
        text: [
            `Welcome to Dwell Mart, ${vendor.name}!`,
            'Your vendor registration and subscription process is now complete.',
            `Plan: ${plan?.name || 'Standard'}`,
            `Store Name: ${vendor.storeName}`,
            `Payment Status: ${isFree ? 'N/A (Free Plan)' : 'Paid'}`,
            !isFree ? `Amount Paid: ${amountStr}` : '',
            payment?.transactionId ? `Transaction ID: ${payment.transactionId}` : '',
            payment?.invoiceId ? `Invoice ID: ${payment.invoiceId}` : '',
            '',
            'Your invoice is attached to this email.',
            'Your account is currently pending admin review.',
        ].filter(Boolean).join('\n'),
        html: `
            <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0f766e;">Welcome to Dwell Mart, ${vendor.name}!</h2>
                <p>We are excited to have you on board. Your vendor registration and subscription process is now complete.</p>
                
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                    <h3 style="margin-top: 0;">Subscription Summary</h3>
                    <p><strong>Plan:</strong> ${plan?.name || 'Standard'}</p>
                    <p><strong>Store Name:</strong> ${vendor.storeName}</p>
                    <p><strong>Payment Status:</strong> ${isFree ? 'N/A (Free Plan)' : 'Paid'}</p>
                    ${!isFree ? `<p><strong>Amount Paid:</strong> ${amountStr}</p>` : ''}
                    ${payment?.transactionId ? `<p><strong>Transaction ID:</strong> ${payment.transactionId}</p>` : ''}
                    ${payment?.invoiceId ? `<p><strong>Invoice ID:</strong> ${payment.invoiceId}</p>` : ''}
                </div>

                <p>Your invoice is attached to this email for your records.</p>

                <div style="background: #fff4bf; padding: 15px; border-radius: 8px; border: 1px solid #ffe082; margin-top: 20px;">
                    <p style="margin: 0;"><strong>Important:</strong> Your account is currently in <strong>Pending</strong> status. Our administration team will review your documents and store details shortly. You will receive another email once your account is fully approved and activated.</p>
                </div>

                <p style="margin-top: 30px;">If you have any questions, feel free to reply to this email.</p>
                <p>Best regards,<br>The Dwell Mart Team</p>
            </div>
        `,
        attachments: [invoiceAttachment],
    });
};
