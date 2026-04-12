import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LineRuleType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";
import { convertPdfToImages, ocrImages } from './services/pdfService';

export interface DocxOptions {
    font?: string;
    fontSize?: number;
    alignment?: "left" | "center" | "right" | "justify";
    lineSpacing?: number;
}

/**
 * Làm sạch text từ OCR - loại bỏ ký tự lạ, chuẩn hóa mã hóa
 */
const cleanOCRText = (text: string): string => {
    if (!text) return '';
    
    return text
        // Loại bỏ các ký tự điều khiển lạ (control characters)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Chuẩn hóa Unicode - loại bỏ các ký tự không phải dấu (combining marks) lạ
        .replace(/[\u0300-\u036F]/g, '')
        // Thay thế dấu gạch chân lạ (underscores từ OCR nhầm tưởng) bằng khoảng trắng
        // Nhưng giữ những dấu gạch chân thật có vai trò (với khoảng trắng xung quanh)
        .replace(/(?<!\S)_+(?!\S)/g, ' ')
        // Thay thế các ký tự đặc biệt lạ (Euro €, ¥, £, v.v.) bằng ký tự tương tự tiếng Việt
        .replace(/€/g, 'Â')
        .replace(/[¥¢]/g, '')
        // Chuẩn hóa giãn cách - loại bỏ giãn cách dư thừa
        .replace(/\s+/g, ' ')
        // Loại bỏ khoảng trắng đầu cuối
        .trim();
};

/**
 * Helper function để tạo TextRun với font mặc định
 */
const createTextRun = (options: any) => {
    return new TextRun({
        ...options,
        font: options.font || 'Calibri'
    });
};

/**
 * Chuyển đổi nội dung text/markdown thành file Word và tải xuống
 */
export async function downloadLessonPlanAsDocx(content: string, fileName: string = "Giao_an_AI.docx", options: DocxOptions = {}) {
    const { font = 'Calibri', fontSize = 13, alignment = 'justify', lineSpacing = 1.5 } = options;

    const docxAlignment =
        alignment === 'left' ? AlignmentType.LEFT :
            alignment === 'center' ? AlignmentType.CENTER :
                alignment === 'right' ? AlignmentType.RIGHT :
                    AlignmentType.JUSTIFIED;

    const spacingValue = Math.round(lineSpacing * 240);
    const lines = content.split('\n');

    const children = lines.map(line => {
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith('### ')) {
            return new Paragraph({
                text: trimmedLine.replace('### ', ''),
                heading: HeadingLevel.HEADING_3,
            });
        }
        if (trimmedLine.startsWith('## ')) {
            return new Paragraph({
                text: trimmedLine.replace('## ', ''),
                heading: HeadingLevel.HEADING_2,
            });
        }
        if (trimmedLine.startsWith('# ')) {
            return new Paragraph({
                text: trimmedLine.replace('# ', ''),
                heading: HeadingLevel.HEADING_1,
            });
        }

        return new Paragraph({
            children: [createTextRun({ text: trimmedLine, font })],
            spacing: { after: 120, line: spacingValue, lineRule: LineRuleType.AUTO },
            alignment: docxAlignment
        });
    });

    const doc = new Document({
        styles: {
            default: {
                document: {
                    run: { font, size: fontSize * 2 },
                },
                heading1: {
                    run: { font, size: (fontSize + 3) * 2, bold: true },
                    paragraph: { spacing: { after: 240, before: 240 } },
                },
                heading2: {
                    run: { font, size: (fontSize + 1) * 2, bold: true },
                    paragraph: { spacing: { after: 200, before: 200 } },
                },
                heading3: {
                    run: { font, size: fontSize * 2, bold: true, italics: true },
                    paragraph: { spacing: { after: 180, before: 180 } },
                },
            },
        },
        sections: [{ properties: {}, children: children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, fileName);
}

/**
 * Xuất Phiếu học tập thành file Word chuyên nghiệp
 */
/**
 * Xuất Phiếu học tập hoặc Đề thi thành file Word chuyên nghiệp
 */
export async function exportWorksheetToDocx(worksheet: any, options?: { skipImages?: boolean }) {
    try {
        // Validation input
        if (!worksheet) {
            throw new Error('Dữ liệu phiếu học tập toàn không or undefined');
        }

        const questions = worksheet.questions || [];
        if (!Array.isArray(questions)) {
            throw new Error('Questions phải là một array');
        }

        const skipImages = options?.skipImages || false;
        console.log('[exportWorksheetToDocx] Bắt đầu export với', questions.length, 'câu hỏi, skipImages=', skipImages);

    const font = 'Calibri';
    const fontSize = 13;

    const children: any[] = [];
    const title = worksheet.title || worksheet.header || "ĐỀ THI / PHIẾU HỌC TẬP";

    // Tiêu đề
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            createTextRun({
                text: title.split('\n')[0].toUpperCase(),
                bold: true,
                size: (fontSize + 5) * 2,
                font
            })
        ],
        spacing: { after: 120 }
    }));

    // Môn học (nếu có)
    if (worksheet.subject) {
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
                createTextRun({
                    text: `Môn: ${worksheet.subject}${worksheet.grade ? ` - Lớp: ${worksheet.grade}` : ''}`,
                    italics: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { after: 240 }
        }));
    }

    // Thông tin học sinh
    children.push(new Paragraph({
        children: [
            createTextRun({
                text: "Họ và tên: ........................................................... Lớp: ................. Ngày: ..../..../20....",
                size: fontSize * 2,
                font
            })
        ],
        spacing: { after: 400 },
        border: {
            bottom: { color: "auto", space: 1, style: BorderStyle.DASH_SMALL_GAP, size: 6 }
        }
    }));

    // Ma trận đặc tả (nếu có)
    if (worksheet.matrix) {
        children.push(new Paragraph({
            children: [
                createTextRun({
                    text: "MA TRẬN ĐẶC TẢ ĐỀ THI",
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 400, after: 200 },
            alignment: AlignmentType.CENTER
        }));

        const COGNITIVE_LEVELS = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'];
        const tableRows = [
            new TableRow({
                children: [
                    new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: "Nội dung", bold: true, size: fontSize * 2 })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
                    ...COGNITIVE_LEVELS.map(l => new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: l, bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })], width: { size: 15, type: WidthType.PERCENTAGE } })),
                    new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: "Tổng cộng", bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
                ]
            })
        ];

        Object.entries(worksheet.matrix).forEach(([strand, levels]: [any, any]) => {
            let strandTotal = 0;
            const cells = [new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: strand, size: fontSize * 2 })] })] })];

            COGNITIVE_LEVELS.forEach(l => {
                const count = (levels[l]?.mcq || 0) + (levels[l]?.essay || 0);
                strandTotal += count;
                cells.push(new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: count > 0 ? count.toString() : "-", size: fontSize * 2 })], alignment: AlignmentType.CENTER })] }));
            });

            cells.push(new TableCell({ children: [new Paragraph({ children: [createTextRun({ text: strandTotal.toString(), bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })] }));
            tableRows.push(new TableRow({ children: cells }));
        });

        children.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
            margins: { bottom: 400 }
        }));

        // Sang trang mới sau ma trận
        children.push(new Paragraph({
            pageBreakBefore: true,
            children: [createTextRun({ text: " " })]
        }));
    }

    // Bài đọc hiểu (nếu có)
    if (worksheet.readingPassage && worksheet.readingPassage.trim()) {
        children.push(new Paragraph({
            children: [
                createTextRun({
                    text: "BÀI ĐỌC HIỂU",
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 240, after: 200 },
            alignment: AlignmentType.CENTER
        }));

        // Xuất nội dung bài đọc hiểu
        const readingLines = worksheet.readingPassage.split('\n');
        readingLines.forEach((line: string) => {
            children.push(new Paragraph({
                children: [
                    createTextRun({
                        text: line.trim() || " ",
                        size: fontSize * 2,
                        font,
                        italics: true
                    })
                ],
                spacing: { after: 100 },
                alignment: AlignmentType.LEFT,
                indent: { left: 720 }
            }));
        });

        children.push(new Paragraph({
            children: [createTextRun({ text: " " })],
            spacing: { after: 240 }
        }));
    }

    // Câu hỏi
    children.push(new Paragraph({
        children: [
            createTextRun({
                text: "NỘI DUNG ĐỀ THI",
                bold: true,
                size: fontSize * 2,
                font
            })
        ],
        spacing: { before: 240, after: 240 },
        alignment: AlignmentType.CENTER
    }));

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const qContent = q.question || q.content || "";
        const qImage = q.imageUrl || q.image || "";

        // Tiêu đề câu hỏi
        children.push(new Paragraph({
            children: [
                createTextRun({
                    text: `Câu ${i + 1}: ${qContent}`,
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 240, after: 120 }
        }));

        // Hình ảnh minh họa (nếu có)
        if (!skipImages && qImage && qImage !== 'error' && typeof qImage === 'string') {
            try {
                if (!qImage.trim().startsWith('<svg')) {
                    const imageBuffer = await fetchImageAsArrayBuffer(qImage);
                    if (imageBuffer) {
                        children.push(new Paragraph({
                            alignment: AlignmentType.CENTER,
                            children: [
                                new ImageRun({
                                    data: imageBuffer,
                                    transformation: {
                                        width: 300,
                                        height: 200,
                                    },
                                    type: "png"
                                })
                            ],
                            spacing: { before: 120, after: 120 }
                        }));
                    }
                }
            } catch (e) {
                console.warn(`Lỗi khi chèn ảnh câu ${i + 1}:`, e);
                // Tiếp tục nếu ảnh fail, không crash document
            }
        }

        // Tùy chọn (cho MCQ, TF, Reading)
        if (q.options && q.options.length > 0) {
            if (q.type === 'compare') {
                // Already in content
            } else if (q.type === 'arrange' || q.type === 'circle') {
                const optText = q.options.map((o: any) => typeof o === 'string' ? o : o.text).join(", ");
                children.push(new Paragraph({
                    children: [
                        createTextRun({
                            text: `Các gợi ý: ${optText}`,
                            italics: true,
                            size: (fontSize - 1) * 2,
                            font
                        })
                    ],
                    spacing: { after: 120 }
                }));
            } else {
                // MCQ layout (2 columns)
                for (let j = 0; j < q.options.length; j += 2) {
                    const opt1 = q.options[j];
                    const opt1Text = typeof opt1 === 'string' ? opt1 : opt1.text;

                    const rowChildren = [
                        createTextRun({
                            text: `${String.fromCharCode(65 + j)}. ${opt1Text}`,
                            size: fontSize * 2,
                            font
                        })
                    ];

                    if (j + 1 < q.options.length) {
                        const opt2 = q.options[j + 1];
                        const opt2Text = typeof opt2 === 'string' ? opt2 : opt2.text;
                        rowChildren.push(createTextRun({
                            text: `\t${String.fromCharCode(65 + j + 1)}. ${opt2Text}`,
                            size: fontSize * 2,
                            font
                        }));
                    }
                    children.push(new Paragraph({
                        children: rowChildren,
                        spacing: { after: 100 }
                    }));
                }
            }
        }

        // Dòng kẻ trả lời
        const isEssay = q.type === 'Tự luận' || q.type === 'essay' || q.type === 'fill' || (!q.options || q.options.length === 0);
        if (isEssay) {
            const lineCount = (q.type === 'Tự luận' || q.type === 'essay') ? 4 : 1;
            for (let l = 0; l < lineCount; l++) {
                children.push(new Paragraph({
                    children: [
                        createTextRun({
                            text: l === 0 ? "Trả lời: ........................................................................................................................................................" : "..........................................................................................................................................................................",
                            size: fontSize * 2,
                            font
                        })
                    ],
                    spacing: { after: 120 }
                }));
            }
        }
    }

    // Lời chúc cuối trang
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            createTextRun({
                text: "--- Hết ---",
                bold: true,
                size: fontSize * 2,
                font
            })
        ],
        spacing: { before: 400, after: 400 }
    }));

    // Đáp án & Hướng dẫn chấm (vào trang mới)
    children.push(new Paragraph({
        pageBreakBefore: true,
        children: [createTextRun({ text: " " })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            createTextRun({
                text: "ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM",
                bold: true,
                size: (fontSize + 2) * 2,
                font
            })
        ],
        spacing: { after: 240 }
    }));

    for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        children.push(new Paragraph({
            children: [
                createTextRun({
                    text: `Câu ${i + 1}: ${q.answer || "............... "}`,
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { after: 120 }
        }));

        if (q.explanation) {
            children.push(new Paragraph({
                children: [
                    createTextRun({
                        text: `Giải thích: ${q.explanation}`,
                        italics: true,
                        size: fontSize * 2,
                        font
                    })
                ],
                spacing: { after: 200 },
                indent: { left: 720 }
            }));
        }
    }

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,
                        right: 1440,
                        bottom: 1440,
                        left: 1440,
                    }
                }
            },
            children: children
        }]
    });

    const blob = await Packer.toBlob(doc);
    console.log('[exportWorksheetToDocx] Blob created successfully, size:', blob.size, 'bytes');
    
    const fileName = `${(title.split('\n')[0] || 'Phieu_hoc_tap').replace(/[^a-z0-9\-_ ]/gi, '_')}.docx`;
    console.log('[exportWorksheetToDocx] Downloading file as:', fileName);
    
    saveAs(blob, fileName);
    console.log('[exportWorksheetToDocx] File download initiated');
    } catch (error: any) {
        console.error('[exportWorksheetToDocx] Error:', error);
        throw new Error(`Không thể xuất file Word: ${error?.message || error}`);
    }
}

/**
 * Helper để fetch ảnh và chuyển thành ArrayBuffer
 * Timeout: 3 giây (giảm từ 5s)
 */
async function fetchImageAsArrayBuffer(url: string): Promise<ArrayBuffer | null> {
    try {
        if (!url || typeof url !== 'string') {
            console.warn('Invalid image URL:', url);
            return null;
        }

        // Data URI (base64)
        if (url.startsWith('data:')) {
            try {
                const base64Content = url.split(',')[1];
                if (!base64Content) return null;
                const binaryString = window.atob(base64Content);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                return bytes.buffer;
            } catch (e) {
                console.warn('Lỗi convert base64:', e);
                return null;
            }
        }

        // Remote URL - 3 giây timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.warn('Image fetch timeout:', url);
            controller.abort();
        }, 3000);

        try {
            const response = await fetch(url, { 
                signal: controller.signal,
                mode: 'cors',
                cache: 'no-cache'
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.warn(`Không thể fetch ảnh từ ${url}: ${response.status} ${response.statusText}`);
                return null;
            }

            const buffer = await response.arrayBuffer();
            if (buffer && buffer.byteLength > 0) {
                return buffer;
            }
            return null;
        } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                console.warn('Image fetch timeout (3s):', url);
            } else {
                console.warn('Fetch error:', url, fetchError?.message);
            }
            return null;
        }
    } catch (e) {
        console.warn("Lỗi fetch ảnh:", e);
        return null;
    }
}

/**
 * Chuyển đổi file PDF sang Word Document
 * @param base64Pdf - Base64 string của file PDF
 * @param fileName - Tên file Word cần tạo
 * @param title - Tiêu đề tài liệu (tùy chọn)
 * @param selectedFont - Font được chọn (mặc định: Calibri)
 */
export async function convertPdfToWordDocx(base64Pdf: string, fileName: string = "Tai_lieu_tu_PDF.docx", title?: string, selectedFont: string = 'Calibri') {
    try {
        // Chuyển PDF sang mảng hình ảnh
        console.log('[convertPdfToWordDocx] Đang chuyển PDF sang hình ảnh...');
        const pdfImages = await convertPdfToImages(base64Pdf, 50); // Giới hạn 50 trang
        
        if (!pdfImages || pdfImages.length === 0) {
            throw new Error('Không thể chuyển đổi PDF. File có thể bị lỗi hoặc định dạng không hợp lệ.');
        }

        console.log(`[convertPdfToWordDocx] Chuyển đổi thành công ${pdfImages.length} trang`);

        // Tạo Document Word
        const children: any[] = [];
        const font = selectedFont;
        const fontSize = 13;

        // Thêm tiêu đề nếu có
        if (title && title.trim()) {
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    createTextRun({
                        text: title.toUpperCase(),
                        bold: true,
                        size: (fontSize + 4) * 2,
                        font
                    })
                ],
                spacing: { after: 240 }
            }));

            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    createTextRun({
                        text: `(Chuyển đổi từ PDF)`,
                        italics: true,
                        size: fontSize * 2,
                        font,
                        color: '999999'
                    })
                ],
                spacing: { after: 400 }
            }));
        }

        // Thêm từng trang PDF dưới dạng hình ảnh
        for (let i = 0; i < pdfImages.length; i++) {
            const pdfImage = pdfImages[i];
            
            try {
                // Chuyển base64 của hình ảnh thành ArrayBuffer
                const base64Data = pdfImage.inlineData.data;
                const binaryString = atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let j = 0; j < binaryString.length; j++) {
                    bytes[j] = binaryString.charCodeAt(j);
                }
                const imageBuffer = bytes.buffer;

                // Thêm số trang
                if (pdfImages.length > 1) {
                    children.push(new Paragraph({
                        children: [
                            createTextRun({
                                text: `Trang ${i + 1}`,
                                italics: true,
                                size: (fontSize - 2) * 2,
                                font,
                                color: 'CCCCCC'
                            })
                        ],
                        spacing: { before: 240, after: 120 },
                        alignment: AlignmentType.CENTER
                    }));
                }

                // Thêm hình ảnh trang
                children.push(new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                        new ImageRun({
                            data: imageBuffer,
                            transformation: {
                                width: 550,  // Rộng phù hợp trang A4
                                height: 700  // Tỷ lệ hình ảnh
                            },
                            type: "jpg"
                        })
                    ],
                    spacing: { before: 120, after: 240 }
                }));

                // Thêm page break sau mỗi trang (ngoại trừ trang cuối)
                if (i < pdfImages.length - 1) {
                    children.push(new Paragraph({
                        pageBreakBefore: true,
                        children: [createTextRun({ text: " " })]
                    }));
                }
            } catch (imgError) {
                console.warn(`[convertPdfToWordDocx] Lỗi xử lý trang ${i + 1}:`, imgError);
                // Tiếp tục với trang tiếp theo
            }
        }

        // Tạo Document
        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: { font, size: fontSize * 2 },
                    },
                },
            },
            sections: [{ properties: {}, children: children }],
        });

        // Chuyển đổi thành Blob
        console.log('[convertPdfToWordDocx] Đang tạo file Word...');
        const blob = await Packer.toBlob(doc);
        
        // Tải xuống
        console.log('[convertPdfToWordDocx] Đang tải xuống file...');
        saveAs(blob, fileName);
        
        return { success: true, pageCount: pdfImages.length };
    } catch (error: any) {
        console.error('[convertPdfToWordDocx] Lỗi:', error);
        throw new Error(`Lỗi chuyển đổi PDF sang Word: ${error.message}`);
    }
}

/**
 * Chuyển đổi file PDF sang Word Document với OCR (trích xuất văn bản)
 * @param base64Pdf - Base64 string của file PDF
 * @param fileName - Tên file Word cần tạo
 * @param title - Tiêu đề tài liệu (tùy chọn)
 * @param includeImages - Có thêm ảnh gốc không (mặc định true)
 * @param selectedFont - Font được chọn (mặc định: Calibri)
 */
export async function convertPdfToWordWithOCR(base64Pdf: string, fileName: string = "Tai_lieu_tu_PDF.docx", title?: string, includeImages: boolean = true, selectedFont: string = 'Calibri') {
    try {
        console.log('[convertPdfToWordWithOCR] Bắt đầu chuyển đổi PDF sang Word với OCR...');
        
        // Chuyển PDF sang mảng hình ảnh
        const pdfImages = await convertPdfToImages(base64Pdf, 50);
        
        if (!pdfImages || pdfImages.length === 0) {
            throw new Error('Không thể chuyển đổi PDF. File có thể bị lỗi hoặc định dạng không hợp lệ.');
        }

        console.log(`[convertPdfToWordWithOCR] Chuyển đổi thành công ${pdfImages.length} trang`);

        // Trích xuất dataUrl từ pdfImages
        const dataUrls = pdfImages.map(img => img.dataUrl || `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`);
        
        // Sử dụng OCR để trích xuất văn bản
        console.log('[convertPdfToWordWithOCR] Đang nhận diện văn bản bằng OCR...');
        const extractedTexts = await ocrImages(dataUrls, 'vie+eng');
        
        // Tạo Document Word
        const children: any[] = [];
        const font = selectedFont;
        const fontSize = 13;

        // Thêm tiêu đề nếu có
        if (title && title.trim()) {
            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    createTextRun({
                        text: title.toUpperCase(),
                        bold: true,
                        size: (fontSize + 4) * 2,
                        font
                    })
                ],
                spacing: { after: 240 }
            }));

            children.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                    createTextRun({
                        text: `(Trích xuất từ PDF bằng OCR)`,
                        italics: true,
                        size: fontSize * 2,
                        font,
                        color: '999999'
                    })
                ],
                spacing: { after: 400 }
            }));
        }

        // Thêm văn bản và ảnh từ mỗi trang
        for (let i = 0; i < extractedTexts.length; i++) {
            const pageText = extractedTexts[i];
            const pdfImage = pdfImages[i];

            // Thêm số trang
            if (extractedTexts.length > 1) {
                children.push(new Paragraph({
                    children: [
                        createTextRun({
                            text: `─ TRANG ${i + 1} ─`,
                            bold: true,
                            size: (fontSize - 1) * 2,
                            font,
                            color: '0066CC'
                        })
                    ],
                    spacing: { before: 400, after: 200 },
                    alignment: AlignmentType.CENTER
                }));
            }

            // Thêm văn bản trích xuất
            if (pageText && pageText.trim()) {
                const paragraphs = pageText.split('\n')
                    .map((line: string) => cleanOCRText(line))
                    .filter((line: string) => line.trim());
                    
                paragraphs.forEach((para: string, idx: number) => {
                    children.push(new Paragraph({
                        children: [
                            createTextRun({
                                text: para.trim(),
                                size: fontSize * 2,
                                font
                            })
                        ],
                        spacing: { after: 120, line: 360, lineRule: LineRuleType.AUTO },
                        alignment: AlignmentType.JUSTIFIED
                    }));
                });
            } else {
                // Nếu OCR không nhận diện được, thêm ghi chú
                children.push(new Paragraph({
                    children: [
                        createTextRun({
                            text: `[Không thể nhận diện văn bản trên trang này]`,
                            italics: true,
                            size: (fontSize - 2) * 2,
                            font,
                            color: 'CC6666'
                        })
                    ],
                    spacing: { after: 200 },
                    alignment: AlignmentType.CENTER
                }));
            }

            // Thêm ảnh gốc nếu tùy chọn
            if (includeImages && pdfImage) {
                try {
                    const base64Data = pdfImage.inlineData.data;
                    const binaryString = atob(base64Data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let j = 0; j < binaryString.length; j++) {
                        bytes[j] = binaryString.charCodeAt(j);
                    }
                    const imageBuffer = bytes.buffer;

                    children.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [
                            new ImageRun({
                                data: imageBuffer,
                                transformation: {
                                    width: 500,
                                    height: 650
                                },
                                type: "jpg"
                            })
                        ],
                        spacing: { before: 240, after: 240 }
                    }));
                } catch (imgError) {
                    console.warn(`[convertPdfToWordWithOCR] Lỗi xử lý ảnh trang ${i + 1}:`, imgError);
                }
            }

            // Thêm page break (ngoại trừ trang cuối)
            if (i < extractedTexts.length - 1) {
                children.push(new Paragraph({
                    pageBreakBefore: true,
                    children: [createTextRun({ text: " " })]
                }));
            }
        }

        // Tạo Document
        const doc = new Document({
            styles: {
                default: {
                    document: {
                        run: { font, size: fontSize * 2 },
                    }
                },
            },
            sections: [{ properties: {}, children: children }],
        });

        // Chuyển đổi thành Blob
        console.log('[convertPdfToWordWithOCR] Đang tạo file Word...');
        const blob = await Packer.toBlob(doc);
        
        // Tải xuống
        console.log('[convertPdfToWordWithOCR] Đang tải xuống file...');
        saveAs(blob, fileName);
        
        return { success: true, pageCount: extractedTexts.length, extractedCharCount: extractedTexts.join('').length };
    } catch (error: any) {
        console.error('[convertPdfToWordWithOCR] Lỗi:', error);
        throw new Error(`Lỗi chuyển đổi PDF sang Word với OCR: ${error.message}`);
    }
}

/**
 * Helper download file
 */
function saveAs(blob: Blob, fileName: string) {
    try {
        const url = window.URL.createObjectURL(blob);
        if (!url) {
            throw new Error('Không thể tạo object URL từ blob');
        }

        const link = document.createElement('a');
        if (!link) {
            throw new Error('Không thể tạo element <a>');
        }

        link.style.display = 'none';
        link.href = url;
        link.download = fileName;
        
        document.body.appendChild(link);
        
        // Trigger click
        link.click();
        
        // Cleanup sau một chút time
        setTimeout(() => {
            try {
                if (document.body.contains(link)) {
                    document.body.removeChild(link);
                }
                window.URL.revokeObjectURL(url);
            } catch (cleanupError) {
                console.warn('Lỗi cleanup download:', cleanupError);
            }
        }, 200);
    } catch (e) {
        console.error('Lỗi khi download file:', e);
        throw e;
    }
}
