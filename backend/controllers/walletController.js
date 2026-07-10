const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

function calculatePayout(amount) {
    if (amount > 1000) {
        const fee = amount * 0.01;
        return { netAmount: amount - fee, feeCharged: fee };
    }
    return { netAmount: amount, feeCharged: 0 };
}

const getWallet = async (req, res) => {
    try {
        const user = await db.query(
            'SELECT balance, pending_balance, is_premium, bank_name, account_number, account_name FROM users WHERE id = $1',
            [req.userId]
        );
        res.json({
            balance: {
                available: parseFloat(user.rows[0].balance),
                pending: parseFloat(user.rows[0].pending_balance),
                pendingEstimate: 'Settles within 30-60 days',
            },
            bankDetails: user.rows[0].bank_name ? {
                bankName: user.rows[0].bank_name,
                accountNumber: user.rows[0].account_number,
                accountName: user.rows[0].account_name,
            } : null,
            isPremium: user.rows[0].is_premium,
        });
    } catch (err) {
        console.error('Get wallet error:', err);
        res.status(500).json({ error: 'Failed to load wallet' });
    }
};

const getBanks = async (req, res) => {
    res.json([
        { code: 'opay', name: 'OPay' },
        { code: 'moniepoint', name: 'Moniepoint' },
        { code: 'palmpay', name: 'PalmPay' },
        { code: 'kuda', name: 'Kuda Bank' },
        { code: 'access', name: 'Access Bank' },
        { code: 'zenith', name: 'Zenith Bank' },
        { code: 'firstbank', name: 'First Bank of Nigeria' },
        { code: 'uba', name: 'United Bank for Africa (UBA)' },
        { code: 'gtbank', name: 'GTBank' },
        { code: 'fidelity', name: 'Fidelity Bank' },
        { code: 'stanbic', name: 'Stanbic IBTC Bank' },
        { code: 'ecobank', name: 'Ecobank Nigeria' },
    ]);
};

const getPayouts = async (req, res) => {
    try {
        const result = await db.query(
            'SELECT amount, fee, net_amount, bank_name, account_number, account_name, reference, status, created_at FROM payouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
            [req.userId]
        );
        res.json(result.rows.map(p => ({
            amount: parseFloat(p.amount),
            fee: parseFloat(p.fee || 0),
            netAmount: parseFloat(p.net_amount || p.amount),
            bankName: p.bank_name,
            accountNumber: p.account_number,
            accountName: p.account_name,
            reference: p.reference,
            status: p.status,
            date: new Date(p.created_at).toLocaleDateString('en-NG'),
        })));
    } catch (err) {
        console.error('Get payouts error:', err);
        res.status(500).json({ error: 'Failed to load payouts' });
    }
};

const saveBank = async (req, res) => {
    const { bankName, accountNumber, accountName } = req.body;
    if (!bankName) return res.status(400).json({ error: 'Please select a bank' });
    if (!accountNumber || !/^\d{10}$/.test(accountNumber)) return res.status(400).json({ error: 'Enter a valid 10-digit account number' });
    if (!accountName || accountName.trim().length < 3) return res.status(400).json({ error: 'Enter the account holder name' });

    try {
        await db.query(
            'UPDATE users SET bank_name = $1, account_number = $2, account_name = $3, updated_at = NOW() WHERE id = $4',
            [bankName, accountNumber, accountName.trim(), req.userId]
        );
        res.json({ message: 'Bank details saved' });
    } catch (err) {
        console.error('Save bank error:', err);
        res.status(500).json({ error: 'Failed to save bank details' });
    }
};

const withdraw = async (req, res) => {
    const { amount } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Enter a valid amount' });

    try {
        const user = await db.query(
            'SELECT balance, bank_name, account_number, account_name FROM users WHERE id = $1',
            [req.userId]
        );

        if (!user.rows[0].bank_name) return res.status(400).json({ error: 'Add your bank details first' });
        if (amount > user.rows[0].balance) return res.status(400).json({ error: 'Insufficient balance' });

        const { netAmount, feeCharged } = calculatePayout(amount);
        const reference = 'KASH-' + uuidv4().split('-')[0].toUpperCase();

        await db.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amount, req.userId]);

        await db.query(
            `INSERT INTO payouts (user_id, amount, fee, net_amount, bank_name, account_number, account_name, reference, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
            [req.userId, amount, feeCharged, netAmount, user.rows[0].bank_name, user.rows[0].account_number, user.rows[0].account_name, reference]
        );

        res.status(201).json({
            amount,
            fee: feeCharged,
            netAmount,
            bankName: user.rows[0].bank_name,
            accountNumber: user.rows[0].account_number,
            accountName: user.rows[0].account_name,
            reference,
            status: 'pending',
            date: new Date().toLocaleDateString('en-NG'),
        });
    } catch (err) {
        console.error('Withdraw error:', err);
        res.status(500).json({ error: 'Withdrawal failed' });
    }
};

module.exports = { getWallet, getBanks, getPayouts, saveBank, withdraw };