import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LineRuleType, ImageRun, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";

export interface DocxOptions {
    font?: string;
    fontSize?: number;
    alignment?: "left" | "center" | "right" | "justify";
    lineSpacing?: number;
}

/**
 * Chuyển đổi nội dung text/markdown thành file Word và tải xuống
 */
export async function downloadLessonPlanAsDocx(content: string, fileName: string = "Giao_an_AI.docx", options: DocxOptions = {}) {
    const { font = 'Times New Roman', fontSize = 13, alignment = 'justify', lineSpacing = 1.5 } = options;

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
            children: [new TextRun(trimmedLine)],
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
export async function exportWorksheetToDocx(worksheet: any) {
    const font = 'Times New Roman';
    const fontSize = 13;

    const children: any[] = [];

    // Tiêu đề
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: worksheet.title.toUpperCase(),
                bold: true,
                size: (fontSize + 5) * 2,
                font
            })
        ],
        spacing: { after: 120 }
    }));

    // Môn học
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: `Môn: ${worksheet.subject}`,
                italics: true,
                size: fontSize * 2,
                font
            })
        ],
        spacing: { after: 240 }
    }));

    // Thông tin học sinh
    children.push(new Paragraph({
        children: [
            new TextRun({
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

    // Bài đọc hiểu (nếu có)
    if (worksheet.readingPassage) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: "PHẦN ĐỌC HIỂU",
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 240, after: 120 }
        }));

        children.push(new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            children: [
                new TextRun({
                    text: worksheet.readingPassage,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { after: 240, line: 360, lineRule: LineRuleType.AUTO },
            indent: { firstLine: 480 }
        }));
    }

    // Câu hỏi
    for (let i = 0; i < worksheet.questions.length; i++) {
        const q = worksheet.questions[i];

        // Tiêu đề câu hỏi
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: `Câu ${i + 1}: ${q.question}`,
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 240, after: 120 }
        }));

        // Hình ảnh minh họa (nếu có)
        if (q.imageUrl && q.imageUrl !== 'error') {
            try {
                const imageBuffer = await fetchImageAsArrayBuffer(q.imageUrl);
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
            } catch (e) {
                console.error("Lỗi khi chèn ảnh vào Word:", e);
            }
        }

        // Tùy chọn (cho MCQ, TF, Reading)
        if (q.options && q.options.length > 0) {
            // Nếu là so sánh hoặc sắp xếp, hiển thị kiểu khác
            if (q.type === 'compare') {
                // Không làm gì thêm, đã có trong text câu hỏi hoặc tự xử lý sau
            } else if (q.type === 'arrange' || q.type === 'circle') {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: `Các gợi ý: ${q.options.join(", ")}`,
                            italics: true,
                            size: (fontSize - 1) * 2,
                            font
                        })
                    ],
                    spacing: { after: 120 }
                }));
            } else {
                // Hiển thị dạng A, B, C, D
                const optionRows: any[] = [];
                // Chia thành các hàng, mỗi hàng tối đa 2 option để tiết kiệm diện tích
                for (let j = 0; j < q.options.length; j += 2) {
                    const rowChildren = [
                        new TextRun({
                            text: `${String.fromCharCode(65 + j)}. ${q.options[j]}`,
                            size: fontSize * 2,
                            font
                        })
                    ];
                    if (j + 1 < q.options.length) {
                        rowChildren.push(new TextRun({
                            text: `\t${String.fromCharCode(65 + j + 1)}. ${q.options[j + 1]}`,
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

        // Dòng kẻ trả lời (nếu không có option hoặc là Tự luận/Điền khuyết)
        if (!q.options || q.options.length === 0 || q.type === 'essay' || q.type === 'fill') {
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: "Trả lời: ........................................................................................................................................................",
                        size: fontSize * 2,
                        font
                    })
                ],
                spacing: { after: 120 }
            }));
        }
    }

    // Lời chúc cuối trang
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
                text: "--- Chúc các em làm bài tốt! ---",
                italics: true,
                size: (fontSize - 1) * 2,
                font
            })
        ],
        spacing: { before: 400 }
    }));

    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440, // 1 inch = 1440 twips
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
    saveAs(blob, `${worksheet.title || 'Phieu_hoc_tap'}.docx`);
}

/**
 * Helper để fetch ảnh và chuyển thành ArrayBuffer
 */
async function fetchImageAsArrayBuffer(url: string): Promise<ArrayBuffer | null> {
    try {
        if (url.startsWith('data:')) {
            const base64Content = url.split(',')[1];
            const binaryString = window.atob(base64Content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        } else {
            const response = await fetch(url);
            return await response.arrayBuffer();
        }
    } catch (e) {
        console.error("Lỗi fetch ảnh:", e);
        return null;
    }
}

/**
 * Helper download file
 */
function saveAs(blob: Blob, fileName: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}
