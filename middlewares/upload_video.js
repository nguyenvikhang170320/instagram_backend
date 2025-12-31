const multer = require("multer");

const storage = multer.memoryStorage();

const uploadVideo = multer({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype && file.mimetype.startsWith("video/")) return cb(null, true);
        return cb(new Error("Chỉ được phép upload file video!"), false);
    },
});

module.exports = uploadVideo;
