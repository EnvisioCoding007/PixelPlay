import * as dashboardService from '../../services/admin/dashboardService.js';
import * as dashboardExportService from '../../services/admin/dashboardExportService.js';

export const renderDashboard = async (req, res) => {
    try {
        const {
            period = 'monthly',
            startDate = '',
            endDate = '',
            status = 'All',
            page = 1,
            limit = 10
        } = req.query;

        const dateFilter = dashboardService.buildDateFilter(period, startDate, endDate);

        const [
            overview,
            topProducts,
            topCategories,
            topPublishers,
            chartData,
            salesReport
        ] = await Promise.all([
            dashboardService.getDashboardOverview(dateFilter),
            dashboardService.getTopProducts(5, dateFilter),
            dashboardService.getTopCategories(5, dateFilter),
            dashboardService.getTopPublishers(5, dateFilter),
            dashboardService.getSalesChartData(period, startDate, endDate),
            dashboardService.getSalesReportData({ period, startDate, endDate, status, page, limit })
        ]);

        res.render('admin/dashboard', {
            activeTab: 'dashboard',
            overview,
            topProducts,
            topCategories,
            topPublishers,
            chartData,
            salesReport,
            filters: {
                period,
                startDate,
                endDate,
                status,
                page: parseInt(page, 10),
                limit: parseInt(limit, 10)
            },
            user: req.session.admin || null
        });
    } catch (err) {
        console.error('[renderDashboard Error]', err);
        res.status(500).send('Internal Server Error while loading Admin Dashboard');
    }
};

export const getChartData = async (req, res) => {
    try {
        const { period = 'monthly', startDate = '', endDate = '' } = req.query;

        const dateFilter = dashboardService.buildDateFilter(period, startDate, endDate);

        const [chartData, overview, topProducts, topCategories, topPublishers] = await Promise.all([
            dashboardService.getSalesChartData(period, startDate, endDate),
            dashboardService.getDashboardOverview(dateFilter),
            dashboardService.getTopProducts(5, dateFilter),
            dashboardService.getTopCategories(5, dateFilter),
            dashboardService.getTopPublishers(5, dateFilter)
        ]);

        return res.json({
            success: true,
            chartData,
            overview,
            topProducts,
            topCategories,
            topPublishers
        });
    } catch (err) {
        console.error('[getChartData Error]', err);
        return res.status(500).json({ success: false, message: 'Failed to fetch dashboard chart data.' });
    }
};

export const exportSalesReportExcel = async (req, res) => {
    try {
        const { period = 'all', startDate = '', endDate = '', status = 'All' } = req.query;

        const fileName = `PixelPlay_Sales_Report_${period}_${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await dashboardExportService.generateSalesExcelReport({ period, startDate, endDate, status }, res);
    } catch (err) {
        console.error('[exportSalesReportExcel Error]', err);
        if (!res.headersSent) {
            res.status(500).send('Failed to generate Excel sales report.');
        }
    }
};

export const exportSalesReportPDF = async (req, res) => {
    try {
        const { period = 'all', startDate = '', endDate = '', status = 'All' } = req.query;

        const fileName = `PixelPlay_Sales_Report_${period}_${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await dashboardExportService.generateSalesPDFReport({ period, startDate, endDate, status }, res);
    } catch (err) {
        console.error('[exportSalesReportPDF Error]', err);
        if (!res.headersSent) {
            res.status(500).send('Failed to generate PDF sales report.');
        }
    }
};
