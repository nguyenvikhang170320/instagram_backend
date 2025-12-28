const admin = require("firebase-admin");

const protect = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1]; // Lấy token từ Header
        if (!token) return res.status(401).json({ message: "Bạn chưa đăng nhập" });

        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken; // Lưu thông tin user (uid, email) vào request
        next(); // Cho phép đi tiếp vào các API phía sau
    } catch (error) {
        res.status(403).json({ message: "Token không hợp lệ hoặc đã hết hạn" });
    }
};

module.exports = protect;