const multer = require("multer");

const storage = multer.memoryStorage();

const uploadImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith("image/")) {
            return cb(null, true);
        }
        return cb(new Error("Chỉ được phép upload file hình ảnh!"), false);
    },
});

module.exports = uploadImage;
