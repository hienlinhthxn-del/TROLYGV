import React, { useState } from 'react';
import { generateWorksheetContent } from '../services/geminiService';
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
            // Sử dụng hàm đã import
            const content = await generateWorksheetContent(topic, subject, questionCount, questionFormat);
            setWorksheet(content);
            setProgress('Câu hỏi đã xong! Đang vẽ hình minh họa (Delay 5s để tránh lỗi)...');
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
                    setProgress(`Đang vẽ hình minh họa ${i + 1}/${updatedQuestions.length} (Đợi 5 giây)...`);

                    if (i > 0) await new Promise(resolve => setTimeout(resolve, 5000));

                    try {
                        const randomId = Math.floor(Math.random() * 999999);
                        const enhancedPrompt = `${q.imagePrompt}, cute educational cartoon, white background, high quality --seed ${randomId}`;
                        const imageUrl = await generate_image(enhancedPrompt);
                        updatedQuestions[i].imageUrl = imageUrl;
                        setWorksheet({ ...ws, questions: [...updatedQuestions] });
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành! Bạn có thể xuất PDF ngay bây giờ.');
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
            const enhancedPrompt = `${q.imagePrompt}, educational cartoon style --seed ${randomSeed}`;
            const imageUrl = await generate_image(enhancedPrompt);
            updatedQuestions[index].imageUrl = imageUrl;
            setWorksheet({ ...worksheet, questions: updatedQuestions });
            setProgress('Đã vẽ lại ảnh thành công!');
        } catch (error) {
            alert('Vẫn bị giới hạn lượt tạo. Thầy Cô vui lòng đợi 1 phút nhé!');
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
          body { font-family: 'Arial', sans-serif; max-width: 210mm; margin: 0 auto; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 3px solid #FF6B9D; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { color: #FF6B9D; margin: 0; font-size: 28px; }
          .student-info { margin-bottom: 20px; padding: 10px; border: 1px dashed #999; border-radius: 5px; font-size: 14px; }
          .question { margin: 25px 0; padding: 15px; border: 1px solid #eee; border-radius: 10px; page-break-inside: avoid; }
          .question-header { font-weight: bold; color: #1976D2; margin-bottom: 10px; font-size: 18px; }
          .question-image { text-align: center; margin: 15px 0; }
          .question-image img { max-width: 70%; max-height: 250px; border-radius: 10px; }
          .options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
          .option { padding: 10px; border: 1px solid #ddd; border-radius: 5px; background: #fff; }
          .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${worksheet.title}</h1>
          <p>Môn: ${worksheet.subject} - Lớp 1</p>
        </div>
        <div class="student-info">Họ tên: ........................................................... Lớp: ................. Ngày: ..../..../20....</div>
        ${worksheet.questions.map((q, index) => `
          <div class="question">
            <div class="question-header">Câu ${index + 1}: ${q.question}</div>
            ${q.imageUrl ? `<div class="question-image"><img src="${q.imageUrl}" /></div>` : ''}
            ${q.options && q.options.length > 0 ? `
              <div class="options">
                ${q.options.map(opt => `<div class="option">${opt}</div>`).join('')}
              </div>
            ` : `<div style="height: 60px; border-bottom: 1px dotted #ccc; margin-top: 15px;">Trả lời:</div>`}
          </div>
        `).join('')}
        <div class="footer">Dành cho học sinh lớp 1 - Chúc các em học tốt!</div>
      </body>
      </html>
    `;
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 1000);
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', background: '#f0f2f5', height: 'calc(100vh - 40px)', overflowY: 'auto', borderRadius: '20px' }} className="custom-scrollbar">
            <div style={{ background: 'white', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ color: '#FF6B9D', margin: 0 }}>📚 Tạo Phiếu Học Tập Lớp 1</h1>
                    <p>Soạn bài nhanh chóng với hình ảnh minh họa thông minh</p>
                    <span style={{ fontSize: '10px', background: '#eee', padding: '2px 8px', borderRadius: '10px', color: '#999' }}>v2.0.5-model-001</span>
                </div>

                {!worksheet && (
                    <div style={{ background: '#FFF9C4', padding: '25px', borderRadius: '15px', border: '1px solid #FFA726' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>📖 Môn học:</label>
                                <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #FF9800' }}>
                                    {subjects.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>📝 Dạng bài:</label>
                                <select value={questionFormat} onChange={(e) => setQuestionFormat(e.target.value as any)} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #FF9800' }}>
                                    <option value="hon-hop">Hỗn hợp</option>
                                    <option value="trac-nghiem">Trắc nghiệm</option>
                                    <option value="tu-luan">Tự luận</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>🔢 Số câu ({questionCount}):</label>
                                <input type="range" min="1" max="10" value={questionCount} onChange={(e) => setQuestionCount(parseInt(e.target.value))} style={{ width: '100%', accentColor: '#FF6B9D' }} />
                            </div>
                        </div>
                        <div style={{ marginBottom: '25px' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>💡 Chủ đề:</label>
                            <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Bé nhận biết màu sắc, Đếm các loài vật..." style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} style={{ width: '100%', padding: '15px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', transition: 'transform 0.2s' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                            {isGenerating ? '⏳ ĐANG TẠO PHIẾU...' : '✨ BẮT ĐẦU TẠO PHIẾU'}
                        </button>
                    </div>
                )}

                {progress && (
                    <div style={{ margin: '20px 0', padding: '12px', background: '#E3F2FD', borderRadius: '10px', textAlign: 'center', color: '#1976D2', fontWeight: 'bold' }}>
                        {progress}
                    </div>
                )}

                {worksheet && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
                            <h2 style={{ color: '#1976D2', margin: 0 }}>{worksheet.title}</h2>
                            <button onClick={() => setWorksheet(null)} style={{ padding: '8px 15px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer' }}>Quay lại</button>
                        </div>

                        {worksheet.questions && worksheet.questions.map((q, index) => (
                            <div key={index} style={{ padding: '20px', background: '#f9f9f9', borderRadius: '15px', marginBottom: '20px', border: '1px solid #eee' }}>
                                <p style={{ fontSize: '18px', fontWeight: 'bold' }}>Câu {index + 1}: {q.question}</p>
                                <div style={{ textAlign: 'center', margin: '15px 0' }}>
                                    {q.imageUrl ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={q.imageUrl} style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '10px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }} alt="Hình minh họa" />
                                            <button onClick={() => handleRetryImage(index)} title="Vẽ lại ảnh" style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.8)', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>🔄</button>
                                        </div>
                                    ) : (
                                        <div style={{ height: '200px', background: '#eee', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                                            {isGeneratingImages ? '⏳ Đang vẽ ảnh...' : 'Ảnh bị lỗi'}
                                        </div>
                                    )}
                                </div>
                                {q.options && q.options.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                        {q.options.map((opt, i) => <div key={i} style={{ padding: '12px', background: 'white', border: '1px solid #ddd', borderRadius: '8px' }}>{opt}</div>)}
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={{ position: 'sticky', bottom: '20px', display: 'flex', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '15px', boxShadow: '0 -5px 20px rgba(0,0,0,0.1)', border: '2px solid #FF6B9D' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, padding: '18px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '20px', cursor: isGeneratingImages ? 'wait' : 'pointer' }}>
                                {isGeneratingImages ? '⏳ ĐANG VẼ ẢNH...' : '🖨️ XUẤT FILE PDF & IN'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
