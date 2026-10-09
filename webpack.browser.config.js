//@ts-check

const config = require('./webpack.config');

module.exports = config.filter(c =>
  c.target === 'webworker' || c.target === 'web'
);
