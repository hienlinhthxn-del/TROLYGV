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
}

interface Worksheet {
    id?: string;
    title: string;
    subject: string;
    questions: WorksheetQuestion[];
    lastModified?: string;
}

const WorksheetCreator: React.FC = () => {
    const [topic, setTopic] = useState('');
    const [subject, setSubject] = useState('Toán');
    const [sampleImage, setSampleImage] = useState<string | null>(null);
    const [history, setHistory] = useState<Worksheet[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // Hạng mục cấu trúc câu hỏi chi tiết
    const [config, setConfig] = useState({
        mcq: 3,
        tf: 2,
        fill: 1,
        match: 1,
        essay: 2,
        arrange: 1
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
            setProgress('Câu hỏi đã xong! Đang vẽ hình minh họa...');
            await generateImages(content);
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
        const updatedQuestions = [...ws.questions];

        try {
            for (let i = 0; i < updatedQuestions.length; i++) {
                if (forceStopRef.current) throw new Error('Yêu cầu đã bị dừng.');
                const q = updatedQuestions[i];
                if (q.imagePrompt || q.question) {
                    const promptToUse = q.imagePrompt || q.question;
                    if (i > 0) {
                        setProgress(`Đang chuẩn bị vẽ câu ${i + 1}...`);
                        await new Promise(resolve => setTimeout(resolve, 800));
                    }
                    if (forceStopRef.current) throw new Error('Yêu cầu đã bị dừng.');
                    setProgress(`🎨 Đang vẽ minh họa câu ${i + 1}/${updatedQuestions.length}...`);
                    try {
                        const imageUrl = await geminiService.generateImage(promptToUse);
                        updatedQuestions[i].imageUrl = imageUrl;
                        setWorksheet(prev => prev ? { ...prev, questions: [...updatedQuestions] } : null);
                    } catch (error) {
                        console.error(`Lỗi tạo hình ảnh cho câu ${i + 1}:`, error);
                    }
                }
            }
            setProgress('Hoàn thành!');
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
                                    { id: 'mcq', label: 'Trắc nghiệm', color: '#4CAF50' },
                                    { id: 'tf', label: 'Đúng / Sai', color: '#2196F3' },
                                    { id: 'fill', label: 'Điền khuyết (....)', color: '#FF9800' },
                                    { id: 'match', label: 'Nối cột', color: '#9C27B0' },
                                    { id: 'essay', label: 'Tự luận / Tô màu', color: '#F44336' },
                                    { id: 'arrange', label: 'Sắp xếp câu', color: '#673AB7' }
                                ].map(type => (
                                    <div key={type.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', background: '#F5F5F5', borderRadius: '8px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{type.label}</span>
                                        <input type="number" min="0" value={config[type.id as keyof typeof config]} onChange={(e) => setConfig({ ...config, [type.id]: parseInt(e.target.value) || 0 })} style={{ width: '45px', padding: '5px', borderRadius: '5px', border: `2px solid ${type.color}`, textAlign: 'center' }} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleGenerate} disabled={isGenerating} style={{ width: '100%', padding: '15px', background: '#FF6B9D', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,107,157,0.4)' }}>
                            {isGenerating ? '⏳ AI ĐANG LÀM VIỆC...' : '✨ BẮT ĐẦU SOẠN PHIẾU'}
                        </button>
                    </div>
                )}

                {progress && (
                    <div style={{ margin: '20px 0', padding: '15px', background: '#E3F2FD', borderRadius: '12px', textAlign: 'center', color: '#1976D2', fontWeight: 'bold', border: '1px solid #BBDEFB' }}>
                        {progress}
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
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button onClick={() => saveToHistory(worksheet)} style={{ padding: '8px 15px', background: '#FF9800', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Lưu Phiếu</button>
                                <button onClick={handleExportJSON} style={{ padding: '8px 15px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>📄 Xuất JSON</button>
                                <button onClick={handleExportDOCX} style={{ padding: '8px 15px', background: '#3F51B5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>📝 Xuất DOCX</button>
                                <button onClick={() => setWorksheet(null)} style={{ padding: '8px 15px', background: '#f0f0f0', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Quay lại</button>
                            </div>
                        </div>

                        {worksheet.questions.map((q, index) => (
                            <div key={index} style={{ padding: '20px', background: '#f9f9f9', borderRadius: '15px', marginBottom: '20px', border: '1px solid #eee', position: 'relative' }}>
                                <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                                    <button onClick={() => {
                                        const updated = worksheet.questions.filter((_, i) => i !== index);
                                        setWorksheet({ ...worksheet, questions: updated });
                                    }} style={{ background: '#FF5252', color: 'white', border: 'none', borderRadius: '5px', width: '30px', height: '30px', cursor: 'pointer' }}>🗑️</button>
                                </div>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                    <span style={{ fontWeight: 'bold' }}>Câu {index + 1}:</span>
                                    <textarea value={q.question} onChange={(e) => {
                                        const updated = [...worksheet.questions];
                                        updated[index].question = e.target.value;
                                        setWorksheet({ ...worksheet, questions: updated });
                                    }} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '15px', minHeight: '50px' }} />
                                </div>
                                <div style={{ textAlign: 'center', margin: '15px 0' }}>
                                    {q.imageUrl ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img src={q.imageUrl} style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '10px' }} />
                                            <div style={{ position: 'absolute', top: '10px', right: '10px', display: 'flex', gap: '5px' }}>
                                                <button onClick={() => handleRetryImage(index)} title="Vẽ lại ảnh AI" style={{ background: 'white', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}>🔄</button>
                                                <label title="Tải ảnh từ máy tính" style={{ background: 'white', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('Thầy Cô muốn xóa ảnh của câu này?')) {
                                                            const updated = [...worksheet.questions];
                                                            updated[index].imageUrl = undefined;
                                                            setWorksheet({ ...worksheet, questions: updated });
                                                        }
                                                    }}
                                                    title="Xóa ảnh"
                                                    style={{ background: '#FF5252', color: 'white', border: 'none', borderRadius: '50%', width: '35px', height: '35px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' }}
                                                >
                                                    ❌
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ height: '100px', background: '#eee', border: '2px dashed #ccc', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={() => handleRetryImage(index)}>
                                            {isGeneratingImages ? '⏳ Đang vẽ...' : 'Chưa có ảnh (Nhấn để vẽ AI)'}
                                        </div>
                                    )}
                                </div>
                                {q.options && q.options.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '15px' }}>
                                        {q.options.map((opt, i) => (
                                            <div key={i} style={{ display: 'flex', gap: '5px' }}>
                                                <span style={{ fontWeight: 'bold' }}>{String.fromCharCode(65 + i)}.</span>
                                                <input type="text" value={opt} onChange={(e) => {
                                                    const updated = [...worksheet.questions];
                                                    if (updated[index].options) {
                                                        updated[index].options![i] = e.target.value;
                                                        setWorksheet({ ...worksheet, questions: updated });
                                                    }
                                                }} style={{ flex: 1, padding: '8px', border: '1px solid #ddd', borderRadius: '5px' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ background: '#E8F5E9', padding: '12px', borderRadius: '10px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#2E7D32' }}>Đáp án:</label>
                                    <input type="text" value={q.answer || ''} onChange={(e) => {
                                        const updated = [...worksheet.questions];
                                        updated[index].answer = e.target.value;
                                        setWorksheet({ ...worksheet, questions: updated });
                                    }} style={{ width: '100%', padding: '8px', border: '1px solid #A5D6A7', borderRadius: '5px' }} />
                                </div>
                            </div>
                        ))}

                        <div style={{ position: 'sticky', bottom: '20px', zIndex: 100, display: 'flex', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderRadius: '20px', boxShadow: '0 -5px 25px rgba(0,0,0,0.15)', border: '2px solid #FF6B9D' }}>
                            <button onClick={handleExportPDF} disabled={isGeneratingImages} style={{ flex: 2, padding: '15px', background: isGeneratingImages ? '#ccc' : '#4CAF50', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold', fontSize: '18px', cursor: 'pointer' }}>
                                {isGeneratingImages ? '⏳ ĐANG VẼ ẢNH...' : '🖨️ XUẤT PDF & IN'}
                            </button>
                            <button onClick={() => {
                                const newQ: WorksheetQuestion = { id: Date.now().toString(), type: 'essay', question: 'Câu hỏi mới...' };
                                setWorksheet({ ...worksheet, questions: [...worksheet.questions, newQ] });
                            }} style={{ flex: 1, padding: '15px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 'bold' }}>➕ Thêm câu</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorksheetCreator;
