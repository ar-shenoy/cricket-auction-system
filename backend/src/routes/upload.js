const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getPlayers, updatePlayer } = require('../data/store');

const router = express.Router();

const photosDir = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1.5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
  }
});

router.post('/image', authMiddleware, requireRole('admin'), (req, res) => {
  memoryUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required (field name: file)' });
    }

    try {
      const { buffer, mimetype, size, originalname } = req.file;
      const DATA_URL_LIMIT = 400 * 1024;

      if (size <= DATA_URL_LIMIT) {
        const b64 = buffer.toString('base64');
        const url = `data:${mimetype};base64,${b64}`;
        return res.json({
          url,
          storage: 'data',
          size,
          message: 'Stored in system (data URL – survives restarts)'
        });
      }

      const ext = (path.extname(originalname) || '.jpg').toLowerCase().replace(/[^.a-z0-9]/g, '') || '.jpg';
      const filename = `${uuidv4()}${ext}`;
      const filepath = path.join(photosDir, filename);
      fs.writeFileSync(filepath, buffer);

      const base =
        process.env.PUBLIC_URL ||
        process.env.KEEP_ALIVE_URL ||
        `${req.protocol}://${req.get('host')}`;
      const url = `${String(base).replace(/\/$/, '')}/uploads/photos/${filename}`;

      return res.json({
        url,
        storage: 'disk',
        size,
        message: 'Saved on server disk. On free-tier hosts this may be lost after redeploy – prefer URL or smaller images.'
      });
    } catch (e) {
      console.error('Upload error:', e);
      return res.status(500).json({ error: 'Failed to process image' });
    }
  });
});

router.post('/bulk-photos', authMiddleware, requireRole('admin'), (req, res) => {
  memoryUpload.array('files', 80)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed' });
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'No files' });
    const players = getPlayers();
    const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    let matched = 0;
    const results = [];
    for (const file of files) {
      const base = path.basename(file.originalname, path.extname(file.originalname));
      const key = norm(base);
      let player = players.find(p => p.id === base || norm(p.name) === key);
      if (!player) {
        player = players.find(p => norm(p.name).includes(key) || key.includes(norm(p.name)));
      }
      if (!player) {
        results.push({ file: file.originalname, status: 'unmatched' });
        continue;
      }
      let url;
      if (file.size <= 400 * 1024) {
        const b64 = file.buffer.toString('base64');
        url = `data:${file.mimetype};base64,${b64}`;
      } else {
        const name = `${player.id}-${Date.now()}${path.extname(file.originalname) || '.jpg'}`;
        fs.writeFileSync(path.join(photosDir, name), file.buffer);
        url = `/uploads/photos/${name}`;
      }
      updatePlayer(player.id, { photoUrl: url });
      matched++;
      results.push({ file: file.originalname, status: 'matched', playerId: player.id, playerName: player.name });
    }
    res.json({ matched, total: files.length, results });
  });
});

module.exports = router;
