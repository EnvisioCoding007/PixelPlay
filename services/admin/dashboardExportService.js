import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'path';
import Order from '../../models/Order.js';
import { buildDateFilter, getTopProducts, getTopCategories } from './dashboardService.js';

/**
 * Generates Excel (.xlsx) Sales Report streamed to writeStream (Express response)
 */
export const generateSalesExcelReport = async (options = {}, writeStream) => {
    const { period = 'all', startDate = null, endDate = null, status = 'All' } = options;

    const dateFilter = buildDateFilter(period, startDate, endDate);
    const filter = { ...dateFilter };
    if (status && status !== 'All') {
        filter.orderStatus = status;
    }

    const orders = await Order.find(filter)
        .sort({ createdAt: -1 })
        .populate('userId', 'username email')
        .lean();

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'PixelPlay Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sales Report');

    // Title Block
    sheet.mergeCells('A1:J1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'PixelPlay - Sales Report';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.mergeCells('A2:J2');
    const subTitleCell = sheet.getCell('A2');
    const dateStr = new Date().toLocaleString('en-GB');
    subTitleCell.value = `Filter: Period=${period.toUpperCase()} | Status=${status} | Date Range: ${startDate || 'Start'} to ${endDate || 'Now'} | Generated: ${dateStr}`;
    subTitleCell.font = { name: 'Arial', size: 10, italic: true };
    subTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    sheet.addRow([]); // Row 3 empty

    // Summary Block
    let totalGrossPaisa = 0;
    let totalCouponPaisa = 0;
    let totalTaxPaisa = 0;
    let totalNetPaisa = 0;

    orders.forEach(o => {
        totalGrossPaisa += (o.subtotal || 0);
        totalCouponPaisa += (o.discount || 0);
        totalTaxPaisa += (o.tax || 0);
        totalNetPaisa += (o.finalAmount || 0);
    });

    sheet.addRow(['REPORT SUMMARY']);
    sheet.getCell('A4').font = { bold: true, size: 11 };

    sheet.addRow(['Total Orders:', orders.length]);
    sheet.addRow(['Total Gross Sales:', totalGrossPaisa / 100]);
    sheet.addRow(['Total Coupon Deductions:', totalCouponPaisa / 100]);
    sheet.addRow(['Total Tax Collected:', totalTaxPaisa / 100]);
    sheet.addRow(['Total Net Sales:', totalNetPaisa / 100]);

    // Format summary currency cells
    ['B6', 'B7', 'B8', 'B9'].forEach(cellRef => {
        sheet.getCell(cellRef).numFmt = '₹#,##0.00';
        sheet.getCell(cellRef).font = { bold: true };
    });

    sheet.addRow([]); // Empty row before data table

    // Data Table Headers
    const headerRowIndex = 11;
    const headers = [
        'Order ID',
        'Date & Time',
        'Customer Username',
        'Customer Email',
        'Payment Method',
        'Payment Status',
        'Order Status',
        'Subtotal (₹)',
        'Coupon Discount (₹)',
        'Net Amount (₹)'
    ];

    sheet.addRow(headers);
    const headerRow = sheet.getRow(headerRowIndex);
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.border = {
            top: { style: 'thin' },
            bottom: { style: 'medium' },
            left: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // Populate rows
    orders.forEach(order => {
        const username = order.userId ? order.userId.username : 'N/A';
        const email = order.userId ? order.userId.email : 'N/A';
        const createdAt = new Date(order.createdAt).toLocaleString('en-GB');

        const row = sheet.addRow([
            order.orderId,
            createdAt,
            username,
            email,
            order.paymentMethod,
            order.paymentStatus,
            order.orderStatus,
            (order.subtotal || 0) / 100,
            (order.discount || 0) / 100,
            (order.finalAmount || 0) / 100
        ]);

        // Currency formatting for financial columns
        row.getCell(8).numFmt = '₹#,##0.00';
        row.getCell(9).numFmt = '₹#,##0.00';
        row.getCell(10).numFmt = '₹#,##0.00';

        row.eachCell((cell) => {
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
                right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
            };
        });
    });

    // Auto fit column widths
    sheet.columns.forEach(column => {
        let maxLength = 0;
        column.eachCell({ includeEmpty: true }, cell => {
            const columnLength = cell.value ? cell.value.toString().length : 10;
            if (columnLength > maxLength) {
                maxLength = columnLength;
            }
        });
        column.width = Math.max(maxLength + 3, 12);
    });

    await workbook.xlsx.write(writeStream);
};

/**
 * Generates PDF Sales Report streamed to writeStream (Express response)
 */
export const generateSalesPDFReport = async (options = {}, writeStream) => {
    const { period = 'all', startDate = null, endDate = null, status = 'All' } = options;

    const dateFilter = buildDateFilter(period, startDate, endDate);
    const filter = { ...dateFilter };
    if (status && status !== 'All') {
        filter.orderStatus = status;
    }

    const [orders, topProducts, topCategories] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'username email')
            .lean(),
        getTopProducts(3, dateFilter),
        getTopCategories(3, dateFilter)
    ]);

    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    doc.pipe(writeStream);

    // Header Logo & Branding
    const logoPath = path.join(process.cwd(), 'public', 'icons', 'brand_logo', 'pixelplay-logo.png');
    try {
        doc.image(logoPath, 35, 30, { width: 45 });
    } catch (e) {
        doc.circle(57, 50, 20).fill('#0ea5e9');
    }

    doc.fillColor('#111827')
       .fontSize(18)
       .font('Helvetica-Bold')
       .text('PixelPlay', 90, 32);

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#6b7280')
       .text('Gaming Platform Admin Analytics', 90, 52);

    doc.fontSize(18)
       .font('Helvetica-Bold')
       .fillColor('#0ea5e9')
       .text('SALES REPORT', 350, 32, { align: 'right' });

    doc.fontSize(8)
       .font('Helvetica')
       .fillColor('#4b5563')
       .text(`Generated: ${new Date().toLocaleString('en-GB')}`, 350, 52, { align: 'right' })
       .text(`Period: ${period.toUpperCase()} | Status: ${status}`, 350, 64, { align: 'right' });

    doc.moveTo(35, 80).lineTo(560, 80).strokeColor('#e5e7eb').lineWidth(1).stroke();

    // Summary Box
    let totalGross = 0;
    let totalDiscount = 0;
    let totalNet = 0;

    orders.forEach(o => {
        totalGross += (o.subtotal || 0) / 100;
        totalDiscount += (o.discount || 0) / 100;
        totalNet += (o.finalAmount || 0) / 100;
    });

    let y = 90;
    doc.rect(35, y, 525, 45).fill('#f9fafb').stroke('#e5e7eb');

    doc.fillColor('#374151').font('Helvetica-Bold').fontSize(8);

    // Box 1: Total Orders
    doc.text('TOTAL ORDERS', 45, y + 8);
    doc.fillColor('#111827').fontSize(12).text(orders.length.toString(), 45, y + 22);

    // Box 2: Gross Sales
    doc.fillColor('#374151').fontSize(8).text('GROSS SALES', 160, y + 8);
    doc.fillColor('#111827').fontSize(12).text(`₹${totalGross.toFixed(2)}`, 160, y + 22);

    // Box 3: Discounts
    doc.fillColor('#374151').fontSize(8).text('COUPON DEDUCTIONS', 300, y + 8);
    doc.fillColor('#ef4444').fontSize(12).text(`₹${totalDiscount.toFixed(2)}`, 300, y + 22);

    // Box 4: Net Revenue
    doc.fillColor('#374151').fontSize(8).text('NET REVENUE', 440, y + 8);
    doc.fillColor('#0ea5e9').fontSize(12).text(`₹${totalNet.toFixed(2)}`, 440, y + 22);

    y += 55;

    // Top Aggregations Snippet
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9).text('TOP PERFORMANCE SNAPSHOT', 35, y);
    y += 12;

    doc.rect(35, y, 255, 55).fill('#f3f4f6');
    doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(8).text('Top Products (Platform)', 40, y + 5);
    doc.font('Helvetica').fontSize(7.5).fillColor('#4b5563');
    let prodY = y + 17;
    topProducts.slice(0, 3).forEach((p, idx) => {
        doc.text(`${idx + 1}. ${p.title.slice(0, 22)} (${p.platform}): ${p.totalQuantity} sold (₹${p.totalRevenueRupees})`, 40, prodY);
        prodY += 11;
    });

    doc.rect(305, y, 255, 55).fill('#f3f4f6');
    doc.fillColor('#1f2937').font('Helvetica-Bold').fontSize(8).text('Top Categories', 310, y + 5);
    doc.font('Helvetica').fontSize(7.5).fillColor('#4b5563');
    let catY = y + 17;
    topCategories.slice(0, 3).forEach((c, idx) => {
        doc.text(`${idx + 1}. ${c.name}: ${c.totalQuantity} sold (₹${c.totalRevenueRupees})`, 310, catY);
        catY += 11;
    });

    y += 65;

    // Sales Table
    const renderTableHeaders = (currentY) => {
        doc.rect(35, currentY, 525, 18).fill('#1f2937');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8);
        doc.text('Order ID', 40, currentY + 5, { width: 75 })
           .text('Date', 120, currentY + 5, { width: 65 })
           .text('Customer', 190, currentY + 5, { width: 95 })
           .text('Payment', 290, currentY + 5, { width: 55 })
           .text('Gross', 350, currentY + 5, { width: 50, align: 'right' })
           .text('Coupon', 405, currentY + 5, { width: 45, align: 'right' })
           .text('Net (₹)', 455, currentY + 5, { width: 55, align: 'right' })
           .text('Status', 515, currentY + 5, { width: 40, align: 'center' });
        return currentY + 18;
    };

    y = renderTableHeaders(y);

    doc.font('Helvetica').fontSize(7.5);
    orders.forEach((o, index) => {
        // Page overflow check
        if (y > 750) {
            doc.addPage();
            y = 35;
            y = renderTableHeaders(y);
            doc.font('Helvetica').fontSize(7.5);
        }

        const isEven = index % 2 === 0;
        if (isEven) {
            doc.rect(35, y, 525, 16).fill('#f9fafb');
        }

        const customerName = o.userId ? (o.userId.username || o.userId.email.split('@')[0]) : 'Guest';
        const dateStrShort = new Date(o.createdAt).toLocaleDateString('en-GB');

        doc.fillColor('#374151');
        doc.text(o.orderId, 40, y + 4, { width: 75 })
           .text(dateStrShort, 120, y + 4, { width: 65 })
           .text(customerName.slice(0, 15), 190, y + 4, { width: 95 })
           .text(o.paymentMethod, 290, y + 4, { width: 55 })
           .text(`₹${((o.subtotal || 0) / 100).toFixed(2)}`, 350, y + 4, { width: 50, align: 'right' })
           .text(`₹${((o.discount || 0) / 100).toFixed(2)}`, 405, y + 4, { width: 45, align: 'right' })
           .text(`₹${((o.finalAmount || 0) / 100).toFixed(2)}`, 455, y + 4, { width: 55, align: 'right' });

        if (o.orderStatus === 'Delivered') {
            doc.fillColor('#10b981');
        } else if (o.orderStatus === 'Cancelled') {
            doc.fillColor('#ef4444');
        } else {
            doc.fillColor('#f59e0b');
        }
        doc.text(o.orderStatus.slice(0, 9), 515, y + 4, { width: 40, align: 'center' });

        y += 16;
    });

    // Page Numbering Footer on all pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#9ca3af').fontSize(7).text(`Page ${i + 1} of ${range.count} - PixelPlay Confidential`, 35, 800, { align: 'center', width: 525 });
    }

    doc.end();
};
