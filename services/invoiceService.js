import Order from '../models/Order.js';
import Product from '../models/Product.js';
import PDFDocument from 'pdfkit';
import path from 'path';

/**
 * Service to fetch order details, validate ownership and state, and generate a PDF invoice streamed directly.
 * @param {string} orderId - The ID of the order.
 * @param {string} loggedInUserId - The ID of the currently logged-in user.
 * @param {WritableStream} writeStream - Writable stream to pipe the PDF to (e.g. Express response).
 */
export const generateInvoicePDF = async (orderId, loggedInUserId, writeStream) => {
    const dbOrder = await Order.findById(orderId).populate('items.product').lean();
    if (!dbOrder) {
        throw new Error('Order not found');
    }

    if (dbOrder.userId.toString() !== loggedInUserId.toString()) {
        throw new Error('Unauthorized access');
    }

    if (dbOrder.orderStatus !== 'Delivered') {
        throw new Error('Invoice is only available after order is delivered');
    }

    // Initialize PDF Document
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    doc.pipe(writeStream);

    // Header section with brand logo and details
    const logoPath = path.join(process.cwd(), 'public', 'icons', 'brand_logo', 'pixelplay-logo.png');
    try {
        doc.image(logoPath, 50, 45, { width: 50 });
    } catch (e) {
        console.error('Logo image load failed:', e);
        // Draw a placeholder circle if logo fails to load
        doc.circle(75, 70, 25).fill('#0ea5e9');
    }

    // Write site name and invoice header
    doc.fillColor('#111827')
       .fontSize(20)
       .font('Helvetica-Bold')
       .text('PixelPlay', 115, 50);

    doc.fontSize(9)
       .font('Helvetica')
       .text('Your Premier Gaming Destination', 115, 72)
       .text('Email: envisiocoding@gmail.com | Web: ', 115, 84);

    doc.fontSize(22)
       .font('Helvetica-Bold')
       .fillColor('#0ea5e9')
       .text('TAX INVOICE', 380, 45, { align: 'right' });

    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#4b5563')
       .text(`Invoice No: INV-${dbOrder.orderId}`, 380, 72, { align: 'right' })
       .text(`Order ID: ${dbOrder.orderId}`, 380, 84, { align: 'right' })
       .text(`Order Date: ${new Date(dbOrder.createdAt).toLocaleDateString('en-GB')}`, 380, 96, { align: 'right' })
       .text(`Delivered Date: ${new Date(dbOrder.updatedAt || dbOrder.createdAt).toLocaleDateString('en-GB')}`, 380, 108, { align: 'right' })
       .text(`Payment Mode: ${dbOrder.paymentMethod}`, 380, 120, { align: 'right' });

    // Divider
    doc.moveTo(50, 135).lineTo(545, 135).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // Customer Details and Shipping Address
    doc.fontSize(12)
       .font('Helvetica-Bold')
       .fillColor('#111827')
       .text('Bill To:', 50, 150);

    const addr = dbOrder.deliveryAddress;
    doc.fontSize(9)
       .font('Helvetica')
       .fillColor('#4b5563')
       .text(addr.fullName, 50, 170)
       .text(addr.addressLine1, 50, 183)
       .text(addr.addressLine2 || '', 50, 196)
       .text(`${addr.city}, ${addr.state} - ${addr.postal_code}`, 50, 209)
       .text(`Country: ${addr.country}`, 50, 222)
       .text(`Phone: ${addr.phone}`, 50, 235);

    // Order Summary Table Headers
    let y = 265;
    doc.rect(50, y, 495, 20).fill('#f3f4f6');
    
    doc.fillColor('#111827')
       .font('Helvetica-Bold')
       .fontSize(8.5)
       .text('Item Description', 55, y + 6, { width: 160 })
       .text('Platform', 220, y + 6, { width: 80 })
       .text('Qty', 305, y + 6, { width: 20, align: 'center' })
       .text('Base Price', 330, y + 6, { width: 50, align: 'right' })
       .text('Discount', 385, y + 6, { width: 40, align: 'right' })
       .text('GST (18%)', 430, y + 6, { width: 50, align: 'right' })
       .text('Total', 485, y + 6, { width: 55, align: 'right' });

    y += 20;

    // Draw Items
    doc.font('Helvetica').fontSize(8.5).fillColor('#374151');
    let computedSubtotal = 0;
    let computedTotalTax = 0;
    
    for (let item of dbOrder.items) {
        // Find base/original price of the platform version from the product
        let originalBasePrice = item.price; // fallback
        if (item.product) {
            if (typeof item.product.price === 'number') {
                originalBasePrice = item.product.price;
            }
            if (item.product.platform_stock && item.product.platform_stock.length > 0) {
                const ps = item.product.platform_stock.find(p => p.platform === item.platform);
                if (ps && typeof ps.price === 'number') {
                    originalBasePrice = ps.price;
                }
            }
        }

        const origBaseRupees = originalBasePrice / 100;
        const categoryDiscountPercent = Math.max(0, Math.round((originalBasePrice - Math.round(item.price / 0.82)) / originalBasePrice * 100)) || 0;
        
        const taxExclusivePriceRupees = item.price / 100;
        const itemTotalTaxExclusive = taxExclusivePriceRupees * item.quantity;
        const gstAmountRupees = (item.price * item.quantity * 0.18 / 0.82) / 100;
        const itemTotalInclusive = (item.price * item.quantity / 0.82) / 100;
        
        computedSubtotal += itemTotalTaxExclusive;
        computedTotalTax += gstAmountRupees;

        // Draw line
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#f3f4f6').lineWidth(1).stroke();

        const title = item.product ? item.product.title : 'Unknown Product';
        doc.text(title, 55, y + 6, { width: 160 })
           .text(item.platform.toUpperCase(), 220, y + 6, { width: 80 })
           .text(item.quantity.toString(), 305, y + 6, { width: 20, align: 'center' })
           .text(`₹${origBaseRupees.toFixed(2)}`, 330, y + 6, { width: 50, align: 'right' })
           .text(`${categoryDiscountPercent}%`, 385, y + 6, { width: 40, align: 'right' })
           .text(`₹${gstAmountRupees.toFixed(2)}`, 430, y + 6, { width: 50, align: 'right' })
           .text(`₹${itemTotalInclusive.toFixed(2)}`, 485, y + 6, { width: 55, align: 'right' });

        y += 20;
    }

    // Table Bottom Border
    doc.moveTo(50, y).lineTo(545, y).strokeColor('#e5e7eb').lineWidth(1).stroke();

    y += 15;

    // Pricing Summary block
    const summaryX = 350;
    doc.fontSize(9).font('Helvetica');

    // Subtotal (excl. tax)
    doc.fillColor('#4b5563').text('Subtotal (excl. Tax):', summaryX, y);
    doc.fillColor('#111827').text(`₹${(dbOrder.subtotal / 100).toFixed(2)}`, 485, y, { align: 'right' });
    y += 15;

    // CGST + SGST (9% + 9%)
    doc.fillColor('#4b5563').text('GST (18%):', summaryX, y);
    doc.fillColor('#111827').text(`₹${(dbOrder.tax / 100).toFixed(2)}`, 485, y, { align: 'right' });
    y += 15;

    // Delivery/Shipping Charges
    doc.fillColor('#4b5563').text('Delivery Charges:', summaryX, y);
    doc.fillColor('#111827').text(`₹${(dbOrder.shipping / 100).toFixed(2)}`, 485, y, { align: 'right' });
    y += 15;

    // Coupon discount
    if (dbOrder.discount > 0) {
        doc.fillColor('#10b981').text('Coupon Discount:', summaryX, y);
        doc.fillColor('#10b981').text(`- ₹${(dbOrder.discount / 100).toFixed(2)}`, 485, y, { align: 'right' });
        y += 15;
    }

    // Divider before Grand Total
    doc.moveTo(summaryX, y).lineTo(545, y).strokeColor('#d1d5db').lineWidth(1).stroke();
    y += 8;

    // Grand Total
    doc.fontSize(11).font('Helvetica-Bold');
    doc.fillColor('#111827').text('Grand Total:', summaryX, y);
    doc.fillColor('#0ea5e9').text(`₹${(dbOrder.finalAmount / 100).toFixed(2)}`, 485, y, { align: 'right' });

    // Footer Section
    doc.fontSize(9)
       .font('Helvetica-Oblique')
       .fillColor('#6b7280')
       .text('Thank you for shopping with PixelPlay! For support, reach out to envisiocoding@gmail.com.', 50, 720, { align: 'center', width: 495 });

    // End PDF generation
    doc.end();
};
