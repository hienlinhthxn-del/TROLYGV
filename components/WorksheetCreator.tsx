import React, { useState } from 'react';
import { geminiService } from '../services/geminiService';
import { generate_image } from '../services/imageService';

interface WorksheetQuestion {
    id: string;
    type: 'multiple-choice' | 'essay';
    question: string;
    imagePrompt?: string;
    imageUrl?: string;
    options?: string[];
    answer?: string;
}

interface Worksheet {
    title: string;
    subject: string;
    questions: WorksheetQuestion[];
}

const WorksheetCreator: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [subject, setSubject] = useState('Toán');
    const [questionCount, setQuestionCount] = useState(5);
    const [questionFormat, setQuestionFormat] = useState<'trac-nghiem' | 'tu-luan' | 'hon-hop'>('hon-hop');
    const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [progress, setProgress] = useState('');

    const subjects = ['Toán', 'Tiếng Việt', 'Tự nhiên & Xã hội', 'Đạo đức', 'Âm nhạc', 'Mỹ thuật'];

    const handleGenerate = async () => {
        if (!topic.trim()) {
            alert('Vui lòng nhập chủ đề!');
            return;
        }

        setIsGenerating(true);
        setProgress('Đang tạo nội dung câu hỏi...');
        setWorksheet(null);

        try {
            const content = await (geminiService as any).generateWorksheetContent(topic, subject, questionCount, questionFormat);
            setWorksheet(content);
            setProgress('Câu hỏi đã xong! Đang bắt đầu vẽ hình minh họa (Xin hãy kiên nhẫn)...');
            await generateImages(content);
        } catch (error) {
            console.error('Lỗi khi tạo phiếu học tập:', error);
            alert('Có lỗi xảy ra. Thầy Cô vui lòng thử lại nhé!');
        } finally {
            setIsGenerating(false);
        }
    };

    const generateImages = async (ws: Worksheet) => {
        setIsGeneratingImages(true);
        const updatedQuestions = [...ws.questions];

        try {
            for (let i = 0; i < updatedQuestions.length; i++) {
                const q = updatedQuestions[i];
                if (q.imagePrompt) {
                    setProgress(`Đang vẽ hình minh họa ${i + 1}/${updatedQuestions.length} (Độ trễ an toàn 5s)...`);

                    // ĐỘ TRỄ 5 GIÂY ĐỂ TRÁNH LỖI RATE LIMIT
                    if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));

                    try {
                        const randomId = Math.floor(Math.random() * 999999);
                        const enhancedPrompt = `${q.imagePrompt}, educational cartoon style, white background --seed ${randomId}`;
                        const imageUrl = await generate_image(enhancedPrompt);
                        updatedQuestions[i].imageUrl = imageUrl;
                        setWorksheet({ ...ws, questions: [...updatedQuestions] });
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành! Nếu ảnh bị lỗi Rate Limit, hãy nhấn vào ảnh đó để tải lại.');
        } finally {
            setIsGeneratingImages(false);
        }
    };

    const handleRetryImage = async (index: number) => {
        if (!worksheet || isGeneratingImages) return;

        const updatedQuestions = [...worksheet.questions];
        const q = updatedQuestions[index];

        setProgress(`Đang thử vẽ lại hình minh họa câu ${index + 1}...`);
        try {
            const randomSeed = Math.floor(Math.random() * 999999);
            const enhancedPrompt = `${q.imagePrompt}, cute educational style --seed ${randomSeed}`;
            const imageUrl = await generate_image(enhancedPrompt);
            updatedQuestions[index].imageUrl = imageUrl;
            setWorksheet({ ...worksheet, questions: updatedQuestions });
            setProgress('Đã tải lại ảnh thành công!');
        } catch (error) {
            alert('Vẫn bị giới hạn lượt tạo. Thầy Cô vui lòng đợi 1 phút rồi nhấn thử lại nhé!');
        }
    };

    const handleExportPDF = () => {
        if (!worksheet) return;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${worksheet.title}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'Arial', sans-serif; max-width: 210mm; margin: 0 auto; padding: 20px; }
          .header { text-align: center; border-bottom: 3px solid #FF6B9D; padding-bottom: 15px; }
          .header h1 { color: #FF6B9D; }
          .question { margin: 25px 0; padding: 15px; border: 1px solid #eee; border-radius: 10px; page-break-inside: avoid; }
          .question-header { font-weight: bold; color: #1976D2; margin-bottom: 10px; }
          .question-image { text-align: center; margin: 15px 0; }
          .question-image img { max-width: 80%; border-radius: 10px; }
          .options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          .option { padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="header"><h1>🌟 ${worksheet.title} 🌟</h1><p>Môn: ${worksheet.subject} - Lớp 1</p></div>
        ${worksheet.questions.map((q, index) => `
          <div class="question">
            <div class="question-header">Câu ${index + 1}: ${q.question}</div>
            ${q.imageUrl ? `<div class="question-image"><img src="${q.imageUrl}" /></div>` : ''}
            ${q.options ? `<div class="options">${q.options.map(opt => `<div class="option">${opt}</div>`).join('')}</div>` : '............................................................................................'}
          </div>
        `).join('')}
      </body>
      </html>
    `;
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 1000);
    };

    return (
        <div style={{ padding: '30px', maxWidth: '1200px', margin: '0 auto', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', height: 'calc(100vh - 40px)', overflowY: 'auto' }} className="custom-scrollbar">
            <div style={{ background: 'white', borderRadius: '25px', padding: '40px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ color: '#FF6B9D' }}>📚 Tạo Phiếu Học Tập Lớp 1</h1>
                    <p>Soạn bài nhanh chóng với hình ảnh minh họa thông minh</p>
                </div>

                {!worksheet && (
                    <div style={{ background: '#FFF9C4', padding: '30px', borderRadius: '20px', border: '1px solid #FFA726' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ fontWeight: 'bold' }}>📖 Môn học:</label>
                                <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px' }}>
                                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold' }}>📝 Dạng bài:</label>
                                <select value={questionFormat} onChange={(e) => setQuestionFormat(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '8px' }}>
                                    <option value="hon-hop">Hỗn hợp</option>
                                    <option value="trac-nghiem">Trắc nghiệm</option>
                                    <option value="tu-luan">Tự luận</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ fontWeight: 'bold' }}>💡 Chủ đề:</label>
                            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Bé bảo vệ môi trường, Nhận biết con vật..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} style={{ width: '100%', padding: '15px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                            {isGenerating ? '⏳ ĐANG XỬ LÝ...' : '✨ TẠO PHIẾU NGAY'}
                        </button>
                    </div>
                )}

                {progress && (
                    <div style={{ margin: '20px 0', padding: '10px', background: '#E3F2FD', borderRadius: '8px', textAlign: 'center', color: '#1976D2', fontSize: '14px' }}>
                        {progress}
                    </div>
                )}

                {worksheet && (
                    <div>
                        {worksheet.questions.map((q, index) => (
                            <div key={index} style={{ padding: '15px', borderBottom: '1px solid #eee' }}>
                                <p><strong>Câu {index + 1}:</strong> {q.question}</p>
                                <div style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => handleRetryImage(index)} title="Nhấn để vẽ lại ảnh này">
                                    {q.imageUrl ? (
                                        <img src={q.imageUrl} style={{ maxWidth: '300px', borderRadius: '10px', border: '2px solid #eee' }} alt="Click to retry" />
                                    ) : (
                                        <div style={{ padding: '20px', background: '#f0f0f0', borderRadius: '10px' }}>⏳ Đang đợi vẽ ảnh...</div>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', position: 'sticky', bottom: '0', background: 'white', padding: '20px' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, padding: '15px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold' }}>
                                {isGeneratingImages ? '⏳ ĐANG VẼ...' : '🖨️ XUẤT PDF'}
                            </button>
                            <button onClick={() => setWorksheet(null)} style={{ flex: 1, padding: '15px', background: '#666', color: 'white', border: 'none', borderRadius: '10px' }}>🔄 LÀM MỚI</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
