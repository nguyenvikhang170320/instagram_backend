const admin = require("firebase-admin");

// 👇 Cách này an toàn hơn, tự động parse JSON chuẩn
const serviceAccount = require("./firebase-admin.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Test kết nối nhẹ
console.log("🔥 Đang khởi tạo Firebase...");

module.exports = { db, admin };