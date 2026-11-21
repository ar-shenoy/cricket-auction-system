const express = require('express');
const router = express.Router();
require('./auctions_routes_a')(router);
require('./auctions_routes_b')(router);
module.exports = router;
