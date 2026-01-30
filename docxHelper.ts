import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

/**
 * Chuyển đổi nội dung text/markdown thành file Word và tải xuống
 */
export async function downloadLessonPlanAsDocx(content: string, fileName: string = "Giao_an_AI.docx") {
    // Tách nội dung thành các dòng để xử lý
    const lines = content.split('\n');

    const children = lines.map(line => {
        const trimmedLine = line.trim();

        // Xử lý tiêu đề Markdown đơn giản (#, ##, ###)
        if (trimmedLine.startsWith('# ')) {
            return new Paragraph({
                text: trimmedLine.replace('# ', ''),
                heading: HeadingLevel.HEADING_1,
            });
        }
        if (trimmedLine.startsWith('## ')) {
            return new Paragraph({
                text: trimmedLine.replace('## ', ''),
                heading: HeadingLevel.HEADING_2,
            });
        }
        if (trimmedLine.startsWith('### ')) {
            return new Paragraph({
                text: trimmedLine.replace('### ', ''),
                heading: HeadingLevel.HEADING_3,
            });
        }

        // Văn bản thường
        return new Paragraph({
            children: [new TextRun(trimmedLine)],
            spacing: { after: 120 } // Khoảng cách dòng nhẹ
        });
    });

    const doc = new Document({
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