import React, { useState } from 'react';
import { generateWorksheetContentDetailed } from '../services/geminiService';
import { generate_image } from '../services/imageService';

interface WorksheetQuestion {
    id: string;
    type: string;
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

    // Hạng mục cấu trúc câu hỏi chi tiết
    const [config, setConfig] = useState({
        mcq: 3,
        tf: 2,
        fill: 1,
        match: 1,
        essay: 2
    });

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

        const total = Object.values(config).reduce((a, b) => a + b, 0);
        if (total === 0) {
            alert('Vui lòng chọn ít nhất 1 câu hỏi!');
            return;
        }

        setIsGenerating(true);
        setProgress('Đang tạo nội dung câu hỏi...');
        setWorksheet(null);

        try {
            const content = await generateWorksheetContentDetailed(topic, subject, config);
            setWorksheet(content);
            setProgress('Câu hỏi đã xong! Đang vẽ hình minh họa...');
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

                    if (i > 0) {
                        setProgress(`Nghỉ chút để chuẩn bị vẽ câu ${i + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, 3500));
                    }

                    setProgress(`Đang vẽ minh họa câu ${i + 1}/${updatedQuestions.length}...`);

                    try {
                        const imageUrl = await generate_image(promptToUse);
                        updatedQuestions[i].imageUrl = imageUrl;
                        setWorksheet(prev => prev ? { ...prev, questions: [...updatedQuestions] } : null);
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành toàn bộ phiếu học tập!');
        } finally {
            setIsGeneratingImages(false);
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
            setProgress('Đã vẽ lại ảnh mới!');
            setTimeout(() => setProgress(''), 3000);
        } catch (error) {
            alert('Máy chủ ảnh đang bận. Thầy Cô thử lại sau 1 lát nhé!');
            setProgress('Lỗi vẽ ảnh.');
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
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', background: '#f0f2f5', minHeight: 'calc(100vh - 40px)', overflowY: 'auto', borderRadius: '20px' }}>
            <div style={{ background: 'white', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ color: '#FF6B9D', margin: 0 }}>📚 Tạo Phiếu Học Tập Lớp 1</h1>
                    <p>Thiết kế phiếu bài tập đa dạng với sự hỗ trợ của AI</p>
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
                            <div style={{ gridColumn: 'span 1 md:span 2' }}>
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>� Chủ đề bài học:</label>
                                <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: Bé học đếm, Nhận biết chữ cái..." style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
                            </div>
                        </div>

                        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #FFE082', marginBottom: '20px' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>📝 Chọn cơ cấu câu hỏi:</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                                {[
                                    { id: 'mcq', label: 'Trắc nghiệm (lựa chọn)', color: '#4CAF50' },
                                    { id: 'tf', label: 'Đúng / Sai', color: '#2196F3' },
                                    { id: 'fill', label: 'Điền khuyết', color: '#FF9800' },
                                    { id: 'match', label: 'Bài nối cột', color: '#9C27B0' },
                                    { id: 'essay', label: 'Tự luận / Viết', color: '#F44336' }
                                ].map(type => (
                                    <div key={type.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: '#F5F5F5', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{type.label}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max="10"
                                            value={config[type.id as keyof typeof config]}
                                            onChange={(e) => setConfig({ ...config, [type.id]: parseInt(e.target.value) || 0 })}
                                            style={{ width: '50px', padding: '5px', borderRadius: '4px', border: `2px solid ${type.color}`, textAlign: 'center' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleGenerate} disabled={isGenerating || !topic.trim()} style={{ width: '100%', padding: '15px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', transition: 'transform 0.2s', boxShadow: '0 4px 15px rgba(255,107,157,0.4)' }}>
                            {isGenerating ? '⏳ AI ĐANG SOẠN PHIẾU...' : '✨ BẮT ĐẦU TẠO PHIẾU NGAY'}
                        </button>
                    </div>
                )}

                {progress && (
                    <div style={{ margin: '20px 0', padding: '15px', background: '#E3F2FD', borderRadius: '10px', textAlign: 'center', color: '#1976D2', fontWeight: 'bold', border: '1px solid #BBDEFB' }}>
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
                                            question: 'Nội dung câu hỏi mới...',
                                        };
                                        const updatedQuestions = [...worksheet.questions, newQ];
                                        setWorksheet({ ...worksheet, questions: updatedQuestions });
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
                                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', minHeight: '50px' }}
                                    />
                                </div>

                                <div style={{ textAlign: 'center', margin: '15px 0' }}>
                                    {q.imageUrl ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={q.imageUrl} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }} alt="Hình minh họa" />
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                                                <button onClick={() => handleRetryImage(index)} title="Vẽ lại ảnh AI" style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>🔄</button>
                                                <button
                                                    onClick={() => {
                                                        const input = document.createElement('input');
                                                        input.type = 'file';
                                                        input.accept = 'image/*';
                                                        input.onchange = (e: any) => {
                                                            const file = e.target.files[0];
                                                            if (file) {
                                                                const reader = new FileReader();
                                                                reader.onload = (re) => {
                                                                    const updated = [...worksheet.questions];
                                                                    updated[index].imageUrl = re.target?.result as string;
                                                                    setWorksheet({ ...worksheet, questions: updated });
                                                                };
                                                                reader.readAsDataURL(file);
                                                            }
                                                        };
                                                        input.click();
                                                    }}
                                                    title="Tải ảnh từ máy tính"
                                                    style={{ background: 'rgba(255,255,255,0.9)', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                                                >
                                                    📁
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ height: '140px', background: '#eee', border: '2px dashed #ccc', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888', gap: '10px' }}>
                                            <span>{isGeneratingImages ? '⏳ Đang vẽ ảnh...' : 'Chưa có ảnh'}</span>
                                            <button
                                                onClick={() => {
                                                    const input = document.createElement('input');
                                                    input.type = 'file';
                                                    input.accept = 'image/*';
                                                    input.onchange = (e: any) => {
                                                        const file = e.target.files[0];
                                                        if (file) {
                                                            const reader = new FileReader();
                                                            reader.onload = (re) => {
                                                                const updated = [...worksheet.questions];
                                                                updated[index].imageUrl = re.target?.result as string;
                                                                setWorksheet({ ...worksheet, questions: updated });
                                                            };
                                                            reader.readAsDataURL(file);
                                                        }
                                                    };
                                                    input.click();
                                                }}
                                                style={{ padding: '6px 15px', background: 'white', border: '1px solid #ccc', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                                            >
                                                📁 Tải ảnh lên
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {q.options && q.options.length > 0 && (
                                    <div style={{ marginBottom: '15px' }}>
                                        <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px', color: '#666' }}>Các phương án trả lời:</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                                            {q.options.map((opt, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#1976D2' }}>{String.fromCharCode(65 + i)}.</span>
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
                                    </div>
                                )}

                                <div style={{ background: '#E8F5E9', padding: '12px', borderRadius: '10px', border: '1px solid #C8E6C9' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '5px', color: '#2E7D32' }}>Đáp án / Hướng dẫn trả lời:</label>
                                    <input
                                        type="text"
                                        value={q.answer || ''}
                                        onChange={(e) => {
                                            const updated = [...worksheet.questions];
                                            updated[index].answer = e.target.value;
                                            setWorksheet({ ...worksheet, questions: updated });
                                        }}
                                        placeholder="Nhập đáp án đúng hoặc gợi ý..."
                                        style={{ width: '100%', padding: '8px', borderRadius: '5px', border: '1px solid #A5D6A7', boxSizing: 'border-box' }}
                                    />
                                </div>
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

