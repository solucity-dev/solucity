import multer from 'multer';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const imageFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new Error('invalid_file_type'));
  }
  cb(null, true);
};
