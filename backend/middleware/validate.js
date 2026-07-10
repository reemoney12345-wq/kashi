const validate = (schema) => {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rules] of Object.entries(schema)) {
            const value = req.body[field];

            if (rules.required && (value === undefined || value === null || value === '')) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value === undefined || value === null || value === '') continue;

            if (rules.minLength && value.length < rules.minLength) {
                errors.push(`${field} must be at least ${rules.minLength} characters`);
            }

            if (rules.maxLength && value.length > rules.maxLength) {
                errors.push(`${field} must be at most ${rules.maxLength} characters`);
            }

            if (rules.isEmail && !require('../utils/validators').validateEmail(value)) {
                errors.push(`${field} must be a valid email`);
            }

            if (rules.isPhone && !require('../utils/validators').validateNigerianPhone(value)) {
                errors.push(`${field} must be a valid Nigerian phone number`);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({ errors });
        }

        next();
    };
};

module.exports = { validate };