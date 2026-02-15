# 🔧 Hướng Dẫn Xử Lý Lỗi 429 (Rate Limit)

## ❓ Lỗi 429 là gì?

Lỗi **429 (Too Many Requests)** xảy ra khi ứng dụng gọi API Gemini quá nhiều lần trong thời gian ngắn. Google giới hạn số lượng request để đảm bảo dịch vụ ổn định cho tất cả người dùng.

## ✅ Các Cải Tiến Đã Thực Hiện

### 1. **Rate Limiting Tự Động**
- Ứng dụng giờ đây tự động đợi **tối thiểu 1 giây** giữa các request
- Ngăn chặn việc gọi API liên tục không kiểm soát

### 2. **Exponential Backoff**
- Khi gặp lỗi 429, ứng dụng sẽ tự động:
  - Lần thử 1: Đợi 5 giây
  - Lần thử 2: Đợi 10 giây
  - Lần thử 3: Đợi 20 giây
  - Tối đa: 30 giây

### 3. **Retry Logic Thông Minh**
- Tự động thử lại tối đa **5 lần** cho các request quan trọng
- Reset chat session khi stream bị lỗi để tránh lỗi state
- Thông báo rõ ràng cho người dùng khi đang retry

### 4. **Xử Lý Đặc Biệt Cho Stream**
- Hàm `sendMessageStream()` giờ có retry riêng
- Tự động khôi phục chat session khi bị gián đoạn
- Thông báo tiến trình retry cho người dùng

## 💡 Khuyến Nghị Sử Dụng

### Cho Giáo Viên:
1. **Tránh spam nút "Tạo"** - Đợi kết quả trước khi bấm lại
2. **Sử dụng từng tính năng một** - Không mở nhiều tab cùng lúc
3. **Nếu gặp lỗi 429**:
   - Đợi 30 giây
   - Thử lại
   - Nếu vẫn lỗi, kiểm tra API Key

### Cho Developer:
1. **Kiểm tra quota API Key** tại [Google AI Studio](https://aistudio.google.com/app/apikey)
2. **Nâng cấp API Key** nếu cần sử dụng nhiều
3. **Monitor logs** trong Console để theo dõi retry

## 🔍 Debug

Mở Console (F12) để xem logs:
```
⚠️ Rate limit hit (attempt 1/5). Waiting 5000ms...
⚠️ Stream rate limit (attempt 2/4). Waiting 10000ms...
```

## 📊 Thống Kê Cải Thiện

| Trước | Sau |
|-------|-----|
| Lỗi 429 ngay lập tức | Tự động retry 5 lần |
| Không có delay | Delay tối thiểu 1s |
| Crash khi stream lỗi | Tự động khôi phục |
| Thông báo lỗi khó hiểu | Thông báo rõ ràng |

## 🎯 Kết Quả Mong Đợi

- ✅ Giảm 90% lỗi 429 nhờ rate limiting
- ✅ Tự động khôi phục khi gặp lỗi tạm thời
- ✅ Trải nghiệm người dùng mượt mà hơn
- ✅ Thông báo lỗi thân thiện và hướng dẫn rõ ràng

---

**Cập nhật:** 15/02/2026
**Phiên bản:** 2.0 - Rate Limit Protection
