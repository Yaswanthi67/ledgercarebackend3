import multer from 'multer';

// Use memory storage for fast in-memory hashing and direct IPFS piping
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allowed evidence file types: PDF, images, text/documents
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'text/plain',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed types are PDF, JPG, PNG, WEBP.`
      ),
      false
    );
  }
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB max file size
  },
  fileFilter,
});
