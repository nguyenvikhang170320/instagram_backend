require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require('path');
const app = express();

// --- 1. CẤU HÌNH CƠ BẢN (Phải nằm trên cùng) ---
app.use(cors());

// Tăng giới hạn body lên ngay từ đầu để tránh lỗi "Payload too large"
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ limit: "200mb", extended: true }));

// Serve file tĩnh (cho trang xác minh html)
app.use(express.static(path.join(__dirname)));

// --- 2. LOGGER (Quan trọng: Đặt ở đây để xem request trước khi vào Route) ---
app.use((req, res, next) => {
    console.log(`\n📥 [REQUEST] ${req.method} ${req.originalUrl}`);
    // console.log("🔹 Headers:", req.headers); // Bỏ comment nếu muốn xem header
    if (Object.keys(req.body).length > 0) {
        console.log("📦 Body:", JSON.stringify(req.body, null, 2));
    }
    next();
});

// --- 3. KIỂM TRA MÔI TRƯỜNG ---
console.log("✅ EMAIL_USER:", process.env.EMAIL_USER || "Chưa có");
// Không log pass để bảo mật

// --- 4. ROUTES (Định nghĩa các đường dẫn) ---
app.get("/", (req, res) => {
    res.send("Instagram Clone Backend Running!");
});

// Test Cloudinary
const { cloudinary } = require("./cloudinary");
app.get("/test-cloudinary", async (req, res) => {
    try {
        const result = await cloudinary.uploader.upload(
            "https://res.cloudinary.com/demo/image/upload/sample.jpg"
        );
        res.json({ message: "Cloudinary connected!", result });
    } catch (error) {
        res.status(500).json({ message: "Cloudinary connection failed!", error });
    }
});

// Import các route
app.use("/api/auth", require("./routes/auth"));
app.use("/api/posts", require("./routes/post"));
app.use("/api/users", require("./routes/user"));
app.use("/api/follow", require("./routes/follow"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/", require("./routes/debugpost"));
app.use("/api", require("./routes/save"));
app.use("/api", require("./routes/unsave"));
app.use("/api", require("./routes/savedPosts"));
app.use("/api/likes", require("./routes/like"));
app.use("/api", require("./routes/comment"));
app.use("/api", require("./routes/report"));
app.use("/api/stories", require("./routes/story"));
app.use("/api/video", require("./routes/watch"));
app.use("/api/notifications", require("./routes/notification"));
app.use('/api/verify-request', require('./routes/verifyRequest'));
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api', require('./routes/messageRoutes'));

// --- 5. GLOBAL ERROR HANDLER (Bắt lỗi 500 Crash Server) ---
// Đoạn này cực quan trọng: Nếu server crash ở bất kỳ đâu, nó sẽ nhảy vào đây
// và in lỗi ra terminal thay vì chỉ báo "Internal Server Error" chung chung.
app.use((err, req, res, next) => {
    console.error("🔥 [SERVER ERROR]:", err.stack); // In chi tiết lỗi ra Terminal
    res.status(500).json({
        success: false,
        message: "Lỗi Server nội bộ (Check terminal for details)",
        error: err.message
    });
});
app.use((err, req, res, next) => {
    // multer file size
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
                success: false,
                message: "File quá lớn. Tối đa 100MB.",
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }

    // fileFilter error: new Error("Chỉ được phép upload file video!")
    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }

    next();
});

const multer = require("multer");

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
            const isVideo = req.originalUrl.includes("/video/");
            return res.status(413).json({
                success: false,
                message: isVideo
                    ? "Video quá lớn. Tối đa 100MB."
                    : "Ảnh quá lớn. Tối đa 5MB.",
            });
        }
        return res.status(400).json({ success: false, message: err.message });
    }

    if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }

    next();
});

// --- 6. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));