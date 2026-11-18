const multer = require('multer');
const { badRequest } = require('../utils/http');

// Keep uploads in memory: Sharp processes the buffer, only the optimised
// 500x500 result is written to disk.
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif', 'image/bmp', 'image/tiff'];

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) return cb(badRequest('Only image files are allowed'));
    cb(null, true);
  },
});

// For database restore uploads (JSON backup files)
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024, files: 1 },
});

module.exports = { imageUpload, backupUpload };
