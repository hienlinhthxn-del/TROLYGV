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
/**
 * Xuất Phiếu học tập hoặc Đề thi thành file Word chuyên nghiệp
 */
export async function exportWorksheetToDocx(worksheet: any) {
    try {
    const font = 'Times New Roman';
    const fontSize = 13;

    const children: any[] = [];
    const questions = worksheet.questions || [];
    const title = worksheet.title || worksheet.header || "ĐỀ THI / PHIẾU HỌC TẬP";

    // Tiêu đề
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
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
                new TextRun({
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

    // Ma trận đặc tả (nếu có)
    if (worksheet.matrix) {
        children.push(new Paragraph({
            children: [
                new TextRun({
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
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Nội dung", bold: true, size: fontSize * 2 })] })], width: { size: 30, type: WidthType.PERCENTAGE } }),
                    ...COGNITIVE_LEVELS.map(l => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: l, bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })], width: { size: 15, type: WidthType.PERCENTAGE } })),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Tổng cộng", bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })], width: { size: 10, type: WidthType.PERCENTAGE } }),
                ]
            })
        ];

        Object.entries(worksheet.matrix).forEach(([strand, levels]: [any, any]) => {
            let strandTotal = 0;
            const cells = [new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strand, size: fontSize * 2 })] })] })];

            COGNITIVE_LEVELS.forEach(l => {
                const count = (levels[l]?.mcq || 0) + (levels[l]?.essay || 0);
                strandTotal += count;
                cells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: count > 0 ? count.toString() : "-", size: fontSize * 2 })], alignment: AlignmentType.CENTER })] }));
            });

            cells.push(new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: strandTotal.toString(), bold: true, size: fontSize * 2 })], alignment: AlignmentType.CENTER })] }));
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
            children: [new TextRun({ text: " " })]
        }));
    }

    // Bài đọc hiểu (nếu có)
    if (worksheet.readingPassage && worksheet.readingPassage.trim()) {
        children.push(new Paragraph({
            children: [
                new TextRun({
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
        readingLines.forEach(line => {
            children.push(new Paragraph({
                children: [
                    new TextRun({
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
            children: [new TextRun({ text: " " })],
            spacing: { after: 240 }
        }));
    }

    // Câu hỏi
    children.push(new Paragraph({
        children: [
            new TextRun({
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
                new TextRun({
                    text: `Câu ${i + 1}: ${qContent}`,
                    bold: true,
                    size: fontSize * 2,
                    font
                })
            ],
            spacing: { before: 240, after: 120 }
        }));

        // Hình ảnh minh họa (nếu có)
        if (qImage && qImage !== 'error') {
            try {
                if (typeof qImage === 'string' && qImage.trim().startsWith('<svg')) {
                    // Skip SVG for now as docx doesn't support it directly
                } else if (typeof qImage === 'string') {
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
                console.error("Lỗi khi chèn ảnh vào Word:", e);
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
                        new TextRun({
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
                        new TextRun({
                            text: `${String.fromCharCode(65 + j)}. ${opt1Text}`,
                            size: fontSize * 2,
                            font
                        })
                    ];

                    if (j + 1 < q.options.length) {
                        const opt2 = q.options[j + 1];
                        const opt2Text = typeof opt2 === 'string' ? opt2 : opt2.text;
                        rowChildren.push(new TextRun({
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
                        new TextRun({
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
            new TextRun({
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
        children: [new TextRun({ text: " " })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            new TextRun({
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
                new TextRun({
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
                    new TextRun({
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
    saveAs(blob, `${(title.split('\n')[0] || 'Phieu_hoc_tap').replace(/[^a-z0-9\-_ ]/gi, '_')}.docx`);
    } catch (error: any) {
        console.error('Lỗi khi xuất DOCX:', error);
        throw new Error(`Không thể xuất file Word: ${error?.message || error}`);
    }
}

/**
 * Helper để fetch ảnh và chuyển thành ArrayBuffer
 */
async function fetchImageAsArrayBuffer(url: string): Promise<ArrayBuffer | null> {
    try {
        if (url.startsWith('data:')) {
            const base64Content = url.split(',')[1];
            if (!base64Content) return null;
            const binaryString = window.atob(base64Content);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes.buffer;
        } else {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 giây timeout
            
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.warn(`Không thể fetch ảnh từ ${url}: ${response.status}`);
                return null;
            }
            return await response.arrayBuffer();
        }
    } catch (e) {
        console.warn("Lỗi fetch ảnh:", e);
        return null;
    }
}

/**
 * Helper download file
 */
function saveAs(blob: Blob, fileName: string) {
    try {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        
        // Đúng URL object sẽ được kiểm tra trước
        if (!url || !link) {
            throw new Error('Không thể tạo link download');
        }
        
        document.body.appendChild(link);
        link.click();
        
        // Đợi một chút trước khi xóa
        setTimeout(() => {
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        }, 100);
    } catch (e) {
        console.error('Lỗi khi download file:', e);
        throw e;
    }
}
