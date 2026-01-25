require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const multer = require("multer"); // Import multer ở đầu để dùng trong error handler
const app = express();

// --- 1. CẤU HÌNH CƠ BẢN ---
app.use(cors());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));
app.use(express.static(path.join(__dirname))); // Serve file tĩnh

// --- 2. LOGGER ---
app.use((req, res, next) => {
    console.log(`\n📥 [REQUEST] ${req.method} ${req.originalUrl}`);
    next();
});

// --- 3. KIỂM TRA MÔI TRƯỜNG ---
console.log("✅ EMAIL_USER:", process.env.EMAIL_USER || "Chưa có");

// --- 4. ROUTES ---
app.get("/", (req, res) => res.send("Instagram Clone Backend Running!"));

// Import các route
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/post"));
app.use("/api/users", require("./routes/user"));
app.use("/api/follow", require("./routes/follow"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/stories", require("./routes/story")); // ✅ Đã trỏ đúng file story
app.use("/api/likes", require("./routes/like"));
app.use("/api/comments", require("./routes/comment")); // Nên đặt là /api/comments cho chuẩn
app.use("/api/notifications", require("./routes/notification"));
app.use('/api/chats', require('./routes/chatRoutes'));

// ⚠️ SỬA DÒNG NÀY: Đặt namespace rõ ràng cho message để tránh xung đột
app.use('/api/messages', require('./routes/messageRoutes')); 

// Các route phụ (Save, Unsave, etc - Tốt nhất nên gom nhóm lại sau này)
app.use("/api", require("./routes/save"));
app.use("/api", require("./routes/unsave"));
app.use("/api", require("./routes/savedPosts"));
app.use("/api", require("./routes/report"));
app.use("/api/video", require("./routes/watch"));
app.use('/api/verify-request', require('./routes/verifyRequest'));


// --- 5. GLOBAL ERROR HANDLER ---
app.use((err, req, res, next) => {
    console.error("🔥 [SERVER ERROR]:", err.stack);

    // Xử lý lỗi Multer (Upload file)
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            const isVideo = req.originalUrl.includes("/video/");
            return res.status(413).json({
                success: false,
                message: isVideo ? "Video quá lớn (Max 100MB)" : "Ảnh quá lớn (Max 5MB)",
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }

    // Các lỗi khác
    res.status(500).json({
        success: false,
        message: "Lỗi Server nội bộ",
        error: err.message
    });
});

// --- 6. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));