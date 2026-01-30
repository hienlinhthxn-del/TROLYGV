import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Hàm tạo giáo án chi tiết dựa trên File Mẫu và Kế Hoạch Giáo Viên
 * @param apiKey - API Key của Google Gemini
 * @param templateText - Nội dung văn bản trích xuất từ File Mẫu (Cấu trúc)
 * @param planText - Nội dung văn bản trích xuất từ Kế Hoạch Giáo Viên (Nội dung)
 * @returns Chuỗi văn bản (Markdown) của giáo án đã soạn
 */
export async function generateLessonPlanFromTemplate(
    apiKey: string,
    templateText: string,
    planText: string
): Promise<string> {
    // Khởi tạo model Gemini (sử dụng gemini-1.5-flash cho tốc độ phản hồi nhanh)
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Xây dựng câu lệnh (Prompt) chi tiết để hướng dẫn AI
    const prompt = `
    Đóng vai trò là một chuyên gia sư phạm và trợ lý giáo viên đắc lực.
    
    Nhiệm vụ của bạn là soạn thảo một GIÁO ÁN CHI TIẾT (Kế hoạch bài dạy) dựa trên hai nguồn thông tin đầu vào sau đây:

    1. CẤU TRÚC VÀ ĐỊNH DẠNG (FILE MẪU):
    Hãy tuân thủ chặt chẽ cấu trúc các mục, các phần trình bày trong văn bản dưới đây:
    """
    ${templateText}
    """

    2. NỘI DUNG VÀ YÊU CẦU CỤ THỂ (KẾ HOẠCH CỦA GIÁO VIÊN):
    Dựa vào nội dung bài học, thời lượng và yêu cầu cần đạt trong văn bản dưới đây để triển khai nội dung:
    """
    ${planText}
    """

    YÊU CẦU ĐẦU RA:
    - **Tuân thủ cấu trúc:** Giữ nguyên các tiêu đề mục (I, II, III, 1, 2, a, b...) như trong File Mẫu.
    - **Triển khai nội dung:** Điền nội dung kiến thức từ Kế Hoạch vào khung mẫu.
    - **Hoạt động chi tiết:** Viết rõ hoạt động của Giáo viên (GV) và Học sinh (HS). Nếu kế hoạch chỉ ghi vắn tắt, hãy đề xuất các hoạt động sư phạm phù hợp (thảo luận nhóm, hỏi đáp, trò chơi...) để làm rõ nội dung.
    - **Ngôn ngữ:** Sử dụng ngôn ngữ sư phạm, trang trọng, rõ ràng.
    - **Định dạng:** Trả về kết quả dưới dạng Markdown để dễ dàng hiển thị.
  `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Lỗi khi gọi AI tạo giáo án:", error);
        throw new Error("Không thể tạo giáo án lúc này. Vui lòng kiểm tra lại kết nối hoặc API Key.");
    }
}