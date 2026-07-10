const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/', authenticate, dashboardController.getDashboard);
router.get('/summary', authenticate, dashboardController.getSummary);
router.get('/chart-data', authenticate, dashboardController.getChartData);
router.get('/revenue', authenticate, dashboardController.getRevenue);
router.get('/earnings', authenticate, dashboardController.getEarningsChart);

module.exports = router;