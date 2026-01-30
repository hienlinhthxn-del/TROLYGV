import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LineRuleType } from "docx";

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

    // Map alignment string to docx AlignmentType
    let docxAlignment = AlignmentType.JUSTIFIED;
    if (alignment === 'left') docxAlignment = AlignmentType.LEFT;
    if (alignment === 'center') docxAlignment = AlignmentType.CENTER;
    if (alignment === 'right') docxAlignment = AlignmentType.RIGHT;

    // Calculate line spacing (240 = 1 line in docx LineRuleType.AUTO)
    const spacingValue = Math.round(lineSpacing * 240);

    // Tách nội dung thành các dòng để xử lý
    const lines = content.split('\n');

    const children = lines.map(line => {
        const trimmedLine = line.trim();

        // Xử lý tiêu đề Markdown (ưu tiên heading nhỏ trước)
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

        // Văn bản thường
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
                    run: { font, size: fontSize * 2 }, // size tính bằng half-points
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
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}