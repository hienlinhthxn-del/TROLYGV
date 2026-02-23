import React, { useState, useEffect, useRef } from 'react';
import { generateWorksheetContentDetailed, geminiService } from '../services/geminiService';

interface WorksheetQuestion {
    id: string;
    type: string;
    question: string;
    imagePrompt?: string;
    imageUrl?: string;
    options?: string[];
    answer?: string;
    numbers?: string[];
    pairs?: string[][];
}

interface Worksheet {
    id?: string;
    title: string;
    subject: string;
    questions: WorksheetQuestion[];
    readingPassage?: string;
    lastModified?: string;
}

const WorksheetCreator: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [subject, setSubject] = useState('Toán');
    const [sampleImage, setSampleImage] = useState<string | null>(null);
    const [history, setHistory] = useState<Worksheet[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const [autoGenerateImages, setAutoGenerateImages] = useState(true);
    const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });

    // Hạng mục cấu trúc câu hỏi chi tiết
    const [config, setConfig] = useState({
        mcq: 2,
        tf: 1,
        fill: 1,
        match: 0,
        essay: 1,
        arrange: 1,
        circle: 2,
        compare: 1,
        reading: 0
    });

    const [worksheet, setWorksheet] = useState<Worksheet | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [progress, setProgress] = useState('');
    const forceStopRef = useRef(false);

    const subjects = ['Toán', 'Tiếng Việt', 'Tự nhiên & Xã hội', 'Đạo đức', 'Âm nhạc', 'Mỹ thuật'];

    // Xử lý dán ảnh mẫu trực tiếp
    useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        const reader = new FileReader();
                        reader.onload = (re) => setSampleImage(re.target?.result as string);
                        reader.readAsDataURL(file);
                    }
                }
            }
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, []);

    useEffect(() => {
        const saved = localStorage.getItem('worksheet_history');
        if (saved) setHistory(JSON.parse(saved));
    }, []);

    const saveToHistory = (ws: Worksheet) => {
        const updatedWs = { ...ws, id: ws.id || Date.now().toString(), lastModified: new Date().toISOString() };
        const newHistory = [updatedWs, ...history.filter(h => h.id !== updatedWs.id)].slice(0, 20);
        setHistory(newHistory);
        localStorage.setItem('worksheet_history', JSON.stringify(newHistory));
    };

    const handleDeleteFromHistory = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Bạn có chắc muốn xóa phiếu này khỏi lịch sử?')) {
            const updated = history.filter(h => h.id !== id);
            setHistory(updated);
            localStorage.setItem('worksheet_history', JSON.stringify(updated));
        }
    };

    const handleRenameFromHistory = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const item = history.find(h => h.id === id);
        if (!item) return;
        const newName = prompt('Nhập tên mới cho phiếu học tập:', item.title);
        if (newName && newName.trim() !== '') {
            const updated = history.map(h => h.id === id ? { ...h, title: newName.trim() } : h);
            setHistory(updated);
            localStorage.setItem('worksheet_history', JSON.stringify(updated));
        }
    };

    const handleGenerate = async () => {
        if (!topic.trim() && !sampleImage) {
            alert('Vui lòng nhập chủ đề hoặc tải lên ảnh mẫu!');
            return;
        }

        const total = Object.values(config).reduce((a: number, b: number) => a + b, 0);
        if (total === 0) {
            alert('Vui lòng chọn ít nhất 1 câu hỏi!');
            return;
        }

        setIsGenerating(true);
        setProgress('Đang đọc ảnh mẫu và tạo nội dung câu hỏi...');
        setWorksheet(null);

        try {
            const fileParts = sampleImage ? [{ inlineData: { data: sampleImage.split(',')[1], mimeType: 'image/png' } }] : undefined;

            // Logic xử lý prompt: Nếu có ảnh, yêu cầu AI học theo cấu trúc ảnh nhưng tạo nội dung mới
            let effectiveTopic = topic;
            if (sampleImage) {
                effectiveTopic = `HÃY TẠO PHIẾU BÀI TẬP MỚI DỰA TRÊN ẢNH MẪU.\n`;
                if (topic.trim()) effectiveTopic += `Chủ đề yêu cầu: "${topic}".\n`;
                effectiveTopic += `Yêu cầu quan trọng: Phân tích ảnh đính kèm để hiểu cấu trúc, dạng bài và độ khó. Sau đó tạo ra các câu hỏi MỚI HOÀN TOÀN (không chép lại nội dung cũ) có phong cách tương tự ảnh mẫu${topic.trim() ? ` và phù hợp với chủ đề "${topic}"` : ''}.`;
            }

            const content = await generateWorksheetContentDetailed(effectiveTopic, subject, config, fileParts);
            if (forceStopRef.current) throw new Error('Yêu cầu đã bị dừng.');

            // Kiểm tra xem content có lỗi không
            if (content && content.error) {
                alert(`⚠️ ${content.error}\n\nVui lòng thử lại hoặc điều chỉnh yêu cầu.`);
                return;
            }

            // Kiểm tra xem có câu hỏi không
            if (!content || !content.questions || !Array.isArray(content.questions) || content.questions.length === 0) {
                alert("⚠️ AI không tạo được câu hỏi nào.\n\nGợi ý:\n1. Thử lại với chủ đề cụ thể hơn\n2. Giảm số lượng câu hỏi\n3. Kiểm tra kết nối mạng");
                return;
            }

            setWorksheet(content);
            if (autoGenerateImages) {
                setProgress('Câu hỏi đã xong! Đang vẽ hình minh họa...');
                await generateImages(content);
            } else {
                setProgress('Tạo câu hỏi hoàn tất! Nhấn "🎨 Vẽ tất cả ảnh" để tạo hình minh họa.');
                setTimeout(() => setProgress(''), 5000);
            }
        } catch (error: any) {
            console.error('Lỗi khi tạo phiếu học tập:', error);
            const msg = error.message || "";
            if (msg.includes("429") || msg.toLowerCase().includes("quota") || msg.includes("resource_exhausted")) {
                alert("⚠️ Hết lượt sử dụng miễn phí (Quota Exceeded).\n\nVui lòng vào Cài đặt (🔑) để nhập API Key mới.");
                try { window.dispatchEvent(new Event('openApiSettings')); } catch { }
            } else if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
                alert("⚠️ Mô hình AI hiện tại không khả dụng (404). Hệ thống đã tự động đặt lại cấu hình. Vui lòng thử lại.");
                localStorage.removeItem('preferred_gemini_model');
                localStorage.removeItem('preferred_gemini_version');
            } else {
                alert(`Có lỗi xảy ra: ${msg || 'Lỗi không xác định'}. Thầy Cô vui lòng thử lại nhé!`);
            }
        } finally {
            setIsGenerating(false);
        }
    };

    const generateImages = async (ws: Worksheet) => {
        setIsGeneratingImages(true);
        forceStopRef.current = false;
        const updatedQuestions = [...ws.questions];
        // Chỉ tạo ảnh cho câu có imagePrompt hoặc question
        const questionsWithPrompt = updatedQuestions.filter(q => q.imagePrompt || q.question);
        setImageProgress({ current: 0, total: questionsWithPrompt.length });

        try {
            let doneCount = 0;
            for (let i = 0; i < updatedQuestions.length; i++) {
                if (forceStopRef.current) {
                    setProgress(`⏹️ Đã dừng! Đã vẽ ${doneCount}/${questionsWithPrompt.length} ảnh.`);
                    break;
                }
                const q = updatedQuestions[i];
                // Ưu tiên dùng imagePrompt từ AI, fallback sang question
                const promptToUse = (q.imagePrompt && q.imagePrompt.trim()) ? q.imagePrompt.trim() : q.question;
                if (!promptToUse) continue;

                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, 600));
                }
                if (forceStopRef.current) break;

                doneCount++;
                setImageProgress({ current: doneCount, total: questionsWithPrompt.length });
                setProgress(`🎨 Đang vẽ minh họa câu ${i + 1}/${updatedQuestions.length} (${doneCount}/${questionsWithPrompt.length})...`);

                try {
                    const imageUrl = await geminiService.generateImage(promptToUse);
                    updatedQuestions[i].imageUrl = imageUrl;
                    setWorksheet(prev => prev ? { ...prev, questions: [...updatedQuestions] } : null);
                } catch (error) {
                    console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    updatedQuestions[i].imageUrl = undefined;
                }
            }
            if (!forceStopRef.current) {
                setProgress(`✅ Hoàn thành! Đã vẽ ${doneCount} hình minh họa.`);
            }
        } finally {
            setIsGeneratingImages(false);
            setImageProgress({ current: 0, total: 0 });
            setTimeout(() => setProgress(''), 6000);
        }
    };

    const handleRetryImage = async (index: number) => {
        if (!worksheet || isGeneratingImages) return;
        const updatedQuestions = [...worksheet.questions];
        const q = updatedQuestions[index];
        const promptToRetry = q.imagePrompt || q.question;
        setProgress(`Đang vẽ lại hình minh họa câu ${index + 1}...`);
        try {
            const imageUrl = await geminiService.generateImage(promptToRetry);
            updatedQuestions[index].imageUrl = imageUrl;
            setWorksheet({ ...worksheet, questions: updatedQuestions });
            setProgress('Đã vẽ lại ảnh mới!');
            setTimeout(() => setProgress(''), 3000);
        } catch (error) {
            alert('Máy chủ ảnh đang bận. Thầy Cô thử lại sau nhé!');
            setProgress('Lỗi vẽ ảnh.');
        }
    };

    const handleExportPDF = () => {
        if (!worksheet) return;
        saveToHistory(worksheet);
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
          <p>Môn: ${worksheet.subject}</p>
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
            ` : `<div style="height: 60px; border-bottom: 1px dotted #ccc; margin-top: 15px;">Trả lời:....................................................................</div>`}
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

    const handleExportJSON = () => {
        if (!worksheet) return;
        saveToHistory(worksheet);
        try {
            const jsonStr = JSON.stringify(worksheet, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${worksheet.title || 'quiz'}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: any) {
            alert('Lỗi khi xuất JSON: ' + (e.message || e));
        }
    };

    const handleExportDOCX = async () => {
        if (!worksheet) return;
        saveToHistory(worksheet);
        try {
            const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${worksheet.title}</title>
                <style>
                    body { font-family: Arial, sans-serif; color: #333; }
                    .header { text-align: center; }
                    .question { margin: 18px 0; }
                    .question-image img { max-width: 400px; height: auto; }
                </style>
            </head>
            <body>
                <div class="header"><h1>${worksheet.title}</h1><p>Môn: ${worksheet.subject}</p></div>
                ${worksheet.questions.map((q, index) => `
                    <div class="question">
                        <div><strong>Câu ${index + 1}:</strong> ${q.question}</div>
                        ${q.imageUrl ? `<div class="question-image"><img src="${q.imageUrl}" /></div>` : ''}
                        ${q.options && q.options.length > 0 ? `<div><em>Đáp án:</em><ul>${q.options.map(o => `<li>${o}</li>`).join('')}</ul></div>` : ''}
                    </div>
                `).join('')}
            </body>
            </html>
        `;

            // Create a blob and save as .docx (Word will open HTML content inside)
            const blob = new Blob(['\uFEFF', html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${worksheet.title || 'quiz'}.docx`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        } catch (e: any) {
            alert('Lỗi khi xuất DOCX: ' + (e.message || e));
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', background: '#f0f2f5', height: '100%', overflowY: 'auto', borderRadius: '20px' }} className="custom-scrollbar">
            <div style={{ background: 'white', borderRadius: '20px', padding: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <h1 style={{ color: '#FF6B9D', margin: 0 }}>📚 Tạo Phiếu Học Tập Lớp 1</h1>
                        <p>Thông minh - Đa dạng - Visual đẹp</p>
                    </div>
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        style={{ padding: '10px 15px', background: '#9C27B0', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                        {showHistory ? '✖ Đóng Lịch Sử' : '🕒 Phiếu Cũ'}
                    </button>
                </div>

                {showHistory && (
                    <div style={{ marginBottom: '30px', background: '#F3E5F5', padding: '20px', borderRadius: '15px', border: '1px solid #E1BEE7' }}>
                        <h3 style={{ margin: '0 0 15px 0', color: '#7B1FA2' }}>📋 Danh sách Phiếu đã tạo gần đây:</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '15px' }}>
                            {history.length > 0 ? history.map((ws) => (
                                <div key={ws.id} onClick={() => { setWorksheet(ws); setShowHistory(false); }} style={{ padding: '15px', background: 'white', borderRadius: '10px', border: '1px solid #ce93d8', cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }} className="group" onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                                    <div style={{ fontWeight: 'bold', color: '#1976D2', marginBottom: '5px', paddingRight: '30px' }} className="line-clamp-1">{ws.title}</div>
                                    <div style={{ fontSize: '11px', color: '#888' }}>Môn: {ws.subject} - {ws.questions.length} câu</div>
                                    <div style={{ fontSize: '10px', color: '#aaa', marginTop: '5px' }}>{ws.lastModified ? new Date(ws.lastModified).toLocaleString('vi-VN') : ''}</div>
                                    <div className="absolute top-3 right-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => handleRenameFromHistory(ws.id!, e)} title="Đổi tên" className="w-7 h-7 flex items-center justify-center bg-white text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 rounded-full border border-slate-200 transition-all">
                                            <i className="fas fa-pen text-xs"></i>
                                        </button>
                                        <button onClick={(e) => handleDeleteFromHistory(ws.id!, e)} title="Xóa" className="w-7 h-7 flex items-center justify-center bg-white text-slate-500 hover:bg-rose-50 hover:text-rose-600 rounded-full border border-slate-200 transition-all">
                                            <i className="fas fa-trash-alt text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                            )) : <p style={{ fontSize: '13px', color: '#888' }}>Chưa có phiếu học tập nào được lưu.</p>}
                        </div>
                    </div>
                )}

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
                                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>💡 Chủ đề / Lời nhắc (Nếu có ảnh mẫu, AI sẽ tạo phiếu mới có cấu trúc tương tự):</label>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="VD: So sánh số có 2 chữ số..." style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }} />
                                    <input type="file" id="sample-upload" hidden onChange={(e: any) => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onload = (re) => setSampleImage(re.target?.result as string);
                                            reader.readAsDataURL(file);
                                        }
                                    }} />
                                    <button onClick={() => document.getElementById('sample-upload')?.click()} style={{ padding: '0 15px', background: sampleImage ? '#4CAF50' : '#2196F3', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>
                                        {sampleImage ? '✅ Đã có ảnh mẫu' : '📸 Chọn ảnh mẫu'}
                                    </button>
                                </div>
                                {sampleImage && <div style={{ marginTop: '10px', fontSize: '11px', color: '#4CAF50' }}>AI sẽ tạo phiếu mới có cấu trúc giống ảnh mẫu này. <button onClick={() => setSampleImage(null)} style={{ border: 'none', background: 'none', color: '#F44336', cursor: 'pointer', textDecoration: 'underline' }}>Xóa ảnh</button></div>}
                            </div>
                        </div>

                        <div style={{ background: 'white', padding: '20px', borderRadius: '12px', border: '1px solid #FFE082', marginBottom: '20px' }}>
                            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '15px' }}>📝 Chọn cơ cấu bài tập:</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px' }}>
                                {[
                                    { id: 'circle', label: '⭕ Khoanh tròn', color: '#E91E63' },
                                    { id: 'compare', label: '⚖️ So sánh >, <, =', color: '#00BCD4' },
                                    { id: 'mcq', label: '✅ Trắc nghiệm', color: '#4CAF50' },
                                    { id: 'tf', label: '✔️ Đúng / Sai', color: '#2196F3' },
                                    { id: 'fill', label: '✏️ Điền khuyết', color: '#FF9800' },
                                    { id: 'arrange', label: '🔢 Sắp xếp', color: '#673AB7' },
                                    { id: 'essay', label: '📝 Tự luận', color: '#F44336' },
                                    { id: 'match', label: '🔗 Nối cột', color: '#9C27B0' },
                                    { id: 'reading', label: '📖 Đọc hiểu', color: '#795548' }
                                ].map(type => (
                                    <div key={type.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: '#F5F5F5', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{type.label}</span>
                                        <input type="number" min="0" max="10" value={config[type.id as keyof typeof config]} onChange={(e) => setConfig({ ...config, [type.id]: parseInt(e.target.value) || 0 })} style={{ width: '45px', padding: '5px', borderRadius: '5px', border: `2px solid ${type.color}`, textAlign: 'center' }} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: 'white', borderRadius: '10px', border: '1px solid #FFE082', marginBottom: '15px' }}>
                            <span style={{ fontSize: '20px' }}>🎨</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold', fontSize: '14px' }}>Tự động tạo hình minh họa</div>
                                <div style={{ fontSize: '12px', color: '#888' }}>AI vẽ ảnh minh họa cho mỗi câu hỏi sau khi soạn xong (mất thêm 1-2 phút)</div>
                            </div>
                            <button
                                onClick={() => setAutoGenerateImages(!autoGenerateImages)}
                                style={{
                                    width: '52px', height: '28px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                    background: autoGenerateImages ? '#4CAF50' : '#ccc',
                                    position: 'relative', transition: 'background 0.3s'
                                }}
                            >
                                <span style={{
                                    position: 'absolute', top: '3px', width: '22px', height: '22px',
                                    background: 'white', borderRadius: '50%', transition: 'left 0.3s',
                                    left: autoGenerateImages ? '27px' : '3px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                                }} />
                            </button>
                        </div>

                        <button onClick={handleGenerate} disabled={isGenerating} style={{ width: '100%', padding: '15px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,107,157,0.4)' }}>
                            {isGenerating ? '⏳ AI ĐANG LÀM VIỆC...' : '✨ BẮT ĐẦU SOẠN PHIẾU'}
                        </button>
                    </div>
                )}

                {(progress || isGeneratingImages) && (
                    <div style={{ margin: '20px 0', padding: '15px 20px', background: '#E3F2FD', borderRadius: '12px', border: '1px solid #BBDEFB' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: imageProgress.total > 0 ? '10px' : '0' }}>
                            <div style={{ color: '#1976D2', fontWeight: 'bold', fontSize: '14px' }}>{progress}</div>
                            {isGeneratingImages && (
                                <button
                                    onClick={() => { forceStopRef.current = true; }}
                                    style={{ padding: '5px 12px', background: '#FF5252', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', whiteSpace: 'nowrap', marginLeft: '10px' }}
                                >
                                    ⏹️ Dừng
                                </button>
                            )}
                        </div>
                        {imageProgress.total > 0 && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#1565C0', marginBottom: '4px' }}>
                                    <span>Tiến độ: {imageProgress.current}/{imageProgress.total} ảnh</span>
                                    <span>{Math.round((imageProgress.current / imageProgress.total) * 100)}%</span>
                                </div>
                                <div style={{ height: '8px', background: '#BBDEFB', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%', borderRadius: '4px', transition: 'width 0.5s ease',
                                        background: 'linear-gradient(90deg, #1976D2, #42A5F5)',
                                        width: `${Math.round((imageProgress.current / imageProgress.total) * 100)}%`
                                    }} />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {worksheet && (
                    <div style={{ marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
                            <input
                                type="text"
                                value={worksheet.title}
                                onChange={(e) => setWorksheet({ ...worksheet, title: e.target.value })}
                                style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976D2', border: 'none', background: 'transparent', flex: 1 }}
                            />
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={() => { forceStopRef.current = false; generateImages(worksheet); }}
                                    disabled={isGeneratingImages}
                                    title="Tạo/vẽ lại toàn bộ hình minh họa cho phiếu"
                                    style={{ padding: '8px 14px', background: isGeneratingImages ? '#ccc' : '#FF6B9D', color: 'white', border: 'none', borderRadius: '8px', cursor: isGeneratingImages ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                                >
                                    {isGeneratingImages ? '⏳ Đang vẽ...' : '🎨 Vẽ tất cả ảnh'}
                                </button>
                                <button onClick={() => saveToHistory(worksheet)} style={{ padding: '8px 14px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>💾 Lưu</button>
                                <button onClick={handleExportDOCX} style={{ padding: '8px 14px', background: '#3F51B5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>📝 DOCX</button>
                                <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ padding: '8px 14px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>🖨️ PDF</button>
                                <button onClick={() => setWorksheet(null)} style={{ padding: '8px 14px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px' }}>← Quay lại</button>
                            </div>
                        </div>

                        {/* Đoạn văn đọc hiểu (nếu có) */}
                        {worksheet.readingPassage && (
                            <div style={{ padding: '20px', background: '#FFF8E1', borderRadius: '15px', marginBottom: '20px', border: '2px solid #FFE082' }}>
                                <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#F57F17', marginBottom: '10px' }}>📖 Bài đọc hiểu:</div>
                                <textarea
                                    value={worksheet.readingPassage}
                                    onChange={(e) => setWorksheet({ ...worksheet, readingPassage: e.target.value })}
                                    style={{ width: '100%', padding: '15px', borderRadius: '10px', border: '1px solid #FFE082', fontSize: '15px', minHeight: '150px', lineHeight: '1.8', background: 'white', fontFamily: 'serif' }}
                                />
                            </div>
                        )}

                        {worksheet.questions.map((q, index) => {
                            const typeLabel: Record<string, { icon: string, color: string, name: string }> = {
                                circle: { icon: '⭕', color: '#E91E63', name: 'Khoanh tròn' },
                                compare: { icon: '⚖️', color: '#00BCD4', name: 'So sánh' },
                                mcq: { icon: '✅', color: '#4CAF50', name: 'Trắc nghiệm' },
                                tf: { icon: '✔️', color: '#2196F3', name: 'Đúng/Sai' },
                                fill: { icon: '✏️', color: '#FF9800', name: 'Điền khuyết' },
                                arrange: { icon: '🔢', color: '#673AB7', name: 'Sắp xếp' },
                                essay: { icon: '📝', color: '#F44336', name: 'Tự luận' },
                                match: { icon: '🔗', color: '#9C27B0', name: 'Nối cột' },
                                reading: { icon: '📖', color: '#795548', name: 'Đọc hiểu' },
                            };
                            const tl = typeLabel[q.type] || { icon: '❓', color: '#999', name: q.type };

                            return (
                                <div key={index} style={{ padding: '20px', background: '#f9f9f9', borderRadius: '15px', marginBottom: '20px', border: `1px solid #eee`, borderLeft: `4px solid ${tl.color}`, position: 'relative' }}>
                                    {/* Header: số câu + badge loại */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '16px', color: '#1976D2' }}>Câu {index + 1}</span>
                                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: tl.color, color: 'white', fontWeight: 'bold' }}>{tl.icon} {tl.name}</span>
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                                            <button onClick={() => {
                                                const updated = worksheet.questions.filter((_, i) => i !== index);
                                                setWorksheet({ ...worksheet, questions: updated });
                                            }} style={{ background: '#FF5252', color: 'white', border: 'none', borderRadius: '5px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '12px' }}>🗑️</button>
                                        </div>
                                    </div>

                                    {/* Nội dung câu hỏi */}
                                    <textarea value={q.question} onChange={(e) => {
                                        const updated = [...worksheet.questions];
                                        updated[index].question = e.target.value;
                                        setWorksheet({ ...worksheet, questions: updated });
                                    }} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', minHeight: '45px', marginBottom: '10px' }} />

                                    {/* Hình minh họa */}
                                    <div style={{ textAlign: 'center', margin: '10px 0' }}>
                                        {q.imageUrl ? (
                                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                                <img src={q.imageUrl} style={{ maxWidth: '100%', maxHeight: '280px', borderRadius: '10px', border: '1px solid #eee' }} />
                                                <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', gap: '4px' }}>
                                                    <button onClick={() => handleRetryImage(index)} title="Vẽ lại" style={{ background: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', fontSize: '14px' }}>🔄</button>
                                                    <label title="Tải ảnh" style={{ background: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                                                        📁 <input type="file" hidden accept="image/*" onChange={(e: any) => {
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
                                                        }} />
                                                    </label>
                                                    <button onClick={() => { const updated = [...worksheet.questions]; updated[index].imageUrl = undefined; setWorksheet({ ...worksheet, questions: updated }); }} title="Xóa ảnh" style={{ background: '#FF5252', color: 'white', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', fontSize: '14px' }}>❌</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div
                                                style={{ minHeight: '70px', background: '#f5f5f5', border: '2px dashed #ddd', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', cursor: isGeneratingImages ? 'default' : 'pointer', padding: '10px' }}
                                                onClick={() => !isGeneratingImages && handleRetryImage(index)}
                                            >
                                                <span style={{ fontSize: '22px' }}>{isGeneratingImages ? '⏳' : '🖼️'}</span>
                                                <span style={{ fontSize: '11px', color: '#999' }}>
                                                    {isGeneratingImages ? 'Đang vẽ...' : 'Nhấn để AI vẽ hình minh họa'}
                                                </span>
                                                {q.imagePrompt && !isGeneratingImages && (
                                                    <span style={{ fontSize: '10px', color: '#bbb', fontStyle: 'italic', maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={q.imagePrompt}>💡 {q.imagePrompt}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Hiển thị dữ liệu đặc thù theo type */}
                                    {q.type === 'circle' && q.numbers && q.numbers.length > 0 && (
                                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', margin: '10px 0', padding: '10px', background: 'white', borderRadius: '10px', border: '1px solid #eee' }}>
                                            {q.numbers.map((num, ni) => (
                                                <div key={ni} style={{ width: '50px', height: '50px', borderRadius: '50%', border: '3px solid #E91E63', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#E91E63', background: '#FCE4EC' }}>
                                                    {num}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {q.type === 'compare' && q.pairs && q.pairs.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', margin: '10px 0' }}>
                                            {q.pairs.map((pair, pi) => (
                                                <div key={pi} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '8px', background: 'white', borderRadius: '8px', border: '1px solid #eee' }}>
                                                    <span style={{ padding: '6px 14px', background: '#E0F7FA', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', border: '1px solid #00BCD4' }}>{pair[0]}</span>
                                                    <span style={{ width: '40px', height: '36px', border: '2px solid #FF9800', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: '#FF9800', background: '#FFF8E1' }}>?</span>
                                                    <span style={{ padding: '6px 14px', background: '#E0F7FA', borderRadius: '6px', fontWeight: 'bold', fontSize: '16px', border: '1px solid #00BCD4' }}>{pair[1]}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {q.type === 'arrange' && q.options && q.options.length > 0 && (
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', margin: '10px 0', padding: '12px', background: 'white', borderRadius: '10px', border: '1px dashed #673AB7' }}>
                                            {q.options.map((opt, oi) => (
                                                <span key={oi} style={{ padding: '8px 16px', background: '#EDE7F6', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', color: '#673AB7', border: '1px solid #B39DDB' }}>{opt}</span>
                                            ))}
                                            <span style={{ fontSize: '12px', color: '#999', width: '100%', textAlign: 'center', marginTop: '4px' }}>↕ Sắp xếp các phần tử trên theo thứ tự đúng</span>
                                        </div>
                                    )}

                                    {/* Options cho MCQ, TF, Reading */}
                                    {(q.type === 'mcq' || q.type === 'tf' || q.type === 'reading') && q.options && q.options.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: q.options.length <= 3 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                                            {q.options.map((opt, i) => (
                                                <div key={i} style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 'bold', color: '#555', minWidth: '22px' }}>{String.fromCharCode(65 + i)}.</span>
                                                    <input type="text" value={opt} onChange={(e) => {
                                                        const updated = [...worksheet.questions];
                                                        if (updated[index].options) {
                                                            updated[index].options![i] = e.target.value;
                                                            setWorksheet({ ...worksheet, questions: updated });
                                                        }
                                                    }} style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '5px', fontSize: '14px' }} />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Fill type: hiển thị chỗ trống */}
                                    {q.type === 'fill' && (
                                        <div style={{ padding: '12px', background: '#FFF3E0', borderRadius: '8px', border: '1px dashed #FF9800', margin: '8px 0', textAlign: 'center' }}>
                                            <span style={{ fontSize: '13px', color: '#E65100' }}>✏️ Học sinh điền vào chỗ trống trong câu hỏi</span>
                                        </div>
                                    )}

                                    {/* Đáp án */}
                                    <div style={{ background: '#E8F5E9', padding: '10px 12px', borderRadius: '8px', marginTop: '8px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: '#2E7D32', display: 'block', marginBottom: '4px' }}>✅ Đáp án:</label>
                                        <input type="text" value={q.answer || ''} onChange={(e) => {
                                            const updated = [...worksheet.questions];
                                            updated[index].answer = e.target.value;
                                            setWorksheet({ ...worksheet, questions: updated });
                                        }} style={{ width: '100%', padding: '8px', border: '1px solid #A5D6A7', borderRadius: '5px', fontSize: '14px' }} />
                                    </div>
                                </div>
                            );
                        })}

                        <div style={{ position: 'sticky', bottom: '20px', zIndex: 100, display: 'flex', gap: '10px', padding: '15px', background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', borderRadius: '20px', boxShadow: '0 -5px 25px rgba(0,0,0,0.15)', border: '2px solid #FF6B9D', flexWrap: 'wrap' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, minWidth: '140px', padding: '15px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '16px', cursor: isGeneratingImages ? 'not-allowed' : 'pointer' }}>
                                {isGeneratingImages ? '⏳ ĐANG VẼ ẢNH...' : '🖨️ XUẤT PDF & IN'}
                            </button>
                            <button
                                onClick={() => { forceStopRef.current = false; generateImages(worksheet); }}
                                disabled={isGeneratingImages}
                                style={{ flex: 1, minWidth: '120px', padding: '15px', background: isGeneratingImages ? '#ccc' : '#FF6B9D', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px', cursor: isGeneratingImages ? 'not-allowed' : 'pointer' }}
                            >
                                🎨 Vẽ lại ảnh
                            </button>
                            <button onClick={() => {
                                const newQ: WorksheetQuestion = { id: Date.now().toString(), type: 'essay', question: 'Câu hỏi mới...' };
                                setWorksheet({ ...worksheet, questions: [...worksheet.questions, newQ] });
                            }} style={{ flex: 1, minWidth: '100px', padding: '15px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '15px' }}>➕ Thêm câu</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
