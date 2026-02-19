import React, { useState, useEffect, useRef } from 'react';
import { geminiService } from '../services/geminiService';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [allGeminiKeys, setAllGeminiKeys] = useState<string[]>([]);
    const [openaiKey, setOpenaiKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'empty'>('checking');
    const [keySource, setKeySource] = useState<string>('None');
    const [showKey, setShowKey] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            checkCurrentKey();
        }
    }, [isOpen]);

    const checkCurrentKey = () => {
        try {
            setStatus('checking');

            // Tải danh sách key Gemini
            let geminiKeys: string[] = [];
            const manualKeysStr = localStorage.getItem('manually_entered_api_keys');
            if (manualKeysStr) {
                try {
                    const parsed = JSON.parse(manualKeysStr);
                    if (Array.isArray(parsed)) geminiKeys = parsed;
                } catch (e) { }
            }

            // Migration: Nếu chưa có danh sách nhưng có key cũ đơn lẻ
            const savedSingleKey = localStorage.getItem('manually_entered_api_key');
            if (savedSingleKey && !geminiKeys.includes(savedSingleKey)) {
                geminiKeys.push(savedSingleKey);
            }

            setAllGeminiKeys(geminiKeys);

            const savedOpen = localStorage.getItem('openai_api_key');
            const savedAnth = localStorage.getItem('anthropic_api_key');

            let source = 'None';
            try {
                source = geminiService.getApiKeySource();
            } catch (e) {
                console.error("Error getting key source:", e);
            }
            setKeySource(source);

            if (geminiKeys.length > 0) {
                setStatus('valid');
            } else {
                setStatus('empty');
            }

            setOpenaiKey(savedOpen || '');
            setAnthropicKey(savedAnth || '');
        } catch (error) {
            console.error("Critical error in checkCurrentKey:", error);
            setStatus('empty');
        }
    };

    const handleAddKey = () => {
        const cleanKey = apiKeyInput.trim().replace(/["']/g, '');
        if (!cleanKey) return;

        if (!cleanKey.startsWith('AIza') || cleanKey.length < 30) {
            if (!confirm('API Key Gemini có vẻ không đúng định dạng. Vẫn thêm?')) return;
        }

        if (allGeminiKeys.includes(cleanKey)) {
            alert('Key này đã tồn tại trong danh sách!');
            return;
        }

        const newKeys = [...allGeminiKeys, cleanKey];
        setAllGeminiKeys(newKeys);
        setApiKeyInput('');
    };

    const removeKey = (index: number) => {
        const newKeys = allGeminiKeys.filter((_, i) => i !== index);
        setAllGeminiKeys(newKeys);
    };

    const handleTestKey = async (testKeyOverride?: string) => {
        const keyToTest = (testKeyOverride || apiKeyInput).trim().replace(/["']/g, '');
        if (!keyToTest) {
            alert('Vui lòng nhập API Key để kiểm tra!');
            return;
        }

        setIsTesting(true);
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToTest}`
            );

            if (response.ok) {
                const data = await response.json();
                if (data.models && data.models.length > 0) {
                    alert(`✅ API Key Hợp Lệ!\n\nĐã nhận diện thành công ${data.models.length} model từ Google.`);
                } else {
                    alert('⚠️ Key nhận phản hồi nhưng không thấy model khả dụng.');
                }
            } else {
                const data = await response.json();
                alert(`❌ Lỗi: ${data.error?.message || 'Không thể xác thực key'}`);
            }
        } catch (error: any) {
            alert(`❌ Lỗi kết nối: ${error.message}`);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveAll = () => {
        // Lưu danh sách key Gemini
        localStorage.setItem('manually_entered_api_keys', JSON.stringify(allGeminiKeys));

        // Cập nhật key chính (để tương thích ngược)
        if (allGeminiKeys.length > 0) {
            localStorage.setItem('manually_entered_api_key', allGeminiKeys[0]);
        } else {
            localStorage.removeItem('manually_entered_api_key');
        }

        if (openaiKey.trim()) localStorage.setItem('openai_api_key', openaiKey.trim());
        else localStorage.removeItem('openai_api_key');

        if (anthropicKey.trim()) localStorage.setItem('anthropic_api_key', anthropicKey.trim());
        else localStorage.removeItem('anthropic_api_key');

        alert('✅ Đã lưu cấu hình API Key thành công!');
        window.location.reload();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <i className="fas fa-key text-white text-lg"></i>
                        </div>
                        <div>
                            <h2 className="text-white font-black text-lg">Danh sách API Key</h2>
                            <p className="text-white/70 text-xs">Cấu hình xoay vòng mã Gemini AI</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Status Summary */}
                    <div className={`p-4 rounded-2xl border-2 ${allGeminiKeys.length > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <div className="flex items-center space-x-3">
                            <i className={`fas ${allGeminiKeys.length > 0 ? 'fa-shield-check text-emerald-500' : 'fa-exclamation-triangle text-amber-500'} text-2xl`}></i>
                            <div className="flex-1">
                                <p className={`font-bold text-sm ${allGeminiKeys.length > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                                    {allGeminiKeys.length > 0
                                        ? `✅ Đã có ${allGeminiKeys.length} mã cá nhân. Hệ thống sẽ tự xoay vòng khi hết quota.`
                                        : '⚠️ Chưa có mã cá nhân. Vui lòng thêm key để ổn định hơn.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Input to Add Key */}
                    <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                            Thêm API Key Gemini Mới
                        </label>
                        <div className="flex space-x-2">
                            <div className="relative flex-1">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={apiKeyInput}
                                    onChange={(e) => setApiKeyInput(e.target.value)}
                                    placeholder="Dán mã AIza... vào đây"
                                    className="w-full px-4 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-xs font-mono outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"
                                >
                                    <i className={`fas ${showKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                </button>
                            </div>
                            <button
                                onClick={handleAddKey}
                                disabled={!apiKeyInput.trim()}
                                className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all font-bold text-xs shadow-lg shadow-indigo-100"
                            >
                                <i className="fas fa-plus"></i> Thêm
                            </button>
                        </div>
                        <div className="flex justify-between items-center px-1">
                            <button onClick={() => handleTestKey()} className="text-[10px] text-indigo-600 font-bold hover:underline">
                                Thử Key này trước khi thêm?
                            </button>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-[10px] text-slate-400 underline">Lấy key ở đâu?</a>
                        </div>
                    </div>

                    {/* Keys List */}
                    {allGeminiKeys.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">
                                Danh sách các key đã nạp ({allGeminiKeys.length})
                            </label>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {allGeminiKeys.map((key, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm group hover:border-indigo-200 transition-all">
                                        <div className="flex items-center space-x-3 overflow-hidden">
                                            <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                                                <span className="text-[10px] font-bold text-slate-500">{index + 1}</span>
                                            </div>
                                            <span className="text-xs font-mono text-slate-400 truncate max-w-[150px]">
                                                {key.substring(0, 8)}...{key.substring(key.length - 4)}
                                            </span>
                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[8px] font-black rounded uppercase tracking-tighter">Gemini</span>
                                        </div>
                                        <div className="flex space-x-1">
                                            <button
                                                onClick={() => handleTestKey(key)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors"
                                                title="Thử key này"
                                            >
                                                <i className="fas fa-vial text-xs"></i>
                                            </button>
                                            <button
                                                onClick={() => removeKey(index)}
                                                className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                                                title="Xóa"
                                            >
                                                <i className="fas fa-trash-alt text-xs"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fallback Keys */}
                    <div className="space-y-3 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Mã dự phòng khác (OpenAI/Anthropic)</label>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold text-slate-400 ml-1">OPENAI</span>
                                <input type="password" value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono outline-none focus:border-indigo-300" />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[8px] font-bold text-slate-400 ml-1">ANTHROPIC</span>
                                <input type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono outline-none focus:border-indigo-300" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-6 bg-white border-t border-slate-100 shrink-0">
                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={handleSaveAll}
                            className="w-full py-3.5 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center space-x-2"
                        >
                            <i className="fas fa-save shadow-sm"></i>
                            <span>LƯU CẤU HÌNH & TẢI LẠI</span>
                        </button>
                        <p className="text-[10px] text-center text-slate-400 italic">
                            Hệ thống sẽ thử từng key cho đến khi thành công. Khuyên dùng nạp 3-5 key để ổn định.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApiKeySettings;
