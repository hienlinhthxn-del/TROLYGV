import { geminiService } from "@/services/geminiService";

export interface QuizQuestion {
    question_text: string;
    options: string[];
    correct_answer: string;
    explanation?: string;
}

/**
 * Hàm phân tích PDF sử dụng Gemini Vision Native
 * Input: Base64 string của file PDF (không phải Buffer)
 */
export async function parseExamPdf(base64Data: string): Promise<QuizQuestion[]> {
    const prompt = `
    Bạn là chuyên gia số hóa đề thi. Hãy phân tích file PDF đề thi đính kèm (Trạng Nguyên Tiếng Việt, Toán Violympic, v.v.).
    File này chứa khoảng 30 câu hỏi, bao gồm cả hình ảnh và công thức toán học.

    Nhiệm vụ:
    1. Trích xuất TOÀN BỘ câu hỏi (thường là 30 câu). Không được bỏ sót bất kỳ câu nào.
    2. Giữ nguyên nội dung các công thức toán học.
    3. XỬ LÝ HÌNH ẢNH: Với các câu hỏi hoặc đáp án có hình ảnh:
       - KHÔNG được bỏ qua.
       - Hãy thêm ghi chú vào nội dung câu hỏi hoặc trường hình ảnh: "[CẮT ẢNH TỪ ĐỀ: Trang X - Mô tả hình]".
    4. Trả về kết quả CHỈ là một chuỗi JSON hợp lệ (Array of Objects).

    JSON Mẫu:
    [
      {
        "question_text": "Câu 1: ... [CẮT ẢNH TỪ ĐỀ: Trang 1 - Hình minh họa]",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
        "correct_answer": "A",
        "explanation": "Giải thích nếu có"
      }
    ]
  `;

    try {
        // Sử dụng geminiService để tận dụng khả năng xử lý lỗi và API Key động
        const result = await geminiService.generateExamQuestionsStructured(prompt, [{
            inlineData: { data: base64Data, mimeType: "application/pdf" }
        }]);

        // geminiService đã trả về JSON object, ta chỉ cần map lại nếu cần
        return result.questions || [];
    } catch (error) {
        console.error("Lỗi xử lý PDF bằng Gemini:", error);
        return [];
    }
}
