import React, { useState } from 'react';
import { geminiService } from '../services/geminiService';
import { generate_image } from '../services/imageService';

interface WorksheetQuestion {
    id: string;
    type: 'coloring' | 'matching' | 'circle' | 'fill-blank' | 'counting' | 'multiple-choice' | 'essay';
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
            // Gọi AI để tạo nội dung phiếu học tập 
            const content = await (geminiService as any).generateWorksheetContent(topic, subject, questionCount, questionFormat);
            setWorksheet(content);
            setProgress('Nội dung đã sẵn sàng! Đang chuẩn bị tạo hình ảnh...');

            // Tạo hình ảnh cho các câu hỏi với cơ chế chống Rate Limit
            await generateImages(content);
        } catch (error) {
            console.error('Lỗi khi tạo phiếu học tập:', error);
            alert('Có lỗi xảy ra khi tạo phiếu học tập. Vui lòng thử lại!');
            setIsGenerating(false);
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
                    setProgress(`Đang vẽ hình minh họa ${i + 1}/${updatedQuestions.length}...`);

                    // Thêm độ trễ 2 giây để tránh lỗi Rate Limit "anonymous tier limit"
                    if (i > 0) await new Promise(resolve => setTimeout(resolve, 2500));

                    try {
                        // Thêm từ khóa ngẫu nhiên vào prompt để tạo sự khác biệt
                        const enhancedPrompt = `${q.imagePrompt}, cartoon style, high quality, white background, for kids`;
                        const imageUrl = await generate_image(enhancedPrompt);
                        updatedQuestions[i].imageUrl = imageUrl;

                        // Cập nhật giao diện ngay lập tức khi có ảnh mới
                        setWorksheet({ ...ws, questions: [...updatedQuestions] });
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành toàn bộ phiếu học tập!');
        } finally {
            setIsGeneratingImages(false);
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
          .header h1 { color: #FF6B9D; margin: 10px 0; }
          .student-info { margin: 20px 0; padding: 15px; border: 2px dashed #FFA726; border-radius: 10px; }
          .question { margin: 25px 0; padding: 15px; border: 1px solid #ddd; border-radius: 10px; page-break-inside: avoid; }
          .question-header { font-weight: bold; color: #1976D2; font-size: 18px; margin-bottom: 10px; }
          .question-image { text-align: center; margin: 15px 0; }
          .question-image img { max-width: 80%; max-height: 250px; border-radius: 10px; }
          .options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
          .option { padding: 10px; border: 1px solid #4ECDC4; border-radius: 5px; }
          .answer-space { margin-top: 15px; border-bottom: 1px dotted #ccc; height: 40px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>🌟 ${worksheet.title} 🌟</h1>
          <p>Môn: ${worksheet.subject} - Lớp 1</p>
        </div>
        <div class="student-info">
          <p>Họ tên: ........................................................... Lớp: ................. Ngày: ..../..../20....</p>
        </div>
        ${worksheet.questions.map((q, index) => `
          <div class="question">
            <div class="question-header">Câu ${index + 1}: ${q.question}</div>
            ${q.imageUrl ? `<div class="question-image"><img src="${q.imageUrl}" /></div>` : ''}
            ${q.options ? `
              <div class="options">
                ${q.options.map(opt => `<div class="option">${opt}</div>`).join('')}
              </div>
            ` : `<div class="answer-space">Trả lời: ............................................................................................</div>`}
          </div>
        `).join('')}
      </body>
      </html>
    `;

        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 800);
    };

    return (
        <div style={{
            height: 'calc(100vh - 100px)', // Cố định chiều cao để thanh cuộn xuất hiện
            width: '100%',
            maxWidth: '1200px',
            margin: '0 auto',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '25px',
            overflowY: 'auto', // Bật thanh cuộn
            padding: '20px',
            boxSizing: 'border-box'
        }} className="custom-scrollbar">

            <div style={{
                background: 'white',
                borderRadius: '25px',
                padding: '40px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '30px', borderBottom: '4px solid #FF6B9D', paddingBottom: '20px' }}>
                    <h1 style={{ fontSize: '36px', color: '#FF6B9D', margin: 0 }}>📚 Tạo Phiếu Học Tập Lớp 1</h1>
                    <p style={{ color: '#666' }}>Tự động tạo câu hỏi và hình ảnh minh họa bằng AI</p>
                </div>

                {!worksheet && (
                    <div style={{ background: '#FFF9C4', padding: '30px', borderRadius: '20px', border: '2px solid #FFA726' }}>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>📖 Môn học:</label>
                            <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FF9800' }}>
                                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>📝 Dạng bài tập:</label>
                            <select value={questionFormat} onChange={(e) => setQuestionFormat(e.target.value as any)} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FF9800' }}>
                                <option value="hon-hop">Hỗn hợp (Khuyên dùng cho Lớp 1)</option>
                                <option value="trac-nghiem">Toàn bộ Trắc nghiệm</option>
                                <option value="tu-luan">Toàn bộ Tự luận</option>
                            </select>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>💡 Chủ đề bài học:</label>
                            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Bé học đếm, Tìm chữ cái, Con vật quanh em..." style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '2px solid #FF9800', boxSizing: 'border-box' }} />
                        </div>

                        <div style={{ marginBottom: '25px' }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>🔢 Số lượng câu hỏi ({questionCount}):</label>
                            <input type="range" min="1" max="10" value={questionCount} onChange={(e) => setQuestionCount(parseInt(e.target.value))} style={{ width: '100%' }} />
                        </div>

                        <button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} style={{ width: '100%', padding: '18px', fontSize: '20px', fontWeight: 'bold', background: 'linear-gradient(135deg, #FF6B9D 0%, #4ECDC4 100%)', color: 'white', border: 'none', borderRadius: '15px', cursor: 'pointer' }}>
                            {isGenerating ? '⏳ ĐANG TẠO PHIẾU...' : '✨ BẮT ĐẦU TẠO PHIẾU'}
                        </button>
                    </div>
                )}

                {progress && (
                    <div style={{ marginTop: '20px', padding: '15px', background: '#E3F2FD', borderRadius: '10px', textAlign: 'center', fontWeight: 'bold', color: '#1976D2' }}>
                        {progress}
                    </div>
                )}

                {worksheet && (
                    <div style={{ marginTop: '30px' }}>
                        <h2 style={{ textAlign: 'center', color: '#1976D2' }}>{worksheet.title}</h2>
                        {worksheet.questions.map((q, index) => (
                            <div key={index} style={{ background: '#f9f9f9', padding: '20px', borderRadius: '15px', marginBottom: '20px', border: '1px solid #eee' }}>
                                <p style={{ fontWeight: 'bold', fontSize: '18px' }}>Câu {index + 1}: {q.question}</p>
                                {q.imageUrl && <div style={{ textAlign: 'center', margin: '15px 0' }}><img src={q.imageUrl} style={{ maxWidth: '100%', borderRadius: '10px' }} alt="minh họa" /></div>}
                                {q.options && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        {q.options.map((opt, i) => <div key={i} style={{ padding: '10px', background: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>{opt}</div>)}
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={{ display: 'flex', gap: '20px', marginTop: '30px', position: 'sticky', bottom: '0', background: 'white', padding: '20px', borderTop: '2px solid #eee' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, padding: '20px', fontSize: '20px', fontWeight: 'bold', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '15px', cursor: 'pointer' }}>
                                {isGeneratingImages ? '⏳ ĐANG TẠO ẢNH...' : '🖨️ XUẤT PDF & IN PHIẾU'}
                            </button>
                            <button onClick={() => setWorksheet(null)} style={{ flex: 1, padding: '20px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '15px', cursor: 'pointer' }}>🔄 TẠO LẠI</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
