const xss = require('xss');

const sanitize = (req, res, next) => {
    if (req.body) {
        for (const key of Object.keys(req.body)) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = xss(req.body[key].trim());
            }
        }
    }
    next();
};

module.exports = { sanitize };