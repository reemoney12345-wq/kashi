const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const walletController = require('../controllers/walletController');

router.get('/', authenticate, walletController.getWallet);
router.get('/', authenticate, walletController.getBanks);
router.get('/', authenticate, walletController.getPayouts);
router.post('/bank', authenticate, walletController.saveBank);
router.post('/withdraw', authenticate, walletController.withdraw);

module.exports = router;