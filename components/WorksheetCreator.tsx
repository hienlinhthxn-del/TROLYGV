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
            setProgress('Câu hỏi đã xong! Đang vẽ hình minh họa (Đợi 2 giây/câu để tránh quá tải)...');
            await generateImages(content);
        } catch (error: any) {
            console.error('Lỗi khi tạo phiếu học tập:', error);
            alert(`Có lỗi xảy ra: ${error.message || 'Lỗi không xác định'}. Thầy Cô vui lòng thử lại nhé!`);
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
                if (q.imagePrompt || q.question) {
                    const promptToUse = q.imagePrompt || q.question;

                    // Tăng thời gian chờ để tránh bị khóa (Rate Limit) bởi nhà cung cấp ảnh miễn phí
                    if (i > 0) {
                        setProgress(`Đang nghỉ 3 giây để chuẩn bị vẽ câu ${i + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, 3500));
                    }

                    setProgress(`Đang vẽ hình minh họa cho câu ${i + 1}/${updatedQuestions.length}...`);

                    try {
                        const imageUrl = await generate_image(promptToUse);
                        updatedQuestions[i].imageUrl = imageUrl;

                        // Cập nhật từng ảnh một để giáo viên thấy ngay
                        setWorksheet(prev => prev ? { ...prev, questions: [...updatedQuestions] } : null);
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành toàn bộ phiếu học tập!');
        } finally {
            setIsGeneratingImages(false);
            // Sau 5 giây thì ẩn dòng tiến trình
            setTimeout(() => setProgress(''), 5000);
        }
    };

    const handleRetryImage = async (index: number) => {
        if (!worksheet || isGeneratingImages) return;

        const updatedQuestions = [...worksheet.questions];
        const q = updatedQuestions[index];
        const promptToRetry = q.imagePrompt || q.question;

        setProgress(`Đang thử vẽ lại hình minh họa câu ${index + 1}...`);
        try {
            const imageUrl = await generate_image(promptToRetry);
            updatedQuestions[index].imageUrl = imageUrl;
            setWorksheet({ ...worksheet, questions: updatedQuestions });
            setProgress('Câu hỏi đã được vẽ lại ảnh mới!');
            setTimeout(() => setProgress(''), 3000);
        } catch (error) {
            alert('Máy chủ ảnh đang quá tải. Thầy Cô vui lòng đợi khoảng 1 phút rồi nhấn thử lại nhé!');
            setProgress('Vẽ lại ảnh thất bại.');
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
                            <div style={{ flex: 1 }}>
                                <input
                                    type="text"
                                    value={worksheet.title}
                                    onChange={(e) => setWorksheet({ ...worksheet, title: e.target.value })}
                                    style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976D2', border: '1px solid transparent', width: '100%', padding: '5px', borderRadius: '5px' }}
                                    onFocus={(e) => e.target.style.border = '1px solid #ddd'}
                                    onBlur={(e) => e.target.style.border = '1px solid transparent'}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    onClick={() => {
                                        const newQ: WorksheetQuestion = {
                                            id: Date.now().toString(),
                                            type: 'essay',
                                            question: 'Câu hỏi mới...',
                                        };
                                        setWorksheet({ ...worksheet, questions: [...worksheet.questions, newQ] });
                                    }}
                                    style={{ padding: '8px 15px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                                >
                                    ➕ Thêm câu hỏi
                                </button>
                                <button onClick={() => setWorksheet(null)} style={{ padding: '8px 15px', background: '#f0f0f0', border: '1px solid #ccc', borderRadius: '5px', cursor: 'pointer' }}>Quay lại</button>
                            </div>
                        </div>

                        {worksheet.questions && worksheet.questions.map((q, index) => (
                            <div key={index} style={{ padding: '20px', background: '#f9f9f9', borderRadius: '15px', marginBottom: '20px', border: '1px solid #eee', position: 'relative' }}>
                                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                                    <button
                                        onClick={() => {
                                            const updated = worksheet.questions.filter((_, i) => i !== index);
                                            setWorksheet({ ...worksheet, questions: updated });
                                        }}
                                        style={{ background: '#FF5252', color: 'white', border: 'none', borderRadius: '5px', width: '30px', height: '30px', cursor: 'pointer' }}
                                        title="Xóa câu này"
                                    >
                                        🗑️
                                    </button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                    <span style={{ fontWeight: 'bold', minWidth: '60px' }}>Câu {index + 1}:</span>
                                    <textarea
                                        value={q.question}
                                        onChange={(e) => {
                                            const updated = [...worksheet.questions];
                                            updated[index].question = e.target.value;
                                            setWorksheet({ ...worksheet, questions: updated });
                                        }}
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', minHeight: '40px' }}
                                    />
                                </div>

                                <div style={{ textAlign: 'center', margin: '15px 0' }}>
                                    {q.imageUrl ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={q.imageUrl} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} alt="Hình minh họa" />
                                            <button onClick={() => handleRetryImage(index)} title="Vẽ lại ảnh" style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>🔄</button>
                                        </div>
                                    ) : (
                                        <div style={{ height: '150px', background: '#eee', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                                            {isGeneratingImages ? '⏳ Đang vẽ ảnh...' : 'Chưa có ảnh (Bấm vẽ lại để tạo)'}
                                        </div>
                                    )}
                                </div>

                                {q.options && q.options.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                                        {q.options.map((opt, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}.</span>
                                                <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={(e) => {
                                                        const updated = [...worksheet.questions];
                                                        if (updated[index].options) {
                                                            updated[index].options![i] = e.target.value;
                                                            setWorksheet({ ...worksheet, questions: updated });
                                                        }
                                                    }}
                                                    style={{ flex: 1, padding: '8px', borderRadius: '5px', border: '1px solid #ddd' }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        <div style={{ position: 'sticky', bottom: '20px', zIndex: 100, display: 'flex', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderRadius: '20px', boxShadow: '0 -5px 25px rgba(0,0,0,0.15)', border: '2px solid #FF6B9D' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, padding: '15px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '18px', cursor: isGeneratingImages ? 'wait' : 'pointer', boxShadow: '0 4px 10px rgba(76, 175, 80, 0.3)' }}>
                                {isGeneratingImages ? '⏳ ĐANG VẼ ẢNH...' : '🖨️ XUẤT FILE PDF & IN'}
                            </button>
                            <button
                                onClick={() => {
                                    if (window.confirm('Thầy Cô muốn vẽ lại TOÀN BỘ ảnh bị lỗi?')) {
                                        const missing = worksheet.questions.filter(q => !q.imageUrl || q.imageUrl.includes('rate-limit'));
                                        if (missing.length > 0) generateImages(worksheet);
                                        else alert('Các câu đều đã có ảnh rồi ạ!');
                                    }
                                }}
                                disabled={isGeneratingImages}
                                style={{ flex: 1, padding: '15px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}
                            >
                                🔄 Vẽ lại các ảnh lỗi
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
