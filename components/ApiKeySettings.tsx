import React, { useState, useEffect } from 'react';

interface ApiKeySettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

const ApiKeySettings: React.FC<ApiKeySettingsProps> = ({ isOpen, onClose }) => {
    const [apiKey, setApiKey] = useState('');
    const [openaiKey, setOpenaiKey] = useState('');
    const [anthropicKey, setAnthropicKey] = useState('');
    const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'empty'>('checking');
    const [showKey, setShowKey] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    useEffect(() => {
        if (isOpen) {
            checkCurrentKey();
        }
    }, [isOpen]);

    const checkCurrentKey = () => {
        setStatus('checking');
        const savedKey = localStorage.getItem('manually_entered_api_key');
        const savedOpen = localStorage.getItem('openai_api_key');
        const savedAnth = localStorage.getItem('anthropic_api_key');
        const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;

        if (savedKey && savedKey.startsWith('AIza') && savedKey.length > 30) {
            setApiKey(savedKey);
            setStatus('valid');
        } else if (envKey && envKey.startsWith('AIza') && envKey.length > 30 && envKey !== 'YOUR_NEW_API_KEY_HERE') {
            setApiKey(envKey);
            setStatus('valid');
        } else {
            setApiKey('');
            setStatus('empty');
        }

        setOpenaiKey(savedOpen || '');
        setAnthropicKey(savedAnth || '');
    };

    const handleTestKey = async () => {
        if (!apiKey.trim()) {
            alert('Vui lòng nhập API Key!');
            return;
        }

        setIsTesting(true);
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: 'Trả lời ngắn gọn: 1+1=?' }] }]
                    })
                }
            );

            if (response.ok) {
                setStatus('valid');
                alert('✅ API Key hợp lệ! Thầy/Cô có thể lưu lại.');
            } else {
                const error = await response.json();
                setStatus('invalid');
                alert(`❌ API Key không hợp lệ: ${error.error?.message || 'Lỗi không xác định'}`);
            }
        } catch (error: any) {
            setStatus('invalid');
            alert(`❌ Lỗi kết nối: ${error.message}`);
        } finally {
            setIsTesting(false);
        }
    };

    const handleSaveKey = () => {
        // Save any provided keys (Gemini / OpenAI / Anthropic)
        if (apiKey.trim()) {
            if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
                if (!confirm('API Key Gemini có vẻ không đúng định dạng. Vẫn lưu?')) {
                    return;
                }
            }
            localStorage.setItem('manually_entered_api_key', apiKey.trim());
            setStatus('valid');
        }

        if (openaiKey.trim()) {
            localStorage.setItem('openai_api_key', openaiKey.trim());
        }
        if (anthropicKey.trim()) {
            localStorage.setItem('anthropic_api_key', anthropicKey.trim());
        }

        if (confirm('✅ Đã lưu API Key thành công!\n\nỨng dụng cần tải lại để áp dụng Key mới ngay lập tức. Bạn có muốn tải lại trang không?')) {
            window.location.reload();
        }
    };

    const handleClearKey = () => {
        if (window.confirm('Xóa API Key đã lưu?')) {
            localStorage.removeItem('manually_entered_api_key');
            // keep fallback keys intact unless user clears them explicitly
            setApiKey('');
            setStatus('empty');
            alert('Đã xóa API Key. Hệ thống sẽ sử dụng key mặc định (nếu có).');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                            <i className="fas fa-key text-white text-lg"></i>
                        </div>
                        <div>
                            <h2 className="text-white font-black text-lg">Cài đặt API Key</h2>
                            <p className="text-white/70 text-xs">Cấu hình kết nối Google Gemini AI</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                        <i className="fas fa-times text-xl"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Status */}
                    <div className={`p-4 rounded-2xl border-2 ${status === 'valid' ? 'bg-emerald-50 border-emerald-200' :
                        status === 'invalid' ? 'bg-rose-50 border-rose-200' :
                            status === 'checking' ? 'bg-slate-50 border-slate-200' :
                                'bg-amber-50 border-amber-200'
                        }`}>
                        <div className="flex items-center space-x-3">
                            <i className={`fas ${status === 'valid' ? 'fa-check-circle text-emerald-500' :
                                status === 'invalid' ? 'fa-times-circle text-rose-500' :
                                    status === 'checking' ? 'fa-spinner fa-spin text-slate-400' :
                                        'fa-exclamation-triangle text-amber-500'
                                } text-2xl`}></i>
                            <div>
                                <p className={`font-bold text-sm ${status === 'valid' ? 'text-emerald-700' :
                                    status === 'invalid' ? 'text-rose-700' :
                                        status === 'checking' ? 'text-slate-600' :
                                            'text-amber-700'
                                    }`}>
                                    {status === 'valid' && 'API Key đang hoạt động'}
                                    {status === 'invalid' && 'API Key không hợp lệ'}
                                    {status === 'checking' && 'Đang kiểm tra...'}
                                    {status === 'empty' && 'Chưa có API Key'}
                                </p>
                                <p className="text-xs text-slate-500">
                                    {status === 'valid' && 'Các tính năng AI sẵn sàng sử dụng'}
                                    {status === 'invalid' && 'Vui lòng nhập key mới bên dưới'}
                                    {status === 'checking' && 'Vui lòng chờ...'}
                                    {status === 'empty' && 'Nhập API Key để sử dụng AI'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Input */}
                    <div className="space-y-2">
                        <label className="text-xs font-black text-slate-600 uppercase tracking-widest">
                            Google Gemini API Key
                        </label>
                        <div className="relative">
                            <input
                                type={showKey ? 'text' : 'password'}
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="AIza..."
                                className="w-full px-4 py-3 pr-12 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-mono focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setShowKey(!showKey)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <i className={`fas ${showKey ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                        </div>
                        {/* OpenAI / Anthropic fallback keys */}
                        <div className="space-y-2 mt-3">
                            <label className="text-xs font-black text-slate-600 uppercase tracking-widest">OpenAI API Key (fallback)</label>
                            <input type={showKey ? 'text' : 'password'} value={openaiKey} onChange={(e) => setOpenaiKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-mono outline-none" />
                            <label className="text-xs font-black text-slate-600 uppercase tracking-widest mt-2">Anthropic API Key (fallback)</label>
                            <input type={showKey ? 'text' : 'password'} value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} placeholder="sk-..." className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-mono outline-none" />
                        </div>
                    </div>

                    {/* Help */}
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <p className="text-xs text-blue-800">
                            <i className="fas fa-info-circle mr-2"></i>
                            <strong>Hướng dẫn lấy API Key miễn phí:</strong>
                        </p>
                        <ol className="text-xs text-blue-700 mt-2 space-y-1 list-decimal list-inside">
                            <li>Truy cập <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline font-bold hover:text-blue-900">Google AI Studio</a></li>
                            <li>Đăng nhập bằng tài khoản Google</li>
                            <li>Nhấn "Create API Key" → Chọn project</li>
                            <li>Copy key và dán vào ô bên trên</li>
                        </ol>
                    </div>

                    {/* Actions */}
                    <div className="flex space-x-3">
                        <button
                            onClick={handleTestKey}
                            disabled={isTesting || !apiKey.trim()}
                            className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-50 transition-all"
                        >
                            {isTesting ? <i className="fas fa-spinner fa-spin mr-2"></i> : <i className="fas fa-vial mr-2"></i>}
                            Kiểm tra
                        </button>
                        <button
                            onClick={handleSaveKey}
                            disabled={!apiKey.trim() && !openaiKey.trim() && !anthropicKey.trim()}
                            className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200"
                        >
                            <i className="fas fa-save mr-2"></i>Lưu API Key
                        </button>
                    </div>

                    <div className="flex flex-col space-y-2">
                        {status === 'valid' && localStorage.getItem('manually_entered_api_key') && (
                            <button
                                onClick={handleClearKey}
                                className="w-full py-2 text-rose-500 text-xs font-bold hover:bg-rose-50 rounded-lg transition-colors"
                            >
                                <i className="fas fa-trash-alt mr-2"></i>Xóa API Key Gemini đã lưu
                            </button>
                        )}
                        {(localStorage.getItem('openai_api_key') || localStorage.getItem('anthropic_api_key')) && (
                            <button
                                onClick={() => {
                                    if (confirm('Xóa các API Key fallback (OpenAI/Anthropic)?')) {
                                        localStorage.removeItem('openai_api_key');
                                        localStorage.removeItem('anthropic_api_key');
                                        setOpenaiKey('');
                                        setAnthropicKey('');
                                        alert('Đã xóa key fallback.');
                                    }
                                }}
                                className="w-full py-2 text-rose-500 text-xs font-bold hover:bg-rose-50 rounded-lg transition-colors"
                            >
                                <i className="fas fa-trash-alt mr-2"></i>Xóa key fallback OpenAI/Anthropic
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ApiKeySettings;
