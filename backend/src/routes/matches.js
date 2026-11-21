const express = require('express');
const router = express.Router();
require('./matches_routes_1')(router);
require('./matches_routes_2')(router);
require('./matches_routes_3')(router);
module.exports = router;
