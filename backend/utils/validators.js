const validator = require('validator');

const validateEmail = (email) => {
    return validator.isEmail(email);
};

const validateNigerianPhone = (phone) => {
    const cleaned = phone.replace(/[\s\-\(\)]/g, '');
    return /^(\+234|0)[7-9]\d{9}$/.test(cleaned);
};

const validatePassword = (password) => {
    return password && password.length >= 8;
};

const validateAccountNumber = (accountNumber) => {
    return /^\d{10}$/.test(accountNumber);
};

module.exports = {
    validateEmail,
    validateNigerianPhone,
    validatePassword,
    validateAccountNumber,
};