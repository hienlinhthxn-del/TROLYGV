import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/**
 * Đọc nội dung văn bản từ file (hỗ trợ .docx và .txt)
 */
export async function readContentFromFile(file: File): Promise<string> {
    const fileType = file.name.split('.').pop()?.toLowerCase();

    try {
        if (fileType === 'docx') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value; // Trả về văn bản thô
        } else if (fileType === 'xlsx' || fileType === 'xls') {
            const arrayBuffer = await file.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            let content = "";

            // Đọc tất cả các sheet trong file Excel
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];
                // Chuyển đổi dữ liệu sheet thành dạng text (tab-separated)
                const text = XLSX.utils.sheet_to_txt(worksheet);
                if (text.trim()) {
                    content += `--- SHEET: ${sheetName} ---\n${text}\n\n`;
                }
            });
            return content;
        } else if (fileType === 'txt' || fileType === 'md') {
            return await file.text();
        } else {
            throw new Error(`Định dạng .${fileType} chưa được hỗ trợ. Vui lòng dùng .docx, .xlsx hoặc .txt`);
        }
    } catch (error) {
        console.error("Lỗi đọc file:", error);
        throw new Error("Không thể đọc nội dung file. Vui lòng kiểm tra lại file của bạn.");
    }
}