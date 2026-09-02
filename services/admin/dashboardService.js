import Order from '../../models/Order.js';

/**
 * Builds Date filter based on preset period or custom range
 */
export const buildDateFilter = (period = 'all', startDate = null, endDate = null) => {
    const filter = {};
    const now = new Date();

    if (period === 'daily') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        filter.createdAt = { $gte: startOfDay, $lte: endOfDay };
    } else if (period === 'weekly') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - 7);
        startOfWeek.setHours(0, 0, 0, 0);
        filter.createdAt = { $gte: startOfWeek, $lte: now };
    } else if (period === 'monthly') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        filter.createdAt = { $gte: startOfMonth, $lte: now };
    } else if (period === 'yearly') {
        const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        filter.createdAt = { $gte: startOfYear, $lte: now };
    } else if (period === 'custom' && (startDate || endDate)) {
        filter.createdAt = {};
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            filter.createdAt.$gte = start;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            filter.createdAt.$lte = end;
        }
    }

    return filter;
};

/**
 * Overview statistics summary
 */
export const getDashboardOverview = async (dateFilter = {}) => {
    const matchStage = {
        orderStatus: { $ne: 'Cancelled' },
        ...dateFilter
    };

    const overviewAggregation = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                grossSales: { $sum: '$subtotal' },
                couponDeductions: { $sum: '$discount' },
                shippingTotal: { $sum: '$shipping' },
                taxTotal: { $sum: '$tax' },
                netRevenue: { $sum: '$finalAmount' }
            }
        }
    ]);

    const result = overviewAggregation[0] || {
        totalOrders: 0,
        grossSales: 0,
        couponDeductions: 0,
        shippingTotal: 0,
        taxTotal: 0,
        netRevenue: 0
    };

    return {
        totalOrders: result.totalOrders,
        grossSalesRupees: result.grossSales / 100,
        couponDeductionsRupees: result.couponDeductions / 100,
        shippingRupees: result.shippingTotal / 100,
        taxRupees: result.taxTotal / 100,
        netRevenueRupees: result.netRevenue / 100
    };
};

/**
 * Top 5 Best Selling Products along with platform breakdown
 */
export const getTopProducts = async (limit = 5, dateFilter = {}) => {
    const matchStage = {
        orderStatus: { $ne: 'Cancelled' },
        ...dateFilter
    };

    const topProducts = await Order.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        { $match: { 'items.status': { $ne: 'Cancelled' } } },
        {
            $group: {
                _id: {
                    product: '$items.product',
                    platform: '$items.platform'
                },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenuePaisa: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
        { $sort: { totalQuantity: -1, totalRevenuePaisa: -1 } },
        { $limit: limit },
        {
            $lookup: {
                from: 'products',
                localField: '_id.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: '$productInfo' },
        {
            $project: {
                productId: '$_id.product',
                platform: '$_id.platform',
                title: '$productInfo.title',
                coverImage: '$productInfo.cover_image',
                publisher: '$productInfo.publisher',
                totalQuantity: 1,
                totalRevenueRupees: { $divide: ['$totalRevenuePaisa', 100] }
            }
        }
    ]);

    return topProducts;
};

/**
 * Top 5 Best Selling Categories aggregation
 */
export const getTopCategories = async (limit = 5, dateFilter = {}) => {
    const matchStage = {
        orderStatus: { $ne: 'Cancelled' },
        ...dateFilter
    };

    const topCategories = await Order.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        { $match: { 'items.status': { $ne: 'Cancelled' } } },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: '$productInfo' },
        {
            $lookup: {
                from: 'categories',
                localField: 'productInfo.category',
                foreignField: '_id',
                as: 'categoryInfo'
            }
        },
        { $unwind: '$categoryInfo' },
        {
            $group: {
                _id: '$categoryInfo._id',
                name: { $first: '$categoryInfo.name' },
                icon: { $first: '$categoryInfo.icon' },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenuePaisa: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
        { $sort: { totalQuantity: -1, totalRevenuePaisa: -1 } },
        { $limit: limit },
        {
            $project: {
                categoryId: '$_id',
                name: 1,
                icon: 1,
                totalQuantity: 1,
                totalRevenueRupees: { $divide: ['$totalRevenuePaisa', 100] }
            }
        }
    ]);

    return topCategories;
};

/**
 * Top 5 Best Selling Publishers aggregation
 */
export const getTopPublishers = async (limit = 5, dateFilter = {}) => {
    const matchStage = {
        orderStatus: { $ne: 'Cancelled' },
        ...dateFilter
    };

    const topPublishers = await Order.aggregate([
        { $match: matchStage },
        { $unwind: '$items' },
        { $match: { 'items.status': { $ne: 'Cancelled' } } },
        {
            $lookup: {
                from: 'products',
                localField: 'items.product',
                foreignField: '_id',
                as: 'productInfo'
            }
        },
        { $unwind: '$productInfo' },
        {
            $group: {
                _id: '$productInfo.publisher',
                name: { $first: '$productInfo.publisher' },
                totalQuantity: { $sum: '$items.quantity' },
                totalRevenuePaisa: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
            }
        },
        { $sort: { totalQuantity: -1, totalRevenuePaisa: -1 } },
        { $limit: limit },
        {
            $project: {
                publisherId: '$_id',
                name: 1,
                totalQuantity: 1,
                totalRevenueRupees: { $divide: ['$totalRevenuePaisa', 100] }
            }
        }
    ]);

    return topPublishers;
};

/**
 * Sales Chart Data over time intervals
 */
export const getSalesChartData = async (period = 'monthly', startDate = null, endDate = null) => {
    const dateFilter = buildDateFilter(period, startDate, endDate);
    const matchStage = {
        orderStatus: { $ne: 'Cancelled' },
        ...dateFilter
    };

    let dateFormat = '%Y-%m-%d';
    if (period === 'daily') {
        dateFormat = '%Y-%m-%d %H:00';
    } else if (period === 'yearly') {
        dateFormat = '%Y-%m';
    }

    const chartAggregation = await Order.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
                totalSalesPaisa: { $sum: '$finalAmount' },
                orderCount: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    const labels = chartAggregation.map(item => item._id);
    const salesDataRupees = chartAggregation.map(item => item.totalSalesPaisa / 100);
    const ordersData = chartAggregation.map(item => item.orderCount);

    return {
        labels,
        salesDataRupees,
        ordersData
    };
};

/**
 * Sales Report with summary and paginated table data
 */
export const getSalesReportData = async (options = {}) => {
    const {
        period = 'all',
        startDate = null,
        endDate = null,
        status = 'All',
        page = 1,
        limit = 10
    } = options;

    const dateFilter = buildDateFilter(period, startDate, endDate);
    const filter = { ...dateFilter };

    if (status && status !== 'All') {
        filter.orderStatus = status;
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const skip = (pageNum - 1) * limitNum;

    // Aggregated Summary for the selected filter
    const summaryAgg = await Order.aggregate([
        { $match: filter },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                grossSales: { $sum: '$subtotal' },
                couponDeductions: { $sum: '$discount' },
                shippingTotal: { $sum: '$shipping' },
                taxTotal: { $sum: '$tax' },
                netSales: { $sum: '$finalAmount' }
            }
        }
    ]);

    const rawSummary = summaryAgg[0] || {
        totalOrders: 0,
        grossSales: 0,
        couponDeductions: 0,
        shippingTotal: 0,
        taxTotal: 0,
        netSales: 0
    };

    const summary = {
        totalOrders: rawSummary.totalOrders,
        grossSalesRupees: rawSummary.grossSales / 100,
        couponDeductionsRupees: rawSummary.couponDeductions / 100,
        shippingRupees: rawSummary.shippingTotal / 100,
        taxRupees: rawSummary.taxTotal / 100,
        netSalesRupees: rawSummary.netSales / 100
    };

    const [orders, totalCount] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum)
            .populate('userId', 'username email')
            .populate('items.product', 'title')
            .lean(),
        Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalCount / limitNum) || 1;

    return {
        orders,
        summary,
        pagination: {
            totalCount,
            totalPages,
            currentPage: pageNum,
            limit: limitNum
        }
    };
};
