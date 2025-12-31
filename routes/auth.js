const express = require("express");
const bcrypt = require("bcryptjs");
const { db, admin } = require("../firebase");
const { body, validationResult } = require("express-validator");
const nodemailer = require("nodemailer");

const router = express.Router();

// --- ĐĂNG KÝ ---
router.post("/register", async (req, res) => {
    try {
        const { username, fullname, email, password } = req.body;

        // 1. Tạo User trên Firebase Authentication
        // Firebase Auth sẽ tự kiểm tra nếu email đã tồn tại
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: fullname,
        });

        const uid = userRecord.uid;

        // 2. Mã hóa mật khẩu (chỉ để lưu dự phòng/logic cũ nếu bạn muốn, 
        // thực tế Auth đã quản lý rồi, nhưng mình giữ lại theo code cũ của bạn)
        const hashedPassword = await bcrypt.hash(password, 10);

        // 3. Tạo user mới trong Firestore với ID trùng với UID của Auth
        await db.collection("users").doc(uid).set({
            userId: uid,
            username,
            fullname,
            email,
            password: hashedPassword, // Có thể bỏ dòng này nếu hoàn toàn tin dùng Auth
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            avatar: "",
            bio: "",
            isVerified: false
        });

        res.status(201).json({
            success: true,
            message: "Đăng ký thành công",
            userId: uid
        });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') {
            return res.status(400).json({ error: "Email này đã được sử dụng!" });
        }
        res.status(500).json({ error: error.message });
    }
});

// --- ĐĂNG NHẬP ---
router.post("/login", [
    body("email").isEmail().withMessage("Email không hợp lệ"),
    body("password").notEmpty().withMessage("Mật khẩu không được để trống"),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
        // Tìm user trong Firestore để lấy UID và password hash
        const snapshot = await db.collection("users").where("email", "==", email).get();
        if (snapshot.empty) return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });

        const userDoc = snapshot.docs[0];
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, userData.password);
        if (!isMatch) return res.status(400).json({ message: "Email hoặc mật khẩu không đúng" });

        // Tạo Firebase Custom Token để trả về cho Flutter
        // Sau đó Flutter dùng token này để signInWithCustomToken
        const token = await admin.auth().createCustomToken(userId);

        res.status(200).json({
            success: true,
            message: "Đăng nhập thành công",
            userId,
            token
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error: error.message });
    }
});


// API Quên mật khẩu
router.post("/forgot-password", async (req, res) => {
    const { email } = req.body;

    try {
        // Kiểm tra xem email đã tồn tại trong cơ sở dữ liệu chưa
        const userRef = db.collection("users").where("email", "==", email);
        const snapshot = await userRef.get();

        if (snapshot.empty) {
            return res.status(400).json({ message: "Email không tồn tại" });
        }

        let user;
        snapshot.forEach(doc => { user = doc; });

        // Kiểm tra nếu OTP còn hiệu lực thì reset lại OTP
        if (user.data().resetOtp && new Date() < user.data().otpExpiresAt.toDate()) {
            // Nếu OTP cũ còn hiệu lực, reset lại OTP cũ và cập nhật lại
            await user.ref.update({
                resetOtp: "",
                otpExpiresAt: "",
            });
            console.log("✅ OTP cũ đã được reset.");
        }

        // Tạo mã OTP mới
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiration = new Date();
        otpExpiration.setMinutes(otpExpiration.getMinutes() + 5);  // Đặt thời gian OTP là 5 phút

        console.log(`✅ Mã OTP mới đã được tạo: ${otp}`);

        // Cập nhật mã OTP và thời gian hết hạn vào cơ sở dữ liệu
        snapshot.forEach(async (doc) => {
            await doc.ref.update({ resetOtp: otp, otpExpiresAt: otpExpiration });
        });

        // Gửi email chứa OTP mới
        let transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        let mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Mã OTP để đặt lại mật khẩu",
            text: `Mã OTP của bạn là: ${otp}. Vui lòng không chia sẻ với ai.`,
        };

        await transporter.sendMail(mailOptions);

        res.json({ message: "Mã OTP đã được gửi đến email của bạn.", otp: otp });
    } catch (error) {
        res.status(500).json({ message: "Lỗi server", error });
    }
});

// API đổi mật khẩu
router.post("/reset-password", async (req, res) => {
    const { email, newPassword, otp } = req.body;

    try {
        const userRef = db.collection("users").where("email", "==", email);
        const snapshot = await userRef.get();

        if (snapshot.empty) {
            return res.status(400).json({ message: "Email không tồn tại" });
        }

        let user;
        snapshot.forEach(doc => { user = doc; });

        // Kiểm tra OTP trước khi cho phép đổi mật khẩu
        if (user.data().resetOtp !== otp || new Date() > user.data().otpExpiresAt.toDate()) {
            return res.status(400).json({ message: "Mã OTP không hợp lệ hoặc đã hết hạn" });
        }

        console.log(`✅ Mã OTP: ${otp}`);
        // Cập nhật mật khẩu
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await user.ref.update({ password: hashedPassword, resetOtp: "", otpExpiresAt: "" });
        console.log(`✅ Mật khẩu chưa mã hóa: ${newPassword}`);
        console.log(`✅ Mật khẩu đã mã hóa: ${hashedPassword}`);


        // Trả về thông báo thành công
        return res.status(200).json({ message: "Mật khẩu đã được thay đổi thành công!" });
    } catch (error) {
        console.error("Lỗi server:", error);  // In lỗi chi tiết ra console
        return res.status(500).json({ message: "Lỗi server", error: error.message });  // Trả về lỗi chi tiết
    }
});




module.exports = router;
