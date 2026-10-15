const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware, requireRole } = require('../middleware/auth');

const router = express.Router();

const photosDir = path.join(__dirname, '../uploads/photos');
if (!fs.existsSync(photosDir)) {
  fs.mkdirSync(photosDir, { recursive: true });
}

// Memory storage so we can either return a data-URL (persists in JSON) or write to disk
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1.5 * 1024 * 1024 }, // 1.5 MB
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP or GIF images are allowed'));
  }
});

/**
 * POST /api/upload/image
 * Admin only. Multipart field name: "file"
 *
 * Strategy (lightweight + free-tier friendly):
 * - Files <= 400 KB -> store as data URL (survives Render restarts, lives in JSON)
 * - Larger files -> save under /uploads/photos and return a public URL
 *   (works until the free-tier disk is wiped on redeploy)
 *
 * Returns: { url: string, storage: 'data'|'disk', size: number }
 */
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
      const DATA_URL_LIMIT = 400 * 1024; // 400 KB

      if (size <= DATA_URL_LIMIT) {
        const b64 = buffer.toString('base64');
        const url = `data:${mimetype};base64,${b64}`;
        return res.json({
          url,
          storage: 'data',
          size,
          message: 'Stored in system (data URL - survives restarts)'
        });
      }

      // Disk path for larger images
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
        message: 'Saved on server disk. On free-tier hosts this may be lost after redeploy - prefer URL or smaller images.'
      });
    } catch (e) {
      console.error('Upload error:', e);
      return res.status(500).json({ error: 'Failed to process image' });
    }
  });
});

module.exports = router;
