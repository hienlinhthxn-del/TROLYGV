
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DOCUMENT_TEMPLATES } from '../constants';
import { geminiService } from '../services/geminiService';
// @ts-ignore
import html2pdf from 'html2pdf.js';
// @ts-ignore
import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';

interface WorkspaceProps {
  initialContent: string;
  onSave: (content: string) => void;
  onSaveToCloud?: (name: string, content: string) => void;
}

const Workspace: React.FC<WorkspaceProps> = ({ initialContent, onSave, onSaveToCloud }) => {
  const [content, setContent] = useState(initialContent);
  const [isSaved, setIsSaved] = useState(true);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [fileName, setFileName] = useState(`Tai_lieu_Giao_vien_${new Date().toISOString().slice(0,10)}`);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [isSavingToCloud, setIsSavingToCloud] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<{
    tone: string,
    complexity: string,
    keywords: string[],
    suggestion: string
  } | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(initialContent);
    setIsSaved(true);
  }, [initialContent]);

  useEffect(() => {
    if (content !== initialContent) {
      setIsSaved(false);
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      autoSaveTimeoutRef.current = setTimeout(() => {
        handleAutoSave();
      }, 2000);
    }
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [content]);

  const handleAutoSave = () => {
    if (content.trim() === initialContent.trim()) return;
    setIsAutoSaving(true);
    setTimeout(() => {
      onSave(content);
      setIsSaved(true);
      setIsAutoSaving(false);
    }, 500);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowTemplates(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleManualSave = () => {
    onSave(content);
    setIsSaved(true);
    triggerToast("Đã lưu bản thảo thành công");
  };

  const handleCloudSave = async () => {
    if (!content.trim() || !onSaveToCloud) return;
    setIsSavingToCloud(true);
    setTimeout(() => {
      onSaveToCloud(fileName, content);
      setIsSavingToCloud(false);
      triggerToast("Đã đồng bộ lên Cloud thành công");
    }, 1200);
  };

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  const handleCopy = () => {
    if (!content.trim()) return;
    navigator.clipboard.writeText(content).then(() => {
      triggerToast("Đã sao chép nội dung");
    });
  };

  const handleExportDOCX = async () => {
    if (!content.trim()) return;
    setIsExportingDocx(true);
    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Tai_lieu';
    const paragraphs = content.split('\n').map(text => {
      return new Paragraph({
        children: [new TextRun({ text: text.trim(), size: 24 })],
        spacing: { after: 200 },
      });
    });

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ text: safeFileName, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
          ...paragraphs,
          new Paragraph({
            spacing: { before: 800 },
            children: [new TextRun({ text: `Xuất bản từ EduAssist AI vào ngày ${new Date().toLocaleDateString('vi-VN')}`, italics: true, size: 18, color: "94a3b8" })],
            alignment: AlignmentType.RIGHT,
          })
        ],
      }],
    });

    try {
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeFileName}.docx`;
      link.click();
      URL.revokeObjectURL(url);
      triggerToast("Đã xuất tệp Word (.docx)");
    } catch (error) {
      triggerToast("Lỗi khi xuất DOCX");
    } finally {
      setIsExportingDocx(false);
    }
  };

  const handleExportPDF = async () => {
    if (!content.trim()) return;
    setIsExportingPdf(true);
    const element = document.createElement('div');
    element.style.padding = '40px';
    element.style.fontFamily = "'Inter', sans-serif";
    element.style.lineHeight = '1.6';
    element.style.color = '#1e293b';
    element.style.backgroundColor = '#ffffff';

    const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Tai_lieu';
    element.innerHTML = `
      <div style="text-align: center; margin-bottom: 40px; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 20px;">
        <h1 style="font-size: 24px; margin: 0; color: #0f172a; text-transform: uppercase;">${safeFileName}</h1>
      </div>
      <div style="white-space: pre-wrap; font-size: 16px;">${content}</div>
    `;

    // Fix: cast 'type' to a literal type to satisfy Html2PdfOptions requirements
    const opt = {
      margin: 10,
      filename: `${safeFileName}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
    };

    try {
      await html2pdf().set(opt).from(element).save();
      triggerToast("Đã xuất tệp PDF thành công");
    } catch (error) {
      triggerToast("Lỗi khi xuất PDF");
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownload = () => {
    if (!content.trim()) return;
    setIsDownloading(true);
    setTimeout(() => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeFileName = fileName.replace(/[<>:"/\\|?*]/g, '').trim() || 'Tai_lieu';
      link.download = `${safeFileName}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setIsDownloading(false);
      triggerToast(`Đã tải về máy (.txt)`);
    }, 600);
  };

  const handleClear = () => {
    if (window.confirm('Xóa toàn bộ nội dung hiện tại?')) {
      setContent('');
      setAiInsight(null);
    }
  };

  const applyTemplate = (templateContent: string, templateName: string) => {
    if (content.trim() && !window.confirm(`Ghi đè nội dung hiện tại bằng mẫu "${templateName}"?`)) return;
    setContent(templateContent);
    setShowTemplates(false);
    setAiInsight(null);
    triggerToast(`Đã áp dụng mẫu: ${templateName}`);
  };

  const metrics = useMemo(() => {
    const text = content.trim();
    if (!text) return { words: 0, chars: 0, sentences: 0, paragraphs: 0, readTime: 0, speakTime: 0, level: 'Chưa có' };
    const words = text.split(/\s+/).filter(x => x).length;
    const chars = content.length;
    const sentences = text.split(/[.!?]+/).filter(x => x.trim()).length;
    const paragraphs = text.split(/\n\s*\n/).filter(x => x.trim()).length;
    const avgSentenceLength = words / (sentences || 1);
    let level = 'Trung bình';
    if (avgSentenceLength < 12) level = 'Dễ hiểu (Tiểu học)';
    else if (avgSentenceLength > 25) level = 'Phức tạp (Nghiên cứu)';
    const readTime = Math.ceil(words / 200);
    const speakTime = Math.ceil(words / 130);
    return { words, chars, sentences, paragraphs, readTime, speakTime, level };
  }, [content]);

  const handleAiAnalysis = async () => {
    if (!content.trim() || aiAnalyzing) return;
    setAiAnalyzing(true);
    setAiInsight(null);
    try {
      const prompt = `Phân tích văn bản giáo dục sau và trả về JSON { "tone": string, "complexity": string, "keywords": string[], "suggestion": string }. Đảm bảo các giá trị bằng tiếng Việt. Văn bản: "${content.substring(0, 1500)}"`;
      const stream = geminiService.sendMessageStream(prompt);
      let fullText = '';
      for await (const chunk of stream) fullText += chunk.text;
      const cleanJson = fullText.replace(/```json|```/g, '').trim();
      setAiInsight(JSON.parse(cleanJson));
    } catch (err) {
      triggerToast("Lỗi phân tích AI");
    } finally {
      setAiAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-in fade-in duration-500 relative">
      {showToast && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2 duration-300">
           <div className="bg-slate-900/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-3 border border-white/10">
              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                <i className="fas fa-check text-[10px]"></i>
              </div>
              <span className="text-[11px] font-black uppercase tracking-widest">{toastMsg}</span>
           </div>
        </div>
      )}

      {showAnalysis && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[2px]" onClick={() => setShowAnalysis(false)}></div>
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-white border-l border-slate-200 shadow-2xl z-50 p-7 flex flex-col animate-in slide-in-from-right duration-500 rounded-l-[40px]">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
                  <i className="fas fa-chart-pie"></i>
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Phân tích chuyên sâu</h3>
              </div>
              <button onClick={() => setShowAnalysis(false)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-all">
                 <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pr-2">
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Số từ</p><p className="text-2xl font-black text-slate-800">{metrics.words}</p></div>
                 <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100"><p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Đọc (phút)</p><p className="text-2xl font-black text-indigo-600">~{metrics.readTime}</p></div>
              </div>

              <div className="p-5 bg-white rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Trình độ</span>
                  <span className="px-2 py-1 bg-amber-50 text-amber-700 text-[9px] font-black rounded-lg">{metrics.level}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase">Câu</span>
                  <span className="text-xs font-black text-slate-800">{metrics.sentences}</span>
                </div>
              </div>

              <button 
                onClick={handleAiAnalysis} 
                disabled={aiAnalyzing || !content.trim()} 
                className={`w-full p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl transition-all ${aiAnalyzing ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
              >
                 {aiAnalyzing ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-wand-magic-sparkles mr-2"></i>}
                 {aiAnalyzing ? 'Đang phân tích...' : 'Bắt đầu Phân tích AI'}
              </button>

              {aiInsight && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                  <div className="p-5 bg-emerald-50 border border-emerald-100 rounded-[28px] space-y-3">
                    <div className="flex items-center space-x-2">
                      <i className="fas fa-microphone-lines text-emerald-600 text-xs"></i>
                      <p className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Sắc thái văn bản</p>
                    </div>
                    <p className="text-[13px] font-bold text-emerald-900 leading-relaxed">{aiInsight.tone}</p>
                  </div>

                  <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-[28px] space-y-3">
                    <div className="flex items-center space-x-2">
                      <i className="fas fa-brain text-indigo-600 text-xs"></i>
                      <p className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Độ phức tạp</p>
                    </div>
                    <p className="text-[13px] font-bold text-indigo-900 leading-relaxed">{aiInsight.complexity}</p>
                  </div>

                  <div className="p-5 bg-white border border-slate-100 rounded-[28px] space-y-3">
                    <div className="flex items-center space-x-2">
                      <i className="fas fa-tags text-slate-400 text-xs"></i>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Từ khóa chính</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {aiInsight.keywords.map((kw, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold">#{kw}</span>
                      ))}
                    </div>
                  </div>

                  <div className="p-6 bg-slate-900 rounded-[32px] text-white shadow-lg space-y-3">
                     <p className="text-[9px] font-black uppercase tracking-widest text-indigo-400">Gợi ý từ AI</p>
                     <p className="text-[12px] leading-relaxed font-medium">"{aiInsight.suggestion}"</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-white p-3 rounded-2xl border border-slate-200 shadow-sm z-10 space-y-3 md:space-y-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={dropdownRef}>
            <button onClick={() => setShowTemplates(!showTemplates)} className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${showTemplates ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'text-indigo-600 bg-indigo-50 border-indigo-100'}`}>
              <i className="fas fa-file-invoice"></i><span>Mẫu</span><i className={`fas fa-chevron-${showTemplates ? 'up' : 'down'} ml-1 text-[8px]`}></i>
            </button>
            {showTemplates && (
              <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                {DOCUMENT_TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t.content, t.name)} className="w-full flex items-center space-x-3 px-4 py-3 hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition-colors">
                    <i className={`fas ${t.icon} w-5`}></i><span>{t.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleManualSave} disabled={isSaved} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSaved ? 'text-slate-300 bg-slate-50 border-transparent' : 'text-emerald-600 bg-emerald-50 border-emerald-100 border'}`}>
            <i className={`fas ${isSaved ? 'fa-check-double' : 'fa-save'} mr-2`}></i>{isSaved ? 'Đã lưu' : 'Lưu bản thảo'}
          </button>
          <button onClick={handleCloudSave} disabled={isSavingToCloud || !content.trim()} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 border-indigo-100 border transition-all">
            <i className={`fas ${isSavingToCloud ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} mr-2`}></i>Đồng bộ Cloud
          </button>
          <button onClick={() => setShowAnalysis(!showAnalysis)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 bg-slate-50 border-slate-100 border transition-all">
            <i className="fas fa-wand-magic mr-2"></i>Phân tích AI
          </button>
          <button onClick={handleExportPDF} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-600 bg-rose-50 border-rose-100 border transition-all"><i className="fas fa-file-pdf mr-2"></i>PDF</button>
          <button onClick={handleExportDOCX} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 border-blue-100 border transition-all"><i className="fas fa-file-word mr-2"></i>Word</button>
        </div>

        <div className="flex items-center space-x-2 bg-slate-50 p-1 rounded-xl border border-slate-100 focus-within:bg-white transition-all">
          <input type="text" value={fileName} onChange={(e) => setFileName(e.target.value)} className="bg-transparent border-0 focus:ring-0 text-[11px] font-bold text-slate-600 py-1.5 pl-3 w-40" />
          <button onClick={handleDownload} disabled={isDownloading} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md">
            <i className={`fas ${isDownloading ? 'fa-spinner fa-spin' : 'fa-download'}`}></i>
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-inner overflow-hidden flex flex-col relative group">
        <div className="p-8 md:p-12 flex-1 relative bg-[url('https://www.transparenttextures.com/patterns/pinstriped-suit.png')]">
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Nhập nội dung bài giảng, đề thi hoặc nhận xét tại đây..."
            className="w-full h-full bg-transparent border-0 focus:ring-0 resize-none text-[15.5px] leading-relaxed text-slate-700 font-medium placeholder-slate-300 custom-scrollbar"
            spellCheck={false}
          />
        </div>
        {!content && (
           <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-20">
              <i className="fas fa-feather-pointed text-6xl mb-4 text-slate-300"></i>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">Đang chờ ý tưởng của Thầy Cô...</p>
           </div>
        )}
      </div>

      <div className="p-4 bg-white/50 rounded-2xl border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-3 sm:space-y-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
             <div className={`w-2 h-2 rounded-full ${isAutoSaving ? 'bg-indigo-500 animate-pulse' : isSaved ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
               {isAutoSaving ? 'Đang lưu tự động...' : isSaved ? 'Đã lưu mọi thay đổi' : 'Có thay đổi chưa lưu'}
             </span>
          </div>
          <div className="hidden sm:block w-px h-3 bg-slate-200"></div>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic">
            {metrics.chars} ký tự • {metrics.words} từ
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-2 py-1 bg-indigo-50 rounded-lg">
            Sửa đổi lần cuối: {new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
};

export default Workspace;
